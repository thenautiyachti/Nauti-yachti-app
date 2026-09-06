// The Boats section: three photographs of each vessel, and one photo moved out
// of it. Owner's instruction, 6 Sep 2026.
//
// WHAT WAS WRONG. "Fleet" was created to hold boat-detail shots that had been
// sitting under Corporate Outing and Birthday as filler. The sweep that made it
// caught one photo it should not have: "Aboard the Nauti Yachti" is three guests
// on the boat, not a boat detail — and the owner recalls the charter was a
// birthday. The booking agrees: NY-20250901-01, Ashtyne Alexander, 1 Sep 2025,
// party of 10, won through a GetMyBoat listing titled "Turning Your Celebrations
// Into Unforgettable Memories". So it goes to Birthday, where it was probably
// filed correctly in the first place.
//
// That left the section lopsided: one Yachti, two Islander, no Explorer at all —
// on a page whose whole job is to show the fleet. Now three each, grouped, in
// the order the owner named them.
//
// THE PHOTOS ARE HIS CHOICES, not a search result. He picked the three Explorer
// shots by name and said which of the existing three belonged to which boat.
// The two extra Yachti frames are mine, chosen against the standard he has
// already set by rejecting others: no shore-power cord, no gear left on deck.
// The mooring-line frame was rejected for exactly that reason.
//
// Dry run by default. Nothing is written and nothing is copied without --apply.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

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
const FLEET = "C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos/01 Fleet";
const OUT = path.join(APP, "public", "gallery");
const FFMPEG = ["C:/Users/immex/tools/ffmpeg/bin/ffmpeg.exe", "C:/Users/immex/tools/ffmpeg/ffmpeg.exe"].find(fs.existsSync);
const FFPROBE = ["C:/Users/immex/tools/ffmpeg/bin/ffprobe.exe", "C:/Users/immex/tools/ffmpeg/ffprobe.exe"].find(fs.existsSync);

const MOVE_ID = "g-fleet-aboard-the-nauti-yachti-3f5b80b9";

// The section, in the owner's order: Yachti, Islander, Explorer. `src: null`
// means the file is already in public/gallery and only its position changes.
//
// maxWidth exists because two of these are 4000x3000 straight off a phone at
// 1.5MB each. The gallery's own fleet photos are 1600 wide and the median across
// the whole gallery is 1080; shipping a 4000px original would be four times the
// page weight for no visible gain.
const PLAN = [
  { boat: "Nauti Yachti", file: "nauti-yachti-profile.jpg", caption: "The Nauti Yachti",
    src: FLEET + "/Nauti Yachti/120250806_183847.jpg", maxWidth: 1600 },
  { boat: "Nauti Yachti", file: "nauti-yachti-cockpit.jpg", caption: "Cockpit and sun pad",
    src: FLEET + "/Nauti Yachti/120250806_184225.jpg", maxWidth: 1600 },
  { boat: "Nauti Yachti", file: "gallery/nauti-yachti-cabin-berth.jpg", caption: "Air-conditioned cabin below deck", src: null },

  { boat: "Nauti Islander", file: "islander-1.jpg", caption: "The Nauti Islander",
    src: FLEET + "/Nauti Islander/1.jpg", maxWidth: 1600 },
  { boat: "Nauti Islander", file: "islander-2.jpg", caption: "The Nauti Islander at the dock", src: null, atRoot: true },
  { boat: "Nauti Islander", file: "islander-3.jpg", caption: "Aboard the Nauti Islander", src: null, atRoot: true },

  { boat: "Nauti Explorer", file: "nauti-explorer-towing.jpg", caption: "The Nauti Explorer towing the tube",
    src: FLEET + "/Nauti Explorer/Screenshot_20260717_112345_Photos.jpg", maxWidth: 1600 },
  { boat: "Nauti Explorer", file: "nauti-explorer-under-way.jpg", caption: "Out on the water",
    src: FLEET + "/Nauti Explorer/Screenshot_20260717_112359_Photos.jpg", maxWidth: 1600 },
  { boat: "Nauti Explorer", file: "nauti-explorer-at-rest.jpg", caption: "Anchored up for the afternoon",
    src: FLEET + "/Nauti Explorer/Screenshot_20260629_184455_Photos.jpg", maxWidth: 1600 },
];

