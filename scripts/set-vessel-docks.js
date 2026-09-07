// Where each boat actually lives.
//
//   node scripts/set-vessel-docks.js            what it would set
//   node scripts/set-vessel-docks.js --apply    set it
//
// The Explorer is at Pearl Bay on the east side. The Islander and the Yachti
// are three miles WSW. That gap is ten minutes at cruise, which in weather is
// the difference between reaching cover and not — so the run-home calculation
// has to know which boat is asking.
//
// Both positions were checked against the shoreline shipped with the app before
// being written: 107 and 90 yards from mapped water respectively.
const fs = require("fs");
const path = require("path");

const APP = path.resolve(__dirname, "..");
const SECRETS = "C:/Users/immex/.secrets/nauti-yachti.env";
if (fs.existsSync(SECRETS)) {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const APPLY = process.argv.includes("--apply");
if (APPLY) process.env.ALLOW_PROD_WRITES = "1";

const { PrismaClient } = require(path.join(APP, "node_modules/@prisma/client"));
const { withinReach } = require(path.join(APP, "lib/runForHome"));
const LAKE_SHAPE = require(path.join(APP, "lib/lakeConroe.json"));
const { milesBetween } = require(path.join(APP, "lib/runForHome"));
const prisma = new PrismaClient();

const LAKE = { lat: 30.3935, lon: -95.5836 };

// Pearl Bay Court, from OpenStreetMap — the STREET, so the slip itself is a
// little further toward the water. Close enough that distances are useful now;
// the owner can replace it with the exact position from the dock page.
const DOCKS = {
  explorer: { lat: 30.372740, lon: -95.546670, what: "Pearl Bay (approx — street, not the slip)" },
  islander: { lat: 30.359586, lon: -95.595360, what: "South dock (owner-supplied)" },
  yachti:   { lat: 30.359586, lon: -95.595360, what: "South dock (owner-supplied)" },
};

function yardsFromShore(p) {
  let best = Infinity;
  for (const ring of LAKE_SHAPE.rings) for (const [lon, lat] of ring) {
    const d = milesBetween(p, { lat, lon });
    if (d != null && d < best) best = d;
  }
  return Math.round(best * 1760);
}

(async () => {
  const vessels = await prisma.vessel.findMany({ orderBy: { sortOrder: "asc" } });
  console.log("");
  let bad = 0;
  for (const v of vessels) {
    const d = DOCKS[v.id];
    if (!d) { console.log("  " + v.name.padEnd(16) + "no dock configured for this vessel id"); continue; }
    const ok = withinReach({ lat: d.lat, lon: d.lon }, LAKE);
    const yards = yardsFromShore(d);
    if (!ok || yards > 1200) bad++;
    console.log("  " + v.name.padEnd(16) + d.lat.toFixed(6) + ", " + d.lon.toFixed(6) +
      "   " + String(yards).padStart(4) + " yd from shore   " + (ok ? "plausible" : "REJECTED"));
    console.log("  " + "".padEnd(16) + d.what);
    const was = v.dockLat != null ? `${v.dockLat}, ${v.dockLon}` : "unset";
    console.log("  " + "".padEnd(16) + "currently: " + was + "\n");
  }

  if (bad) {
    console.log("  " + bad + " position(s) failed the checks. Nothing written.\n");
    await prisma.$disconnect();
    return;
  }
  if (!APPLY) {
    console.log("  Dry run. Re-run with --apply to write it.\n");
    await prisma.$disconnect();
    return;
  }
  for (const v of vessels) {
    const d = DOCKS[v.id];
    if (!d) continue;
    await prisma.vessel.update({ where: { id: v.id }, data: { dockLat: d.lat, dockLon: d.lon } });
  }
  const after = await prisma.vessel.findMany({ orderBy: { sortOrder: "asc" } });
  console.log("  Written:\n");
  for (const v of after) {
    console.log("    " + v.name.padEnd(16) + (v.dockLat != null ? v.dockLat + ", " + v.dockLon : "unset"));
  }
  console.log("");
  await prisma.$disconnect();
})();
