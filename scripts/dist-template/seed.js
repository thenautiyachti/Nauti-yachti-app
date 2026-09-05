// Your boats, your packages, your prices. Run with: npm run db:seed
// Safe to re-run -- it upserts everything by id.
//
// ONE WORKED EXAMPLE OF EACH, then blanks. Copy the example, change it, add
// more. The shapes matter; the contents are entirely yours.
//
// WHAT IS DELIBERATELY LEFT FILLED IN: the maintenance schedule at the bottom.
// Those intervals are manufacturer-typical for outboard and sterndrive engines
// and are a reasonable starting point for any boat. Everything above it is a
// worked example of a business that is not yours.
//
// WHAT `id` IS FOR: it is the key everything else hangs off -- editorial copy in
// lib/packageContent.js is keyed by package id, and re-running this file matches
// on it. Pick short lowercase ids and then leave them alone. Renaming a package
// later is free; changing its id orphans its copy.


// --- pricing ----------------------------------------------------------------
//
// The structure below is worth understanding before you replace the numbers,
// because it encodes something most charter pricing gets wrong.
//
// Price is per BOAT, per HOUR-COUNT, split weekday/weekend -- not per person.
// The keys 1-8 are how many hours the charter runs. They are NOT a flat rate
// multiplied out: look at the example and you will see the per-hour price drops
// as the booking gets longer, which is what makes a four-hour charter feel worth
// booking over two separate two-hour ones.
//
// Fill in every hour count you are willing to sell. A missing key means that
// length cannot be booked at all, which is a perfectly good way to say "we do
// not do one-hour charters".
const HOURLY_BY_VESSEL = {
  // EXAMPLE -- replace "boat-one" with your own vessel id below.
  "boat-one": {
    weekday: { 1: 200, 2: 400, 3: 570, 4: 760, 5: 900, 6: 1080, 7: 1225, 8: 1400 },
    weekend: { 1: 220, 2: 440, 3: 625, 4: 830, 5: 1000, 6: 1200, 7: 1350, 8: 1540 },
  },
};

// A second table, for packages that cost you less to run. The example business
// priced its cruising package about 20% under its watersports one, because a
// boat that anchors burns far less fuel than one towing a tube all afternoon.
// Whether that gap is right for you is a real decision, not a formula.
const CRUISING_HOURLY_BY_VESSEL = {
  "boat-one": {
    weekday: { 1: 160, 2: 320, 3: 455, 4: 610, 5: 720, 6: 865, 7: 980, 8: 1120 },
    weekend: { 1: 175, 2: 350, 3: 500, 4: 665, 5: 800, 6: 960, 7: 1080, 8: 1230 },
  },
};

// --- your boats -------------------------------------------------------------
//
// `capacity` is enforced at booking, so put the legal number here, not the
// comfortable one. `note` appears under the boat on the site and is the single
// most useful line you will write -- it is what makes someone pick this boat
// rather than that one.
const VESSELS = [
  {
    id: "boat-one",
    slip: "SLIP 01",
    name: "REPLACE ME",
    capacity: 12,
    note: "One sentence on who this boat is for. Compare it to your others.",
    image: "/your-boat-photo.jpg",   // or a full https:// URL
    sortOrder: 1,
  },
  // Add a row per boat. Keep the ids short and stable.
];

const ALL_VESSEL_IDS = JSON.stringify(VESSELS.map((v) => v.id));

// --- what you sell ----------------------------------------------------------
//
// `unit` is the inclusions line shown under the price. Be specific and be
// honest: it is the line that stops "is fuel extra?" emails, and the line a
// guest will quote back at you if it turns out to be wrong.
//
// `vesselsJson` limits a package to particular boats. Most packages run on
// everything; a self-drive option might run on exactly one.
const PACKAGES = [
  {
    id: "watersports",
    name: "REPLACE ME",
    image: "/your-package-photo.jpg",
    pricingType: "hourly-by-vessel",
    hourlyJson: JSON.stringify(HOURLY_BY_VESSEL),
    unit: "Say exactly what is included. Fuel? Equipment? Ice?",
    blurb:
      "Two or three sentences a guest reads while deciding. Say what the day " +
      "actually feels like and where you would take them, not what the boat is " +
      "made of. Name the places you go -- people search for those.",
    vesselsJson: ALL_VESSEL_IDS,
    sortOrder: 1,
  },
  // Add a row per package. The example business ran seven.
];

// --- extras -----------------------------------------------------------------
const ADDONS = [
  {
    id: "example-addon",
    name: "REPLACE ME",
    price: 40,
    unit: "per charter",   // or "per bottle", "per person"
    blurb: "One line. What they get and when it appears.",
    sortOrder: 1,
  },
];

