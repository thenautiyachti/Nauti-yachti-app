const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");
const { storageConfigured, signUploadUrl, storedSize } = require("../../../lib/guestUploads");
const {
  MAX_PER_CHARTER, isRestricted, refsField, photoPathFor, acceptableName,
} = require("../../../lib/tripPhotos");

// Coral's side of "our photos of your trip".
//
// GET  ?status=approved|proposed&folder=...  -- what has been proposed or approved
//                                              (mirror-guest-photos.js reads approved).
// POST action:"sign"    {charterDate, folder, fileName, bytes} -- a proposal: writes the
//                        row and hands back a one-shot upload URL for the web-sized copy.
// POST action:"confirm" {id} -- the copy landed; it becomes a proposal he can see.
//
// THE CREW PROPOSES, HE DECIDES. Nothing here makes a photo visible to a guest.
// That happens only in /api/admin/trip-photos, behind his console session.
// Owner, 2 Oct 2026: "Coral picks, I approve."

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
    await prisma.tripPhoto.update({ where: { id }, data: { status: "proposed", bytes: size || row.bytes } });
    return NextResponse.json({ ok: true, status: "proposed" });
  }

  // ---- sign -----------------------------------------------------------------
  const charterDate = clean(body.charterDate, 10);
  const folder = clean(body.folder, 200);
  const fileName = clean(body.fileName, 240);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(charterDate)) return NextResponse.json({ error: "charterDate must be YYYY-MM-DD" }, { status: 400 });
  if (!folder || !folder.startsWith(charterDate)) return NextResponse.json({ error: "folder must be the charter folder, starting with its date" }, { status: 400 });
  if (!acceptableName(fileName)) return NextResponse.json({ error: "photos only: .jpg or .png" }, { status: 400 });
  if (isRestricted(folder, fileName)) return NextResponse.json({ error: "that folder or file is marked as never to be published" }, { status: 400 });

  const existing = await prisma.tripPhoto.findFirst({ where: { folder, fileName, status: { not: "pending" } } });
  if (existing) return NextResponse.json({ error: "already " + existing.status, id: existing.id, status: existing.status }, { status: 409 });

  const already = await prisma.tripPhoto.count({ where: { charterDate, status: { in: ["proposed", "approved"] } } });
  if (already >= MAX_PER_CHARTER) {
    return NextResponse.json({ error: "this charter already has " + already + " photos proposed or approved; the limit is " + MAX_PER_CHARTER }, { status: 429 });
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
