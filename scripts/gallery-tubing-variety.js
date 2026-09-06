// Three near-identical tubing photos replaced with three different ones.
//
// Owner, 6 Sep 2026, looking at "Wide out on the turn", "Cutting back through
// the wash" and "Holding on tight": "these need to be different tubing /
// wakeboarding photos. these are teh same things basically".
//
// He undercounted. FOUR of the twelve were one ride: the same teal tube, the
// same two riders in red vests, the same afternoon -- "Skipping over the wake"
// is from that session too. One stays; three go.
//
// WHAT REPLACES THEM, and why each is different from everything already there:
//
//   the sandbar    a group standing in shallow water with the tube and the boat
//                  behind. Not an action shot at all -- it is the part of a
//                  charter people actually remember, and nothing else in the
//                  section shows it.
//   the wakeboard  a rider crossing the wake at dusk. The section is called
//                  Tubing / WAKEBOARDING and had one waterskiing photo in it.
//                  Different discipline, different light from everything else.
//   the yellow tube  a third tube, shot from the boat down the rope.
//
// A NEAR MISS WORTH RECORDING. The obvious pick was a close, sunny shot of two
// riders on a colourful WOW tube -- until it was put side by side with the
// section's existing "Bouncing across the wake" and turned out to be the same
// tube, the same two women, seconds apart. Choosing it would have committed the
// exact fault being fixed. Compare candidates against what is already published,
// not just against each other.
//
// Dry run by default.

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

const TUB = "C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos/02 Charters/Tubing and Wakeboarding";
const OUT = path.join(APP, "public", "gallery");
const FFMPEG = ["C:/Users/immex/tools/ffmpeg/bin/ffmpeg.exe", "C:/Users/immex/tools/ffmpeg/ffmpeg.exe"].find(fs.existsSync);
const FFPROBE = ["C:/Users/immex/tools/ffmpeg/bin/ffprobe.exe", "C:/Users/immex/tools/ffmpeg/ffprobe.exe"].find(fs.existsSync);

const SWAPS = [
  {
    replaces: "g-tubing-wide-out-on-the-turn-7b20b66a",
    file: "tubing-sandbar-with-the-tube.jpg",
    caption: "Pulled up at the sandbar",
    src: TUB + "/_undated Snapchat/Snapchat-2130096352.jpg",
  },
  {
    replaces: "g-tubing-cutting-back-through-the-wash-c0957fae",
    file: "tubing-wakeboarding-at-dusk.jpg",
    caption: "Wakeboarding into the evening",
    src: TUB + "/2025-07-20/_from video/VID_20250720_112831_still12.jpg",
  },
  {
    replaces: "g-tubing-holding-on-tight-c5e68d2d",
    file: "tubing-down-the-rope.jpg",
    caption: "Two up, out behind the boat",
    src: TUB + "/_undated Snapchat/Messenger_creation_008f780b-c0e7-4dcd-8199-877f81f7873b.jpeg",
  },
];

const MAX_WIDTH = 1600;

function dims(f) {
  const out = execFileSync(FFPROBE, ["-v", "error", "-select_streams", "v",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", f], { encoding: "utf8" });
  const [w, h] = out.trim().split(",").map(Number);
  return { width: w, height: h };
}

(async () => {
  console.log("\n  TUBING / WAKEBOARDING — three swaps\n");
  let stop = 0;
  const work = [];
  for (const s of SWAPS) {
    const old = await prisma.galleryItem.findUnique({ where: { id: s.replaces } });
    const dest = path.join(OUT, s.file);
    if (!fs.existsSync(s.src)) { console.log("   SOURCE MISSING: " + s.src); stop++; continue; }
    // Same guard as the fleet rebuild: a name already in use would publish
    // whatever photo is sitting under it.
    if (fs.existsSync(dest)) { console.log("   STOP — name already taken: " + s.file); stop++; continue; }
    const d = dims(s.src);
    console.log("   out:  " + (old ? '"' + old.caption + '"' : s.replaces + " (not found)"));
    console.log('   in:   "' + s.caption + '"   ' + d.width + "x" + d.height +
      (d.width > MAX_WIDTH ? " -> " + MAX_WIDTH + " wide" : "") +
      "   " + Math.round(fs.statSync(s.src).size / 1024) + "KB");
    console.log("         " + path.basename(s.src));
    console.log("");
    work.push({ ...s, old, dest, d });
  }
  if (stop) { console.log("  " + stop + " problem(s). Refusing.\n"); process.exitCode = 1; return; }
  if (!APPLY) { console.log("  Dry run. Re-run with --apply.\n"); return; }
  if (!process.env.ALLOW_PROD_WRITES) { console.log("  ALLOW_PROD_WRITES not set. Refusing.\n"); process.exitCode = 1; return; }

  // FILES FIRST. The gallery rows live in the shared production database, so a
  // row update shows on the live site immediately while the image only arrives
  // with the next deploy. Writing the row first is what left six Boats photos
  // serving 404 earlier tonight. Here the files are written, then committed and
  // deployed, and the rows are flipped only after the images answer 200.
  for (const w of work) {
    if (w.d.width > MAX_WIDTH) {
      execFileSync(FFMPEG, ["-v", "error", "-y", "-i", w.src, "-vf", "scale=" + MAX_WIDTH + ":-2", "-q:v", "3", w.dest]);
    } else {
      fs.copyFileSync(w.src, w.dest);
    }
    console.log("   wrote " + w.file + "  " + Math.round(fs.statSync(w.dest).size / 1024) + "KB");
  }
  console.log("\n  Files written. Commit and deploy, THEN run --flip to move the rows.\n");
})()
  .catch((e) => { console.error("\n  " + e.message + "\n"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

module.exports = { SWAPS };
