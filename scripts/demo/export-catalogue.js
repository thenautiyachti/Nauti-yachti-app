// Copy the PUBLIC catalogue (packages, boats, add-ons, gallery) from the live
// database into scripts/demo/catalogue.json, which lib/demoSeed.js builds the
// demo from. Read only.
//
//   node scripts/demo/export-catalogue.js
//
// Only what the public website already shows travels: package copy, boat specs,
// add-on names, gallery captions. Prices are changed later, at seed time, and
// boats are renamed there too -- this file is the raw public material.
// Never add a table here that holds a person, a booking or money.
const fs = require("fs");
const path = require("path");
const APP = path.join(__dirname, "..", "..");
for (const line of fs.readFileSync(process.env.NAUTI_SECRETS || "C:/Users/immex/.secrets/nauti-yachti.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { prisma } = require(path.join(APP, "lib/db.js"));

(async () => {
  const strip = (rows) => rows.map(({ createdAt, updatedAt, ...r }) => r);
  const catalogue = {
    exportedAt: new Date().toISOString().slice(0, 10),
    packages: strip(await prisma.package.findMany({ orderBy: { sortOrder: "asc" } })),
    vessels: strip(await prisma.vessel.findMany({ orderBy: { sortOrder: "asc" } })),
    addOns: strip(await prisma.addOn.findMany({ where: { archived: false }, orderBy: { sortOrder: "asc" } })),
    gallery: strip(await prisma.galleryItem.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] })),
  };
  const out = path.join(__dirname, "catalogue.json");
  fs.writeFileSync(out, JSON.stringify(catalogue, null, 2) + "\n");
  console.log(`  wrote ${out}`);
  for (const k of ["packages", "vessels", "addOns", "gallery"]) console.log(`    ${k}: ${catalogue[k].length}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
