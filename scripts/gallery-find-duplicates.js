// Is the same photograph published more than once?
//
// WHY. Two turned up on 6 Sep 2026 within an hour of each other. The owner
// spotted the first: a waterskiing shot in Tubing as "Carving up the wake" and
// again in Corporate as "A relaxed afternoon on the water", cropped two ways.
// The second was mine — I picked a sandbar photo for Tubing that was already
// published in Birthday as "Family celebration on the lake", the same frame at
// a different size. Both were found by eye, which does not scale to 59 photos.
//
// A duplicate is worse than a miscategorised photo. It makes one afternoon look
// like two charters, which quietly overstates how much has been photographed —
// and padding is exactly what the gallery was being cleaned up for.
//
// HOW. Exact file hashes catch re-uploads. They do NOT catch what actually
// happens here: the same frame saved at a different size or crop, which is how
// both of tonight's got through. So every image is also reduced to a 32x32
// greyscale signature and compared with every other. Cropping shifts the
// content, so a crop of the same photo scores low but not zero; the threshold
// is set to surface those rather than only flag byte-identical files.
//
// Nothing is deleted. Judging which copy to keep needs a person.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
const FFMPEG = ["C:/Users/immex/tools/ffmpeg/bin/ffmpeg.exe", "C:/Users/immex/tools/ffmpeg/ffmpeg.exe"].find(fs.existsSync);

const N = 32;

// Aspect ratio is deliberately ignored: squashing everything to N x N means a
// 9:16 crop and a 16:9 crop of one scene still line up roughly, which is the
// case that matters.
function signature(file) {
  const out = execFileSync(FFMPEG, ["-v", "error", "-i", file,
    "-vf", `scale=${N}:${N},format=gray`, "-frames:v", "1", "-f", "rawvideo", "-"],
    { maxBuffer: 1 << 24 });
  return out.subarray(0, N * N);
}

function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

(async () => {
  const items = await prisma.galleryItem.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  const loaded = [];
  for (const g of items) {
    const file = path.join(APP, "public", g.image.replace(/^\//, ""));
    if (!fs.existsSync(file)) { console.log("   MISSING FILE: " + g.image + "   (" + g.caption + ")"); continue; }
    try {
      loaded.push({
        ...g, file,
        sha: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
        sig: signature(file),
      });
    } catch (e) { console.log("   could not read " + g.image + ": " + e.message.slice(0, 50)); }
  }
  console.log("\n  " + loaded.length + " published photos compared\n");

  // FLEET IS EXEMPT ACROSS SECTIONS. Owner's rule, 6 Sep 2026: "fleet will be
  // the exception section. No need to update this section or monitor for dupes
  // against other sections."
  //
  // It follows from what that section is for. Every other section is about an
  // OCCASION; The Boats is about the boats themselves, and the same photograph
  // can honestly be both — a shot of the Explorer towing a tube belongs in the
  // fleet line-up and in Tubing at the same time. The first run flagged exactly
  // that as byte-identical, and it was working as intended.
  //
  // Fleet is still checked AGAINST ITSELF: three photos of one boat that turn
  // out to be the same photo would be a real fault.
  const crossOK = (a, b) => !(a.category === "fleet") !== !(b.category === "fleet");

  const exact = {};
  for (const g of loaded) (exact[g.sha] = exact[g.sha] || []).push(g);
  const sameFile = Object.values(exact)
    .filter((v) => v.length > 1)
    .filter((v) => !v.every((g, _, arr) => crossOK(arr[0], g) || arr[0] === g));
  console.log("  BYTE-IDENTICAL FILES: " + sameFile.length +
    (sameFile.length ? "" : "   (fleet/occasion overlaps excluded by design)"));
  sameFile.forEach((v) => v.forEach((g) => console.log("     [" + g.category + "] " + g.caption + "   " + g.image)));

  const pairs = [];
  for (let i = 0; i < loaded.length; i++) {
    for (let j = i + 1; j < loaded.length; j++) {
      if (loaded[i].sha === loaded[j].sha) continue;
      if (crossOK(loaded[i], loaded[j])) continue; // fleet vs an occasion: allowed
      pairs.push({ a: loaded[i], b: loaded[j], d: distance(loaded[i].sig, loaded[j].sig) });
    }
  }
  pairs.sort((x, y) => x.d - y.d);

  console.log("\n  CLOSEST PAIRS — low score means the same scene\n");
  for (const p of pairs.slice(0, 12)) {
    const flag = p.d < 12 ? "  <-- LOOK" : "";
    console.log("     " + p.d.toFixed(1).padStart(5) + "   [" + p.a.category + "] " + p.a.caption);
    console.log("             [" + p.b.category + "] " + p.b.caption + flag);
  }
  console.log("\n  A score under about 12 is worth opening both. Above ~20 they are");
  console.log("  different photographs that happen to share a palette — this lake is");
  console.log("  green water and treeline in almost every frame, so scores cluster.\n");

  await prisma.$disconnect();
})().catch((e) => { console.error("\n  " + e.message + "\n"); process.exitCode = 1; });
