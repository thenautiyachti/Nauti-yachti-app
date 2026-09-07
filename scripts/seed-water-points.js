// Seed the marinas and boat ramps around Lake Conroe from OpenStreetMap.
//
//   node scripts/seed-water-points.js            what it would add
//   node scripts/seed-water-points.js --apply    add it
//
// WHAT THIS DOES AND DOES NOT CLAIM.
//
// These coordinates are surveyed OSM data, not my recollection, and each is
// typed as OSM types it: `leisure=marina` becomes a spot, `leisure=slipway`
// becomes a ramp. That is the whole claim.
//
// NOTHING IS SEEDED AS FUEL. OSM's `amenity=fuel` nodes around this lake are
// road petrol stations at road-accessible coordinates — Shell, Exxon, a Kroger
// — not fuel docks a boat can pull up to. Seeding those as marine fuel is
// exactly the failure this was warned about the first time: a tank run down
// heading somewhere that turns out not to pump to the water. A marina MAY sell
// fuel; each note says to confirm it, and the owner can flip the kind to fuel
// once he knows.
//
// Idempotent on name, so running it twice does not double the list.
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
const prisma = new PrismaClient();

const FROM_OSM = "From OpenStreetMap (ODbL), not surveyed by us.";

// Named marinas. Kind is "spot": a landmark to navigate by, not a promise of
// anything sold there.
const MARINAS = [
  { name: "Harbour Town Marina", lat: 30.40642, lon: -95.57826 },
  { name: "Seven Coves Marina", lat: 30.40224, lon: -95.56469 },
  { name: "Palms Marina", lat: 30.41515, lon: -95.56930 },
  { name: "Waterpoint Marina", lat: 30.35892, lon: -95.59246 },
  { name: "Bentwater Marina", lat: 30.43152, lon: -95.61518 },
].map((m) => ({
  ...m, kind: "spot",
  note: `Marina. ${FROM_OSM} Confirm whether it pumps fuel before relying on it — if it does, change this to Fuel.`,
}));

// Slipways. These are ramps, which is a fact about the structure rather than a
// claim about a service, so they are typed directly.
const RAMPS = [
  { lat: 30.41322, lon: -95.57147 }, { lat: 30.39280, lon: -95.54937 },
  { lat: 30.35669, lon: -95.58185 }, { lat: 30.35840, lon: -95.59832 },
  { lat: 30.39358, lon: -95.54024 }, { lat: 30.40736, lon: -95.63240 },
  { lat: 30.39602, lon: -95.63857 }, { lat: 30.44163, lon: -95.61335 },
  { lat: 30.45351, lon: -95.63007 }, { lat: 30.51885, lon: -95.59164 },
].map((r, i) => ({
  ...r, kind: "ramp",
  // OSM has no name for any of these, so they are numbered north to south and
  // the owner can rename them to whatever he actually calls them.
  name: `Boat ramp ${i + 1}`,
  note: `${FROM_OSM} Unnamed in OSM — rename it to whatever you call it.`,
}));

const ALL = [...MARINAS, ...RAMPS];

(async () => {
  const existing = await prisma.waterPoint.findMany();
  const have = new Set(existing.map((p) => p.name.toLowerCase()));
  const todo = ALL.filter((p) => !have.has(p.name.toLowerCase()));

  console.log(`\n  ${existing.length} points saved already, ${ALL.length} candidates, ${todo.length} new\n`);
  for (const p of todo) {
    console.log("    " + p.kind.padEnd(6) + p.name.padEnd(24) +
      p.lat.toFixed(5) + ", " + p.lon.toFixed(5));
  }
  if (ALL.length - todo.length) {
    console.log(`\n    ${ALL.length - todo.length} skipped, already present.`);
  }

  console.log("\n  NOT seeded: fuel docks, safe harbors, hazards.");
  console.log("  OSM's fuel nodes here are road petrol stations, and the rest is local");
  console.log("  knowledge that has to come from you.\n");

  if (!APPLY) {
    console.log("  Dry run. Re-run with --apply to write it.\n");
    await prisma.$disconnect();
    return;
  }
  for (const p of todo) await prisma.waterPoint.create({ data: p });
  const after = await prisma.waterPoint.count();
  console.log(`  Added ${todo.length}. ${after} points on the map now.\n`);
  await prisma.$disconnect();
})();