// --- gallery ----------------------------------------------------------------
//
// Left EMPTY on purpose. Your photographs are the one thing on the site nobody
// can write for you, and a gallery seeded with placeholders is worse than an
// empty one -- it looks finished.
//
// The media library has tooling for this: tag your charter folders and ask the
// index for what you need. See the Photos README.
const GALLERY = [];

// --- maintenance ------------------------------------------------------------
//
// KEPT, because these apply to any boat. Manufacturer-typical intervals for
// outboards and sterndrives -- adjust to your own engines' manuals when you have
// them in front of you.
//
// lastDoneDate and lastDoneHours are deliberately null. The console then shows
// "cannot be judged" rather than a false all-clear, which is the honest state
// until you log a real service. Two zeroes side by side look exactly like a
// clean bill of health, and that is a trap worth avoiding from day one.
const MAINTENANCE_ITEMS = [
  { id: "maint-oil-filter", label: "Engine Oil & Filter Change", intervalHours: 100, intervalMonths: 12, sortOrder: 1 },
  { id: "maint-lower-unit", label: "Lower Unit / Gear Lube", intervalHours: 100, intervalMonths: 12, sortOrder: 2 },
  { id: "maint-spark-plugs", label: "Spark Plugs", intervalHours: 100, intervalMonths: 24, sortOrder: 3 },
  { id: "maint-fuel-filter", label: "Fuel Filter / Water Separator", intervalHours: 100, intervalMonths: 12, sortOrder: 4 },
  { id: "maint-impeller", label: "Impeller / Raw Water Pump", intervalHours: 200, intervalMonths: 24, sortOrder: 5 },
  { id: "maint-zincs", label: "Zincs / Anodes Inspect or Replace", intervalHours: 100, intervalMonths: 6, sortOrder: 6 },
  { id: "maint-belts", label: "Belts Inspect/Replace", intervalHours: 200, intervalMonths: 24, sortOrder: 7 },
  { id: "maint-battery", label: "Battery Check / Load Test", intervalHours: 100, intervalMonths: 6, sortOrder: 8 },
  { id: "maint-steering-cables", label: "Steering & Control Cable Lubrication", intervalHours: 100, intervalMonths: 12, sortOrder: 9 },
  { id: "maint-bilge-pump", label: "Bilge Pump & Float Switch Test", intervalHours: 50, intervalMonths: 3, sortOrder: 10 },
  { id: "maint-propeller", label: "Propeller Inspection", intervalHours: 100, intervalMonths: 12, sortOrder: 11 },
  { id: "maint-coolant", label: "Coolant / Antifreeze (closed cooling)", intervalHours: 300, intervalMonths: 24, sortOrder: 12 },
  { id: "maint-trailer-bearings", label: "Trailer Wheel Bearings", intervalHours: null, intervalMonths: 12, sortOrder: 13 },
];

// ---------------------------------------------------------------------------
//
// THE UNFINISHED CHECK RUNS BEFORE ANYTHING ELSE, including before the database
// client is constructed. That ordering is deliberate: on a half-installed
// package `new PrismaClient()` throws first, and the person sees a stack trace
// about a missing module rather than the one sentence they actually needed --
// "you have not filled this file in yet".
const unfinished = [...VESSELS, ...PACKAGES, ...ADDONS].filter((r) => r.name === "REPLACE ME");
if (unfinished.length) {
  console.error("\n  " + unfinished.length + " row(s) in prisma/seed.js still say REPLACE ME.");
  console.error("  Fill them in before seeding -- otherwise your site advertises a boat");
  console.error("  called REPLACE ME, and it will be live.\n");
  process.exit(1);
}

// Required only AFTER the check above, so an unfinished file reports itself even
// on an install where dependencies are not in place yet. A require at the top of
// the file throws first, and the reader gets "Cannot find module" instead of the
// sentence that would have helped.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  for (const v of VESSELS) await prisma.vessel.upsert({ where: { id: v.id }, update: v, create: v });
  for (const g of GALLERY) await prisma.galleryItem.upsert({ where: { id: g.id }, update: g, create: g });
  for (const p of PACKAGES) await prisma.package.upsert({ where: { id: p.id }, update: p, create: p });
  for (const a of ADDONS) await prisma.addOn.upsert({ where: { id: a.id }, update: a, create: a });

  // Maintenance items are created but never updated: once you have logged a
  // service against one, re-seeding must not overwrite what you recorded.
  for (const m of MAINTENANCE_ITEMS) {
    const existing = await prisma.maintenanceItem.findUnique({ where: { id: m.id } });
    if (!existing) await prisma.maintenanceItem.create({ data: m });
  }

  console.log("  seeded " + VESSELS.length + " vessel(s), " + PACKAGES.length + " package(s), " +
    ADDONS.length + " add-on(s), " + MAINTENANCE_ITEMS.length + " maintenance item(s)");
  if (!GALLERY.length) console.log("  gallery is empty -- add your own photographs, see the Photos README");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
