// Bring guest uploads down off the web and into the inbox.
//
//   node scripts/pull-guest-uploads.js            what is waiting
//   node scripts/pull-guest-uploads.js --apply    download it, then remove it from storage
//   node scripts/pull-guest-uploads.js --apply --keep   download it, leave it in storage
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
require("C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/AI & Website/Crew/_Scripts/paths.js").loadSecrets();
const fs = require("fs");
const path = require("path");
const APP = "C:/Users/immex/Documents/Nauti-yachti-app";
const { PrismaClient } = require(APP + "/node_modules/@prisma/client");
const { BUCKET, localFileNameFor, storedSize } = require(APP + "/lib/guestUploads");

const APPLY = process.argv.includes("--apply");
const INBOX = process.env.NAUTI_INBOX
  || "C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos/00 Inbox";

// Guest files land in their own folder inside the inbox, never loose in it.
// Owner, 2 Oct 2026: call it "Imported from Website" "so we know they came from
// the customer and we know that there is no backup of this." Everything else in
// 00 Inbox is a phone sync target and safe to clear; this folder is the opposite,
// because the pull removes each file from storage once it is here. The crew's
// file-inbox.js reads the same name.
const IMPORTED = path.join(INBOX, "Imported from Website");

// WHO IT CAME FROM, in the folder name, as far as it is actually known. Owner,
// same day: "if you're able to figure out who exactly they came from, then that
// makes filing it even easier."
//
//   trip page   -> "2026-09-19 Pat Example - NY-20260919-03". Certain: the link
//                  that opened the page was signed for that booking.
//   share page  -> "2026-09-19 boatz-glowz - phone matches NY-20260919-03" when
//                  the sender's number matched a booking that day. A hint, never
//                  a claim (parties book on one person's phone), so it says so.
//   otherwise   -> "2026-09-19 boatz-glowz", the charter they picked.
//
// The date stays first either way, for a person reading the folder, but
// file-inbox.js files by the booking number when there is one, never by the
// date (owner, 3 Oct 2026: a photo's date can be wrong). Who SENT each
// file is in its own name (guest_<name>_...), because a forwarded trip link
// means the sender is often not the person who booked.
const bookerName = new Map();
async function folderFor(db, u) {
  if (u.eventKey === "other") return "_no charter given";
  if (!u.bookingId) return u.eventKey;
  if (u.source !== "trip") return u.eventKey + " - phone matches " + u.bookingId;
  if (!bookerName.has(u.bookingId)) {
    const e = await db.externalBooking.findFirst({ where: { bookingId: u.bookingId }, select: { guestName: true } }).catch(() => null);
    const i = e && e.guestName ? null
      : await db.inquiry.findFirst({ where: { bookingId: u.bookingId }, select: { name: true } }).catch(() => null);
    bookerName.set(u.bookingId, String((e && e.guestName) || (i && i.name) || "").trim());
  }
  const who = bookerName.get(u.bookingId).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").slice(0, 40).trim();
  return u.eventKey.slice(0, 10) + (who ? " " + who : "") + " - " + u.bookingId;
}
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const mb = (n) => (Number(n) / 1048576).toFixed(1) + " MB";

// ONCE IT IS HERE, IT LEAVES STORAGE. Owner, 2 Oct 2026, choosing this over a
// paid plan "for now at least": the free Supabase plan holds 1 GB across the
// whole account, and one glow night of guest video came to 2.4 GB. Left in the
// bucket, a single busy night would put the account over and Supabase may then
// restrict the project.
//
// So the copy in 00 Inbox (and Drive behind it) becomes the only copy, and the
// removal is guarded accordingly: a file leaves storage only after the bytes on
// this disk have been counted and match, exactly, what storage says it holds.
// Anything that does not match stays put and is reported. --keep leaves every
// file in storage, for a run you want to be able to repeat.
const KEEP = process.argv.includes("--keep");

async function removeFromStorage(u, dest) {
  if (KEEP) return { removed: false, why: "kept (--keep)" };
  const held = await storedSize(u.storagePath);
  if (held == null) return { removed: false, why: "storage did not confirm its size" };
  const onDisk = fs.statSync(dest).size;
  if (!(onDisk > 0) || onDisk !== held) {
    return { removed: false, why: mb(onDisk) + " on disk but " + mb(held) + " in storage" };
  }
  const r = await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + u.storagePath, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + SERVICE_KEY },
  });
  if (!r.ok) return { removed: false, why: "storage refused the delete (" + r.status + ")" };
  return { removed: true, why: "removed from storage" };
}

// What the row says afterwards, so the console and the next person can tell a
// file that is only on the PC from one that is still in the bucket.
function storageNote(result) {
  return result.removed
    ? "on the PC only; removed from storage " + new Date().toISOString().slice(0, 10)
    : "still in storage: " + result.why;
}

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

    let ok = 0, failed = 0, stillStored = 0;
    for (const u of waiting) {
      // "other" has no date and no shape, so it gets its own shelf rather than
      // polluting a real charter's folder.
      const folder = path.join(IMPORTED, await folderFor(db, u));
      fs.mkdirSync(folder, { recursive: true });
      const dest = path.join(folder, localFileNameFor(u));

      if (fs.existsSync(dest)) {
        const gone = await removeFromStorage(u, dest);
        await db.guestUpload.update({
          where: { id: u.id },
          data: { status: "pulled", pulledAt: new Date(), note: storageNote(gone) },
        });
        console.log("  already here   " + path.basename(dest) + "   " + gone.why);
        ok++;
        if (!gone.removed) stillStored++;
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

        const gone = await removeFromStorage(u, dest);
        await db.guestUpload.update({
          where: { id: u.id },
          data: { status: "pulled", pulledAt: new Date(), sizeBytes: buf.length, note: storageNote(gone) },
        });
        console.log("  pulled         " + path.basename(dest) + "   " + mb(buf.length) + "   " + gone.why);
        ok++;
        if (!gone.removed) stillStored++;
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
      + "   ->  " + IMPORTED);
    if (stillStored && !KEEP) {
      console.log("  " + stillStored + " still in storage (see the reason beside each). They count against the 1 GB.");
    }
    console.log("  Drive picks them up on its own from here.\n");
    process.exitCode = failed ? 1 : 0;
  } finally { await db.$disconnect(); }
})().catch((e) => { console.error("\n  ERR " + e.message + "\n"); process.exitCode = 1; });
