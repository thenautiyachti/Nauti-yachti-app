// Retire the Corporate Outing gallery section, keeping its photographs.
//
// Owner, 6 Sep 2026: "lets just remove this section, i can add in the future if
// needed. we just dont have any photos for it yet and thats okay ... but use the
// photos here in other approapraite sections".
//
// So this is not a deletion. All three are real charters and stay on the site;
// they were only ever filed under Corporate because the section existed and
// needed filling. That is the same fault that put five boat-detail shots under
// Corporate and Birthday, and put three guests on a birthday charter into the
// Fleet section. None of these three shows anything corporate: no branding, no
// company group, nothing that reads as a work outing.
//
// THE SECTION DISAPPEARS BY ITSELF. SiteView builds its section list from
// packages that actually have photos --
// `packages.map(p => p.id).filter(id => byCategory[id])` -- so a category with
// nothing in it renders no heading at all. The Corporate Outing PACKAGE is
// untouched and still bookable; only the gallery section goes.
//
// Dry run by default.

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
const { PrismaClient } = require(path.join(APP, "node_modules/@prisma/client"));
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// Where each one actually belongs, judged on what is in the frame.
//
// The captions change only where the old one was written for a section that is
// going away: "Team time on the water" is corporate-speak and says nothing
// about the tubes stacked on the stern, which is why the photo is moving to
// Tubing in the first place.
const MOVES = [
  // Both to Birthday, and the captions are the owner's own words. My first pass
  // sent one to Party Cove and one to Tubing, reading the frames literally --
  // open water, inflatables on the stern. He knows which charters these were,
  // and neither guess survived contact with that. Where a photo belongs is a
  // fact about the booking, not about what is visible in it.
  //
  // The captions also had to change: "Group outing" and "Team time on the water"
  // are corporate-speak written for a section that no longer exists.
  {
    id: "g-corporate-2",
    to: "birthday",
    caption: "Hanging out on Lake Conroe",
    why: "owner's call — and his caption",
  },
  {
    id: "g-corporate-3",
    to: "birthday",
    caption: "Making memories",
    why: "owner's call — and his caption",
  },
];

// Not moved. Removed, because the site already shows it.
//
// The owner spotted this: "A relaxed afternoon on the water" is the same
// waterskiing shot already in Tubing as "Carving up the wake". Checked -- same
// rider, same wake, same treeline, cropped two different ways: /wakeboarding.jpg
// is a landscape crop, the corporate copy a portrait one that includes a
// passenger's hair and the gunwale in the foreground.
//
// Filing one photograph twice under two captions is worse than filing it in the
// wrong section. A visitor scrolling the gallery sees the same afternoon
// presented as two separate charters, which quietly overstates how much has been
// photographed -- and the whole reason the Corporate section is going away is
// that it was padded.
//
// The FILE is left on disk. It is the higher-resolution copy of the two and may
// be wanted later; see the note printed at the end about /wakeboarding.jpg.
const RETIRE = [
  { id: "g-corporate-1", because: 'already in Tubing as "Carving up the wake" (/wakeboarding.jpg)' },
];

(async () => {
  console.log("\n  MOVING OUT OF CORPORATE OUTING\n");
  const plan = [];
  for (const m of MOVES) {
    const g = await prisma.galleryItem.findUnique({ where: { id: m.id } });
    if (!g) { console.log("   " + m.id + " not found (already moved?)"); continue; }
    const target = await prisma.galleryItem.findMany({ where: { category: m.to } });
    const nextOrder = Math.max(0, ...target.map((x) => x.sortOrder)) + 1;
    console.log("   " + g.category + " -> " + m.to + "   position " + nextOrder);
    console.log('      "' + g.caption + '"' + (m.caption !== g.caption ? '  ->  "' + m.caption + '"' : "  (caption unchanged)"));
    console.log("      " + m.why);
    console.log("");
    plan.push({ ...m, nextOrder });
  }

  console.log("  REMOVED AS A DUPLICATE\n");
  const retiring = [];
  for (const r of RETIRE) {
    const g = await prisma.galleryItem.findUnique({ where: { id: r.id } });
    if (!g) { console.log("   " + r.id + " not found (already removed?)"); continue; }
    console.log('   "' + g.caption + '"');
    console.log("      " + r.because);
    console.log("      file stays on disk: " + g.image);
    retiring.push(r);
  }

  const left = await prisma.galleryItem.count({ where: { category: "corporate" } });
  const remaining = left - plan.length - retiring.length;
  console.log("\n  Corporate Outing will hold " + remaining + " photo(s) — " +
    (remaining === 0 ? "the section stops rendering." : "SECTION WILL STILL SHOW."));

  if (!APPLY) { console.log("\n  Dry run. Re-run with --apply to write.\n"); return; }
  if (!process.env.ALLOW_PROD_WRITES) { console.log("\n  ALLOW_PROD_WRITES is not set. Refusing.\n"); process.exitCode = 1; return; }

  for (const m of plan) {
    await prisma.galleryItem.update({
      where: { id: m.id },
      data: { category: m.to, caption: m.caption, sortOrder: m.nextOrder },
    });
  }
  for (const r of retiring) {
    await prisma.galleryItem.delete({ where: { id: r.id } });
  }

  // The files keep their corporate-* names, and that is fine: 11 of the 54
  // gallery images already sit under a filename that does not match their
  // category. Renaming would mean moving files AND rewriting rows to gain
  // nothing a visitor can see, and every rename is a chance to point a row at
  // the wrong photo -- which nearly happened an hour ago.
  const after = await prisma.galleryItem.groupBy({ by: ["category"], _count: true });
  console.log("\n  THE GALLERY NOW\n");
  after.sort((a, b) => b._count - a._count)
    .forEach((c) => console.log("     " + String(c._count).padStart(3) + "  " + c.category));

  // Worth saying while the subject is open: the copy that SURVIVED is the small
  // one. /wakeboarding.jpg is 334x290, comfortably the lowest-resolution photo
  // in the gallery, where the median is 1080 wide. The corporate copy just
  // removed was 1080x2340 of the same afternoon -- but a portrait crop that does
  // not contain the landscape framing now on the site, so it cannot simply be
  // swapped in. A better version would have to come from the original frame.
  const small = await prisma.galleryItem.findMany({
    where: { width: { lt: 700 } }, select: { caption: true, image: true, width: true, height: true, category: true },
  });
  if (small.length) {
    console.log("\n  LOWEST-RESOLUTION PHOTOS ON THE SITE (under 700px wide)\n");
    small.forEach((g) => console.log("     " + (g.width + "x" + g.height).padEnd(10) +
      "[" + g.category + "] " + g.caption + "   " + g.image));
  }
  console.log("");
})()
  .catch((e) => { console.error("\n  " + e.message + "\n"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
