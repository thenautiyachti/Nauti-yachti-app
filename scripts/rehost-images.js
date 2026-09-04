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
const OUTDIR = path.join(APP, "public", "fleet");
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
  const jobs = [
    ...vessels.map((v) => ({ kind: "vessel", row: v, url: v.image, name: v.name })),
    ...packages.map((p) => ({ kind: "package", row: p, url: p.image, name: p.name })),
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
      const { buf, ext } = await grab(j.url);
      // Refuse anything implausible rather than writing a 404 page to disk and
      // pointing the site at it -- that would look fixed and be worse.
      if (buf.length < 5000) throw new Error("suspiciously small (" + buf.length + " bytes)");
      const stamp = crypto.createHash("sha1").update(j.url).digest("hex").slice(0, 8);
      const file = `${slug(j.name)}-${stamp}.${ext}`;
      fs.writeFileSync(path.join(OUTDIR, file), buf);
      const newUrl = "/fleet/" + file;
      if (j.kind === "vessel") await prisma.vessel.update({ where: { id: j.row.id }, data: { image: newUrl } });
      else await prisma.package.update({ where: { id: j.row.id }, data: { image: newUrl } });
      console.log(`  ok    ${j.name.padEnd(24)} ${(buf.length / 1024).toFixed(0).padStart(4)}KB  -> ${newUrl}`);
      done++;
    } catch (e) {
      console.error(`  FAIL  ${j.name.padEnd(24)} ${e.message}`);
      failed++;
    }
  }
  console.log(`\n  ${done} rehosted, ${failed} failed.`);
  console.log("  The files must be committed for the site to serve them.");
  await prisma.$disconnect();
  if (failed) process.exitCode = 1;
})().catch((e) => { console.error("ERR " + e.message); process.exit(1); });
