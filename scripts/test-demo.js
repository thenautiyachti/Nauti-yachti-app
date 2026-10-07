// Demo mode: the safety locks, and the seed's shape against the real schema.
// Runs without any database: the seed writes into a stand-in that checks every
// field name and required field against Prisma's own model of the schema.
//
//   node scripts/test-demo.js
const path = require("path");
const APP = path.join(__dirname, "..");
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log("  FAIL " + name); } };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const saved = { ...process.env };
const set = (o) => { for (const k of ["NEXT_PUBLIC_DEMO_MODE", "DEMO_DATABASE_REF", "DATABASE_URL", "DIRECT_URL", "NEXT_PUBLIC_DEMO_SITE_URL"]) delete process.env[k]; Object.assign(process.env, o); };
const demo = require(path.join(APP, "lib/demo.js"));
const LIVE = `postgresql://u:p@db.${demo.LIVE_DB_REF}.supabase.co:5432/postgres`;
const DEMO = "postgresql://u:p@db.demoref1234567890abcd.supabase.co:5432/postgres";

// --- locks
set({});
ok("off by default", !demo.isDemo());
ok("live links when off", demo.siteBase() === "https://www.thenautiyachti.com");
set({ NEXT_PUBLIC_DEMO_MODE: "1", NEXT_PUBLIC_DEMO_SITE_URL: "https://nauti-demo.vercel.app/" });
ok("demo links to itself", demo.siteBase() === "https://nauti-demo.vercel.app");
set({ DATABASE_URL: DEMO, DIRECT_URL: DEMO });
ok("refuses with no demo ref", throws(demo.assertDemoDatabase));
set({ DEMO_DATABASE_REF: demo.LIVE_DB_REF, DATABASE_URL: LIVE, DIRECT_URL: LIVE });
ok("refuses when the demo ref IS the live ref", throws(demo.assertDemoDatabase));
set({ DEMO_DATABASE_REF: "demoref1234567890abcd", DATABASE_URL: LIVE, DIRECT_URL: DEMO });
ok("refuses when either URL is live", throws(demo.assertDemoDatabase));
set({ DEMO_DATABASE_REF: "demoref1234567890abcd", DATABASE_URL: DEMO, DIRECT_URL: "postgresql://u:p@elsewhere/db" });
ok("refuses when a URL is not the demo", throws(demo.assertDemoDatabase));
set({ DEMO_DATABASE_REF: "demoref1234567890abcd", DATABASE_URL: DEMO, DIRECT_URL: DEMO });
ok("accepts the demo database", !throws(demo.assertDemoDatabase));

// --- lib/demo.js must stay browser-safe: nothing server-only in it
const src = require("fs").readFileSync(path.join(APP, "lib/demo.js"), "utf8").replace(/\/\/.*$/gm, "");
ok("lib/demo.js requires nothing", !/require\(/.test(src));

// --- the seed, against a stand-in database checked by Prisma's schema model
const { Prisma } = require("@prisma/client");
const models = Object.fromEntries(Prisma.dmmf.datamodel.models.map((m) => [m.name[0].toLowerCase() + m.name.slice(1), m]));
const problems = [], rows = {};
function check(model, data) {
  const m = models[model];
  if (!m) return problems.push(`unknown model ${model}`);
  const fields = Object.fromEntries(m.fields.map((f) => [f.name, f]));
  for (const k of Object.keys(data)) if (!fields[k]) problems.push(`${model}.${k} is not a field`);
  for (const f of m.fields) {
    if (f.kind !== "scalar" || !f.isRequired || f.hasDefaultValue || f.isUpdatedAt) continue;
    if (data[f.name] === undefined || data[f.name] === null) problems.push(`${model}.${f.name} is required`);
  }
  for (const [k, v] of Object.entries(data)) {
    const f = fields[k]; if (!f || v === null || v === undefined) continue;
    const t = { String: "string", Int: "number", Float: "number", Boolean: "boolean" }[f.type];
    if (t && typeof v !== t) problems.push(`${model}.${k} should be ${f.type}, got ${typeof v}`);
    if (f.type === "DateTime" && !(v instanceof Date)) problems.push(`${model}.${k} should be a Date`);
  }
}
let n = 0;
const stand = new Proxy({}, { get: (_, model) => ({
  deleteMany: async () => ({ count: 0 }),
  createMany: async ({ data }) => { for (const d of data) check(model, d); (rows[model] ||= []).push(...data); return { count: data.length }; },
  create: async ({ data }) => { check(model, data); const r = { id: "id" + n++, ...data }; (rows[model] ||= []).push(r); return r; },
  findMany: async () => rows[model] || [],
}) });
const { seedDemo, ALL_TABLES } = require(path.join(APP, "lib/demoSeed.js"));
const missing = Object.keys(models).filter((m) => !ALL_TABLES.includes(m));
ok("the reset wipes every table (missing: " + missing.join(", ") + ")", !missing.length);

(async () => {
  await seedDemo(stand, { log: () => {} });
  for (const p of problems.slice(0, 15)) console.log("    " + p);
  ok("every seeded row matches the schema", !problems.length);
  ok("a season of bookings", (rows.externalBooking || []).length > 30);
  ok("income rows link to their booking", (rows.ledgerEntry || []).filter((l) => l.type === "income").every((l) => l.externalBookingId));
  ok("one owed charter", (rows.externalBooking || []).some((b) => b.status === "owed"));
  ok("only example.com addresses", JSON.stringify(rows).match(/[\w.+-]+@[\w-]+\.[\w.]+/g).every((e) => e.endsWith("@example.com")));
  ok("only 555 phone numbers", (JSON.stringify(rows).match(/\(\d{3}\) \d{3}-\d{4}/g) || []).every((p) => p.includes(") 555-")));
  ok("gallery is boat-only", (rows.galleryItem || []).every((g) => g.category === "fleet"));

  set({ DEMO_DATABASE_REF: "demoref1234567890abcd", DATABASE_URL: LIVE, DIRECT_URL: LIVE });
  let refused = false;
  try { await seedDemo(stand, { log: () => {} }); } catch { refused = true; }
  ok("the seed refuses the live database", refused);

  Object.assign(process.env, saved);
  console.log(`  demo: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
