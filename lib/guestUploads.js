// Media sent in by guests: which charters they can attach it to, where it lands,
// and what the page is allowed to accept.
//
// WHY THE FILE NEVER TOUCHES THE APP. One clip off the glasses on 19 Sep 2026
// was 239MB and the night came to 2.4GB. A serverless function takes a request
// body of a few megabytes, so anything that routed an upload through /api would
// fail on the first real video and succeed on every test file, which is the
// worst way for a thing to be broken. The browser uploads straight to storage
// against a short-lived signed URL; the app only ever handles the paperwork.
//
// THE BUCKET IS PRIVATE. Nothing here is readable on the web, by URL or
// otherwise. It is a drop box that lands in the owner's inbox, not a gallery.
const { prisma } = require("./db");

// Per file. The bucket enforces the same number, so a guest who gets past the
// page still cannot put a 5GB file in the account.
const MAX_BYTES = Number(process.env.GUEST_UPLOAD_MAX_BYTES || 2 * 1024 * 1024 * 1024);

// What a phone actually produces. HEIC is on the list because iPhones still
// default to it and a guest should not have to know that.
const ALLOWED = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/x-m4v": ".m4v",
  "video/webm": ".webm",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const BUCKET = "guest-uploads";

/** "2026-09-19" + "Boatz & Glowz Package" -> "2026-09-19 boatz-glowz" */
function eventKeyFor(date, packageName) {
  const slug = String(packageName || "charter")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .replace(/-package$/, "")
    .slice(0, 40) || "charter";
  return date + " " + slug;
}

function prettyDate(date) {
  if (!date) return "";
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

/**
 * The charters a guest can pick from.
 *
 * NO GUEST NAMES. This list is public, so it carries a date and what the trip
 * was and nothing else — who was aboard is not the internet's business, and a
 * page that leaked a passenger list to sell an upload button would be a poor
 * trade.
 *
 * Recent past first, because that is when somebody actually has footage to
 * send. A window either side keeps the list short enough to scan on a phone.
 */
async function selectableEvents(now = new Date()) {
  const day = 86400000;
  const from = new Date(now.getTime() - 120 * day).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 30 * day).toISOString().slice(0, 10);

  const [bookings, inquiries] = await Promise.all([
    prisma.externalBooking.findMany({
      where: { date: { gte: from, lte: to }, status: { not: "cancelled" } },
      select: { date: true, packageName: true },
    }),
    prisma.inquiry.findMany({
      where: { date: { gte: from, lte: to }, status: { in: ["booked", "completed"] } },
      select: { date: true, packageName: true },
    }),
  ]);

  const seen = new Map();
  for (const r of [...bookings, ...inquiries]) {
    if (!r.date) continue;
    const key = eventKeyFor(r.date, r.packageName);
    if (seen.has(key)) continue;
    seen.set(key, {
      key,
      date: r.date,
      label: prettyDate(r.date) + (r.packageName ? " — " + r.packageName : ""),
    });
  }

  return [...seen.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Why this file cannot be accepted, or null when it can. */
function rejectReason(file) {
  const f = file || {};
  const name = String(f.name || "").trim();
  const type = String(f.type || "").toLowerCase();
  const size = Number(f.size);

  if (!name) return "that file has no name";
  if (!ALLOWED[type]) return "we can take photos and videos — that one is " + (type || "an unknown type");
  if (!(size > 0)) return "that file looks empty";
  if (size > MAX_BYTES) {
    return "that file is " + (size / 1073741824).toFixed(1) + "GB and the limit is "
      + (MAX_BYTES / 1073741824).toFixed(1) + "GB";
  }
  return null;
}

// Storage path. The guest's own filename is never used as a path: it arrives
// from a phone and can contain anything at all. The original is kept on the row
// so the puller can restore it locally, where it is only ever a filename.
function storagePathFor(eventKey, contentType, id) {
  const ext = ALLOWED[String(contentType).toLowerCase()] || "";
  return eventKey.replace(/[^a-zA-Z0-9 _-]/g, "") + "/" + id + ext;
}

// A filename the owner can read in the inbox without opening anything.
function localFileNameFor(upload) {
  const ext = ALLOWED[String(upload.contentType).toLowerCase()] || "";
  const who = String(upload.uploaderName || "guest")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24) || "guest";
  const stamp = new Date(upload.createdAt).toISOString().slice(11, 19).replace(/:/g, "");
  return "guest_" + who + "_" + stamp + "_" + upload.id.slice(-6) + ext;
}

module.exports = {
  BUCKET, MAX_BYTES, ALLOWED,
  eventKeyFor, prettyDate, selectableEvents,
  rejectReason, storagePathFor, localFileNameFor,
};
