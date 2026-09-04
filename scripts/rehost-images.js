// Pulls booking-page images off third-party hosts and onto our own domain.
//
//   node scripts/rehost-images.js               what it would do
//   ALLOW_PROD_WRITES=1 node scripts/rehost-images.js --confirm
//
// WHY. Eight images on the vessel and package cards were served from
// bc-user-uploads.brandcrowd.com -- a logo-design service, on an account that
// has nothing to do with running charters. They load today. The day that
// account lapses, is cleaned up, or changes its URL scheme, the pictures vanish
// from the exact pages where a guest decides whether to book, and nothing would
// announce it. A commissioning sweep found them because it checked every media
// URL; it could just as easily have been a guest.
//
// The files come down once, go into public/fleet/, and are served from the same
// domain as everything else. No account to lapse, no third party in the path.
//
// Existing filenames are never reused: each file is written with a short hash of
// its source URL, so a re-run cannot silently overwrite a different image with
// the same name.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const APP = path.join(__dirname, "..");
for (const l of fs.readFileSync("C:/Users/immex/.secrets/nauti-yachti.env", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { prisma } = require(path.join(APP, "lib/db.js"));

const CONFIRM = process.argv.includes("--confirm");
// Two halves, on purpose. Downloading and pointing the database at the new
// paths are separate acts, and doing them together is how the live site briefly
// 404d every rehosted image on 3 September: the rows pointed at /fleet/... some
// minutes before the deploy that put those files on the server.
//
//   --files-only   download and write, touch nothing in the database
//   (commit and deploy)
//   --db-only      point the rows at the files that are now live
//
// Running with neither still does both, which is fine for a handful of images
// on a page nobody is looking at, and wrong for a public gallery.
const FILES_ONLY = process.argv.includes("--files-only");
const DB_ONLY = process.argv.includes("--db-only");
const OUTDIR = path.join(APP, "public", "fleet");
// The gallery is its own folder. Its files are decoration for the /gallery
// page rather than the pictures a guest books from, and keeping them apart
// means a future cleanup can treat the two differently.
const GALLERY_OUTDIR = path.join(APP, "public", "gallery");
const THIRD_PARTY = /brandcrowd\.com/i;

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function grab(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const type = r.headers.get("content-type") || "";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  return { buf, ext };
}

(async () => {
  const vessels = (await prisma.vessel.findMany()).filter((v) => THIRD_PARTY.test(v.image || ""));
  const packages = (await prisma.package.findMany()).filter((p) => THIRD_PARTY.test(p.image || ""));
  // The gallery was missed the first time: this script only ever read two
  // tables, so 32 of the 45 photos on the public gallery page stayed on the
  // abandoned account for another day. Anything that stores an image URL needs
  // to be listed here, or it is invisible to the only check that looks.
  const gallery = (await prisma.galleryItem.findMany()).filter((g) => THIRD_PARTY.test(g.image || ""));

  const jobs = [
    ...vessels.map((v) => ({ kind: "vessel", row: v, url: v.image, name: v.name })),
    ...packages.map((p) => ({ kind: "package", row: p, url: p.image, name: p.name })),
    // A gallery item has no name, so its caption and category make the filename
    // readable. Two photos can share a caption; the URL hash keeps them apart.
    ...gallery.map((g) => ({
      kind: "gallery",
      row: g,
      url: g.image,
      name: (g.category ? g.category + "-" : "") + (g.caption || "photo"),
    })),
  ];

  if (!jobs.length) { console.log("  nothing on a third-party host."); await prisma.$disconnect(); return; }
  console.log(`  ${jobs.length} images to bring in-house\n`);

  if (!CONFIRM) {
    for (const j of jobs) console.log(`    ${j.kind.padEnd(8)} ${j.name}`);
    console.log("\n  dry run. Re-run with ALLOW_PROD_WRITES=1 and --confirm.");
    await prisma.$disconnect();
    return;
  }

  fs.mkdirSync(OUTDIR, { recursive: true });
  let done = 0, failed = 0;
  for (const j of jobs) {
    try {
      const stampEarly = crypto.createHash("sha1").update(j.url).digest("hex").slice(0, 8);
      const dirEarly = j.kind === "gallery" ? GALLERY_OUTDIR : OUTDIR;
      const prefixEarly = j.kind === "gallery" ? "/gallery/" : "/fleet/";

      // --db-only: the file is already on disk and deployed. Find it and point
      // the row at it, without downloading anything again.
      if (DB_ONLY) {
        const existing = fs.existsSync(dirEarly)
          ? fs.readdirSync(dirEarly).find((f) => f.includes(stampEarly))
          : null;
        if (!existing) throw new Error("no downloaded file for this row -- run --files-only first");
        const url = prefixEarly + existing;
        if (j.kind === "vessel") await prisma.vessel.update({ where: { id: j.row.id }, data: { image: url } });
        else if (j.kind === "package") await prisma.package.update({ where: { id: j.row.id }, data: { image: url } });
        else await prisma.galleryItem.update({ where: { id: j.row.id }, data: { image: url } });
        console.log("  ok    " + j.name.slice(0, 30).padEnd(32) + "-> " + url);
        done++;
        continue;
      }

      const { buf, ext } = await grab(j.url);
      // Refuse anything implausible rather than writing a 404 page to disk and
      // pointing the site at it -- that would look fixed and be worse.
      if (buf.length < 5000) throw new Error("suspiciously small (" + buf.length + " bytes)");
      const stamp = crypto.createHash("sha1").update(j.url).digest("hex").slice(0, 8);
      const dir = j.kind === "gallery" ? GALLERY_OUTDIR : OUTDIR;
      const prefix = j.kind === "gallery" ? "/gallery/" : "/fleet/";
      fs.mkdirSync(dir, { recursive: true });
      const file = `${slug(j.name).slice(0, 48)}-${stamp}.${ext}`;
      fs.writeFileSync(path.join(dir, file), buf);
      const newUrl = prefix + file;
      if (FILES_ONLY) {
        console.log("  saved " + j.name.slice(0, 28).padEnd(30) + (buf.length / 1024).toFixed(0).padStart(4) + "KB  " + newUrl);
        done++;
        continue;
      }
      if (j.kind === "vessel") await prisma.vessel.update({ where: { id: j.row.id }, data: { image: newUrl } });
      else if (j.kind === "package") await prisma.package.update({ where: { id: j.row.id }, data: { image: newUrl } });
      else await prisma.galleryItem.update({ where: { id: j.row.id }, data: { image: newUrl } });
      console.log(`  ok    ${j.name.padEnd(24)} ${(buf.length / 1024).toFixed(0).padStart(4)}KB  -> ${newUrl}`);
      done++;
    } catch (e) {
      console.error(`  FAIL  ${j.name.padEnd(24)} ${e.message}`);
      failed++;
    }
  }
  console.log(`\n  ${done} rehosted, ${failed} failed.`);
  console.log("  The files must be COMMITTED AND DEPLOYED before the rows point anywhere real.");
  console.log("  Do it in that order. Updating the database first leaves every one of these");
  console.log("  images 404ing on the live site until the deploy lands -- which happened once");
  console.log("  already, on 3 September, and is why this line is here.");
  await prisma.$disconnect();
  if (failed) process.exitCode = 1;
})().catch((e) => { console.error("ERR " + e.message); process.exit(1); });
