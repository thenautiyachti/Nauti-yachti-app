// Dumps every table to JSON, one file per model, plus a manifest.
//
//   node scripts/backup-db.js [outputDir]
//
// WHY NOT pg_dump: there is no PostgreSQL install on this machine, and the
// database is 863 rows. Prisma can read all of it in a second, and JSON is
// easier to inspect and to restore selectively than a binary dump.
//
// THE MODEL LIST IS READ FROM THE SCHEMA, not typed here. Writing it by hand is
// how a backup silently misses a table: the first pass at this listed thirteen
// models from memory when the schema has twenty-two, so Packages, Coupons,
// AddOns, FuelLogs, EngineHoursLogs, BlockedDates, GiftCertificates and the
// price history would all have been absent from a file called "backup".
//
// Audio is omitted from SpeechEvent -- see below. That one field was 99.9% of
// the first backup taken with this script.
//
// Restoring is deliberately NOT automated. A restore is a decision about which
// rows are wrong, not a button -- and an automated one pointed at a live
// database is a foot-gun. The JSON is plain; read it, then write the specific
// fix.
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..");
for (const line of fs.readFileSync("C:/Users/immex/.secrets/nauti-yachti.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { prisma } = require(path.join(APP, "lib/db.js"));

// Model name in the schema -> the property Prisma exposes (first letter lowered).
const models = fs.readFileSync(path.join(APP, "prisma/schema.prisma"), "utf8")
  .split(/\r?\n/)
  .map((l) => (l.match(/^model\s+(\w+)/) || [])[1])
  .filter(Boolean);

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const out = process.argv[2] || path.join("C:/Users/immex/backups", "nauti-" + stamp);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const manifest = { takenAt: new Date().toISOString(), database: "supabase production", models: {} };
  let total = 0, missing = [];

  for (const name of models) {
    const key = name[0].toLowerCase() + name.slice(1);
    if (!prisma[key]) { missing.push(name); continue; }
    let rows = await prisma[key].findMany();
    // SpeechEvent stores the synthesized MP3 as base64 in the row. 172 of them
    // is 129MB -- so a "backup" of a 900-row database came out at 130MB, of
    // which 99.9% was audio of lines already spoken and heard. The text is the
    // part worth keeping; the audio is regenerable and nobody replays it.
    if (name === "SpeechEvent") {
      rows = rows.map((r) => ({ ...r, audioB64: r.audioB64 ? "[" + r.audioB64.length + " bytes omitted]" : null }));
    }
    fs.writeFileSync(path.join(out, name + ".json"), JSON.stringify(rows, null, 1));
    manifest.models[name] = rows.length;
    total += rows.length;
    console.log("  " + name.padEnd(26) + String(rows.length).padStart(5));
  }

  // A model in the schema that Prisma cannot read is the one thing that must not
  // pass quietly -- it means the backup is incomplete and looks complete.
  if (missing.length) {
    manifest.MISSING = missing;
    console.error("\n  NOT BACKED UP: " + missing.join(", "));
  }
  manifest.totalRows = total;
  fs.writeFileSync(path.join(out, "_manifest.json"), JSON.stringify(manifest, null, 1));

  console.log("\n  " + Object.keys(manifest.models).length + "/" + models.length + " models, " + total + " rows");
  console.log("  " + out);
  await prisma.$disconnect();
  if (missing.length) process.exit(1);
})().catch((e) => { console.error("BACKUP FAILED: " + e.message); process.exit(1); });
