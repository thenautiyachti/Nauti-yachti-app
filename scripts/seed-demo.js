// Fill the DEMO database with an invented season (lib/demoSeed.js).
//
//   node scripts/seed-demo.js
//
// Reads the demo's settings from C:\Users\immex\.secrets\nauti-demo.env (or the
// file in NAUTI_DEMO_SECRETS). That file holds the DEMO database's URLs and
// DEMO_DATABASE_REF -- never the live ones. The seed deletes everything before
// it writes, and lib/demo.js refuses unless both URLs point at the demo ref and
// neither points at the live database. The live secrets file is never read here.
const fs = require("fs");
const path = require("path");
const APP = path.join(__dirname, "..");
const FILE = process.env.NAUTI_DEMO_SECRETS || "C:/Users/immex/.secrets/nauti-demo.env";

if (!fs.existsSync(FILE)) {
  console.error(`  ${FILE} not found. Create it with the demo database's DATABASE_URL, DIRECT_URL and DEMO_DATABASE_REF.`);
  process.exit(1);
}
// The demo file wins over anything already in the environment, so a shell that
// happens to carry the live DATABASE_URL cannot leak into this run.
for (const line of fs.readFileSync(FILE, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
process.env.NEXT_PUBLIC_DEMO_MODE = "1";
// lib/db.js blocks writes to any Supabase database from a laptop unless this is
// set. Here the target has already been proven to be the demo (assertDemoDatabase
// runs inside lib/db.js before a client exists, and again in seedDemo).
process.env.ALLOW_PROD_WRITES = "1";

const { assertDemoDatabase } = require(path.join(APP, "lib/demo.js"));
assertDemoDatabase();
const { prisma } = require(path.join(APP, "lib/db.js"));
const { seedDemo } = require(path.join(APP, "lib/demoSeed.js"));

seedDemo(prisma)
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error("  seed failed:", e.message); await prisma.$disconnect(); process.exit(1); });
