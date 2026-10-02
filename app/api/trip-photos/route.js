const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");
const { storageConfigured, signUploadUrl, storedSize } = require("../../../lib/guestUploads");
const {
  MAX_PER_CHARTER, isRestricted, refsField, photoPathFor, acceptableName,
} = require("../../../lib/tripPhotos");

// The crew's side of "our photos of your trip".
//
// GET  ?status=...&folder=...  -- what is on the trip pages, or was taken down.
// POST action:"sign"    {charterDate, folder, fileName, bytes} -- a photo from a
//                        charter's Completed folder: writes the row and hands back
//                        a one-shot upload URL for its web-sized copy.
// POST action:"confirm" {id} -- the copy landed; it is now on the trip page.
// POST action:"remove"  {id} -- it left the Completed folder; take it down.
//
// THE COMPLETED FOLDER IS THE DECISION. Owner, 2 Oct 2026, asked whether a photo
// in a charter's curated folder should wait for his yes: "Folder is enough." So
// confirm makes it visible, and Coral's choice of what goes into Completed is the
// check. He can still take any photo down from the console, and one he took down
// stays down: sign refuses a file that already has a row, whatever its status.

async function authorized(req) {
  const key = req.headers.get("x-jarvis-key");
  return (await isAdminAuthenticated())
    || Boolean(process.env.JARVIS_SERVICE_KEY && key === process.env.JARVIS_SERVICE_KEY);
}

function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

async function GET(req) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const folder = url.searchParams.get("folder");
  const rows = await prisma.tripPhoto.findMany({
    where: {
      ...(status ? { status } : { status: { not: "pending" } }),
      ...(folder ? { folder } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, charterDate: true, folder: true, fileName: true, status: true, decidedAt: true },
  });
  return NextResponse.json({ photos: rows });
}

async function POST(req) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!storageConfigured()) return NextResponse.json({ error: "Storage is not configured on this deployment." }, { status: 503 });
  const body = await req.json().catch(() => ({}));

  if (body.action === "confirm") {
    const id = clean(body.id, 40);
    const row = id ? await prisma.tripPhoto.findUnique({ where: { id } }) : null;
    if (!row) return NextResponse.json({ error: "Unknown photo" }, { status: 404 });
    const size = await storedSize(row.storagePath);
    if (size == null) return NextResponse.json({ ok: false, error: "Storage cannot see that file yet." });
    await prisma.tripPhoto.update({ where: { id }, data: { status: "approved", bytes: size || row.bytes, decidedAt: new Date() } });
    return NextResponse.json({ ok: true, status: "approved" });
  }

  if (body.action === "remove") {
    const id = clean(body.id, 40);
    const row = id ? await prisma.tripPhoto.findUnique({ where: { id } }) : null;
    if (!row) return NextResponse.json({ error: "Unknown photo" }, { status: 404 });
    // Only what the folder put up is the folder's to take down. A photo the
    // owner removed is already off the page, and stays recorded as his call.
    if (row.status !== "approved") return NextResponse.json({ ok: true, status: row.status });
    await prisma.tripPhoto.update({ where: { id }, data: { status: "removed", note: "left the Completed folder", decidedAt: new Date() } });
    return NextResponse.json({ ok: true, status: "removed" });
  }

  // ---- sign -----------------------------------------------------------------
  const charterDate = clean(body.charterDate, 10);
  const folder = clean(body.folder, 200);
  const fileName = clean(body.fileName, 240);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(charterDate)) return NextResponse.json({ error: "charterDate must be YYYY-MM-DD" }, { status: 400 });
  // A charter folder starts with its date. A THEME folder (Boatz and Glowz,
  // Bachelor and Bachelorette...) does not, but its finished files carry the
  // date in their own names -- 2026-09-19_glowz_neon-deck_3x4.jpg -- which is how
  // the glow night's guests, who have no charter folder of their own, get their
  // photos (2 Oct 2026).
  const base = fileName.split("/").pop();
  const dated = folder.startsWith(charterDate) || base.startsWith(charterDate) || base.startsWith(charterDate.replace(/-/g, ""));
  if (!folder || !dated) return NextResponse.json({ error: "the folder or the file's own name must start with the charter's date" }, { status: 400 });
  if (!acceptableName(fileName)) return NextResponse.json({ error: "photos only: .jpg or .png" }, { status: 400 });
  if (isRestricted(folder, fileName)) return NextResponse.json({ error: "that folder or file is marked as never to be published" }, { status: 400 });

  // Any status counts, so a photo the owner took down is never put back up by
  // the next sync, and one that left the folder and came back needs his hand.
  const existing = await prisma.tripPhoto.findFirst({ where: { folder, fileName, status: { not: "pending" } } });
  if (existing) return NextResponse.json({ error: "already " + existing.status, id: existing.id, status: existing.status }, { status: 409 });

  const already = await prisma.tripPhoto.count({ where: { charterDate, status: "approved" } });
  if (already >= MAX_PER_CHARTER) {
    return NextResponse.json({ error: "this charter already has " + already + " photos on its trip page; the limit is " + MAX_PER_CHARTER }, { status: 429 });
  }

  // Who may see it: every completed booking on that date that carries a number.
  // A charter that never completed has no guests to show it to.
  const bookings = await prisma.externalBooking.findMany({
    where: { date: charterDate, status: "completed", bookingId: { not: null } },
    select: { bookingId: true },
  });
  const refs = refsField(bookings.map((b) => b.bookingId));
  if (!refs) return NextResponse.json({ error: "no completed booking with a number on " + charterDate }, { status: 400 });

  const row = await prisma.tripPhoto.create({
    data: {
      charterDate, folder, fileName, bookingRefs: refs,
      bytes: Math.max(0, Math.round(Number(body.bytes) || 0)),
      storagePath: "pending:" + Date.now() + ":" + Math.random().toString(36).slice(2),
      proposedBy: clean(body.proposedBy, 60) || "Nauti Coral",
      status: "pending",
    },
  });
  const storagePath = photoPathFor(charterDate, row.id);
  await prisma.tripPhoto.update({ where: { id: row.id }, data: { storagePath } });

  try {
    const uploadUrl = await signUploadUrl(storagePath);
    return NextResponse.json({ id: row.id, uploadUrl, bookingRefs: refs });
  } catch (err) {
    await prisma.tripPhoto.update({ where: { id: row.id }, data: { status: "rejected", note: "could not sign: " + String(err.message).slice(0, 160) } }).catch(() => {});
    return NextResponse.json({ error: "could not start the upload" }, { status: 502 });
  }
}

module.exports = { GET, POST };
