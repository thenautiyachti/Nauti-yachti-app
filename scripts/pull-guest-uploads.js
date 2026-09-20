// Bring guest uploads down off the web and into the inbox.
//
//   node scripts/pull-guest-uploads.js            what is waiting
//   node scripts/pull-guest-uploads.js --apply    download it
//
// WHY THIS IS A LOCAL SCRIPT AND NOT A WEBHOOK. This machine is not reachable
// from the internet, so nothing on Vercel can hand a file to it. Something here
// has to go and fetch. That makes this the same shape as the rest of the crew:
// a scheduled job that wakes up, looks, and does a small thing.
//
// AND DRIVE COMES FREE. `_MyFiles` is a Google Drive File Stream mirror, so a
// file written into 00 Inbox is in Drive minutes later with nothing else asked
// of it. That was half the original requirement and it needed no code at all.
//
// Files land in a folder per charter, so "make the reel for the glow night" is
// a folder rather than a search.
require("C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI/paths.js").loadSecrets();
const fs = require("fs");
const path = require("path");
const APP = "C:/Users/immex/Documents/Nauti-yachti-app";
const { PrismaClient } = require(APP + "/node_modules/@prisma/client");
const { BUCKET, localFileNameFor } = require(APP + "/lib/guestUploads");

const APPLY = process.argv.includes("--apply");
const INBOX = process.env.NAUTI_INBOX
  || "C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos/00 Inbox";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const mb = (n) => (Number(n) / 1048576).toFixed(1) + " MB";

(async () => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("\n  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set here.");
    console.error("  Nothing can be pulled without them.\n");
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient();
  try {
    const waiting = await db.guestUpload.findMany({
      where: { status: "uploaded" },
      orderBy: { createdAt: "asc" },
    });

    if (!waiting.length) { console.log("\n  nothing waiting.\n"); return; }

    // Grouped the way they will land, so the preview reads like the folders.
    const byEvent = new Map();
    for (const u of waiting) {
      if (!byEvent.has(u.eventKey)) byEvent.set(u.eventKey, []);
      byEvent.get(u.eventKey).push(u);
    }

    console.log("");
    let total = 0;
    for (const [key, list] of byEvent) {
      const bytes = list.reduce((n, u) => n + (u.sizeBytes || 0), 0);
      total += bytes;
      console.log("  " + (key === "other" ? "(no charter chosen)" : key)
        + "   " + list.length + " file(s), " + mb(bytes));
      for (const u of list) {
        console.log("      " + String(u.uploaderName).slice(0, 22).padEnd(24)
          + String(u.uploaderPhone).padEnd(16) + mb(u.sizeBytes).padStart(10)
          + "  " + String(u.fileName).slice(0, 34)
          + (u.bookingId ? "   [" + u.bookingId + "]" : ""));
      }
    }
    console.log("\n  " + waiting.length + " file(s), " + mb(total) + " altogether");

    if (!APPLY) { console.log("\n  nothing written. re-run with --apply\n"); return; }
    console.log("");

    let ok = 0, failed = 0;
    for (const u of waiting) {
      // "other" has no date and no shape, so it gets its own shelf rather than
      // polluting a real charter's folder.
      const folder = path.join(INBOX, u.eventKey === "other" ? "_guest uploads - no charter given" : u.eventKey);
      fs.mkdirSync(folder, { recursive: true });
      const dest = path.join(folder, localFileNameFor(u));

      if (fs.existsSync(dest)) {
        await db.guestUpload.update({ where: { id: u.id }, data: { status: "pulled", pulledAt: new Date() } });
        console.log("  already here   " + path.basename(dest));
        ok++;
        continue;
      }

      try {
        const r = await fetch(
          SUPABASE_URL + "/storage/v1/object/authenticated/" + BUCKET + "/" + u.storagePath,
          { headers: { Authorization: "Bearer " + SERVICE_KEY } }
        );
        if (!r.ok) throw new Error("storage " + r.status);

        // Straight to a temp name, then rename. A half-downloaded file that
        // looks finished is worse than no file: the next run would skip it.
        const tmp = dest + ".part";
        const buf = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync(tmp, buf);

        // Trust the bytes on disk, not the row: the size was reported by a
        // browser and this is the first time anybody has counted it.
        if (u.sizeBytes && Math.abs(buf.length - u.sizeBytes) > 1024 * 64) {
          fs.unlinkSync(tmp);
          throw new Error("size mismatch: expected " + mb(u.sizeBytes) + ", got " + mb(buf.length));
        }
        fs.renameSync(tmp, dest);

        await db.guestUpload.update({
          where: { id: u.id },
          data: { status: "pulled", pulledAt: new Date(), sizeBytes: buf.length },
        });
        console.log("  pulled         " + path.basename(dest) + "   " + mb(buf.length));
        ok++;
      } catch (err) {
        await db.guestUpload.update({
          where: { id: u.id },
          data: { note: String(err.message).slice(0, 200) },
        }).catch(() => {});
        console.log("  FAILED         " + u.id + "   " + String(err.message).slice(0, 80));
        failed++;
      }
    }

    console.log("\n  " + ok + " pulled" + (failed ? ", " + failed + " failed" : "")
      + "   ->  " + INBOX);
    console.log("  Drive picks them up on its own from here.\n");
    process.exitCode = failed ? 1 : 0;
  } finally { await db.$disconnect(); }
})().catch((e) => { console.error("\n  ERR " + e.message + "\n"); process.exitCode = 1; });