function dimensions(file) {
  const out = execFileSync(FFPROBE, ["-v", "error", "-select_streams", "v",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
  const [w, h] = out.trim().split(",").map(Number);
  return { width: w, height: h };
}

(async () => {
  if (!FFMPEG || !FFPROBE) { console.log("\n  ffmpeg not found\n"); process.exitCode = 1; return; }

  const moving = await prisma.galleryItem.findUnique({ where: { id: MOVE_ID } });
  const bday = await prisma.galleryItem.findMany({ where: { category: "birthday" } });
  const nextBdayOrder = Math.max(0, ...bday.map((g) => g.sortOrder)) + 1;

  console.log("\n  OUT OF THE BOATS SECTION");
  console.log("     " + (moving ? '"' + moving.caption + '"  fleet -> birthday, position ' + nextBdayOrder
    : MOVE_ID + " not found (already moved?)"));

  console.log("\n  THE BOATS SECTION, AFTER");
  let order = 0;
  let collisions = 0;
  const work = [];
  for (const p of PLAN) {
    order++;
    const dest = p.atRoot ? path.join(APP, "public", p.file) : path.join(OUT, path.basename(p.file));
    const webPath = p.atRoot ? "/" + p.file : (p.file.includes("/") ? "/" + p.file : "/gallery/" + p.file);
    const exists = fs.existsSync(dest);
    let note;
    if (!p.src) note = exists ? "already in place" : "MISSING FILE";
    else if (exists) { note = "STOP — a DIFFERENT file already has this name: " + p.file; collisions++; }
    else if (!fs.existsSync(p.src)) note = "SOURCE MISSING: " + p.src;
    else {
      const d = dimensions(p.src);
      note = "copy " + d.width + "x" + d.height +
        (d.width > p.maxWidth ? " -> resize to " + p.maxWidth + " wide" : " as-is") +
        "  (" + Math.round(fs.statSync(p.src).size / 1024) + "KB)";
    }
    console.log("     " + order + ". " + p.boat.padEnd(15) + '"' + p.caption + '"');
    console.log("        " + p.file.padEnd(34) + note);
    work.push({ ...p, order, dest, exists, webPath });
  }

  // A name already taken is a STOP, not a shrug.
  //
  // The first version of this printed "already copied" and carried on, and the
  // name it was about to reuse -- nauti-yachti-at-the-dock.jpg -- belongs to the
  // photo the owner REJECTED for showing the shore-power cord and an ice chest
  // on the swim platform. It is orphaned in public/gallery precisely because he
  // turned it down. Skipping the copy and pointing a new gallery item at that
  // filename would have put the rejected photo back on the live site, and the
  // only clue would have been two cheerful words in a log.
  if (collisions) {
    console.log("\n  " + collisions + " name collision(s). Refusing to run: writing to a name that");
    console.log("  already exists would publish whatever photo is already sitting there.\n");
    process.exitCode = 1;
    return;
  }

  if (!APPLY) { console.log("\n  Dry run. Re-run with --apply to write.\n"); return; }
  if (!process.env.ALLOW_PROD_WRITES) { console.log("\n  ALLOW_PROD_WRITES is not set. Refusing.\n"); process.exitCode = 1; return; }

  // --- 1. the files -----------------------------------------------------------
  for (const w of work) {
    if (!w.src || w.exists) continue;
    const d = dimensions(w.src);
    if (d.width > w.maxWidth) {
      execFileSync(FFMPEG, ["-v", "error", "-y", "-i", w.src,
        "-vf", "scale=" + w.maxWidth + ":-2", "-q:v", "3", w.dest]);
    } else {
      fs.copyFileSync(w.src, w.dest);
    }
    console.log("     wrote " + w.file + "  " + Math.round(fs.statSync(w.dest).size / 1024) + "KB");
  }

  // --- 2. the move out --------------------------------------------------------
  if (moving) {
    await prisma.galleryItem.update({
      where: { id: MOVE_ID },
      data: { category: "birthday", sortOrder: nextBdayOrder },
    });
  }

  // --- 3. the section itself --------------------------------------------------
  // Upsert rather than insert: re-running must not create a second copy of a
  // photo, and the three that were already there only need their position.
  for (const w of work) {
    const dim = dimensions(w.dest);
    // basename, because one entry carries a folder in its path and an id with a
    // slash in it is a primary key nobody can type or grep for.
    const id = "g-fleet-" + path.basename(w.file).replace(/\.[a-z]+$/i, "");
    const existing = await prisma.galleryItem.findFirst({ where: { image: w.webPath } });
    const data = {
      image: w.webPath, caption: w.caption, category: "fleet",
      sortOrder: w.order, width: dim.width, height: dim.height,
    };
    if (existing) await prisma.galleryItem.update({ where: { id: existing.id }, data });
    else await prisma.galleryItem.create({ data: { id, ...data } });
  }

  const after = await prisma.galleryItem.findMany({ where: { category: "fleet" }, orderBy: { sortOrder: "asc" } });
  console.log("\n  THE BOATS SECTION IS NOW " + after.length + " PHOTOS");
  after.forEach((g) => console.log("     " + g.sortOrder + "  " + g.caption + "   " + g.width + "x" + g.height));
  console.log("");
})()
  .catch((e) => { console.error("\n  " + e.message + "\n"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
