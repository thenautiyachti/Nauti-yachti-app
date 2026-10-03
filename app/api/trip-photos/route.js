const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");
const { storageConfigured, signUploadUrl, storedSize } = require("../../../lib/guestUploads");
const {
  MAX_PER_CHARTER, isRestricted, refsField, photoPathFor, acceptableName, bookingsForFolder,
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

// ---- one photo at a time, used singly or in a batch --------------------------
// Each returns { status, body } so the single and batch forms answer alike.

async function confirmOne(rawId) {
  const id = clean(rawId, 40);
  const row = id ? await prisma.tripPhoto.findUnique({ where: { id } }) : null;
  if (!row) return { status: 404, body: { id, error: "Unknown photo" } };
  const size = await storedSize(row.storagePath);
  if (size == null) return { status: 200, body: { id, ok: false, error: "Storage cannot see that file yet." } };
  await prisma.tripPhoto.update({ where: { id }, data: { status: "approved", bytes: size || row.bytes, decidedAt: new Date() } });
  return { status: 200, body: { id, ok: true, status: "approved" } };
}

async function removeOne(rawId) {
  const id = clean(rawId, 40);
  const row = id ? await prisma.tripPhoto.findUnique({ where: { id } }) : null;
  if (!row) return { status: 404, body: { id, error: "Unknown photo" } };
  // Only what the folder put up is the folder's to take down. A photo the
  // owner removed is already off the page, and stays recorded as his call.
  if (row.status !== "approved") return { status: 200, body: { id, ok: true, status: row.status } };
  await prisma.tripPhoto.update({ where: { id }, data: { status: "removed", note: "left the Completed folder", decidedAt: new Date() } });
  return { status: 200, body: { id, ok: true, status: "removed" } };
}

async function signOne(item) {
  const charterDate = clean(item.charterDate, 10);
  const folder = clean(item.folder, 200);
  const fileName = clean(item.fileName, 240);
  const echo = { folder, fileName };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(charterDate)) return { status: 400, body: { ...echo, error: "charterDate must be YYYY-MM-DD" } };
  // A charter folder starts with its date. A THEME folder (Boatz and Glowz,
  // Bachelor and Bachelorette...) does not, but its finished files carry the
  // date in their own names -- 2026-09-19_glowz_neon-deck_3x4.jpg -- which is how
  // the glow night's guests, who have no charter folder of their own, get their
  // photos (2 Oct 2026).
  const base = fileName.split("/").pop();
  const dated = folder.startsWith(charterDate) || base.startsWith(charterDate) || base.startsWith(charterDate.replace(/-/g, ""));
  if (!folder || !dated) return { status: 400, body: { ...echo, error: "the folder or the file's own name must start with the charter's date" } };
  if (!acceptableName(fileName)) return { status: 400, body: { ...echo, error: "photos only: .jpg or .png" } };
  if (isRestricted(folder, fileName)) return { status: 400, body: { ...echo, error: "that folder or file is marked as never to be published" } };

  // Any status counts, so a photo the owner took down is never put back up by
  // the next sync, and one that left the folder and came back needs his hand.
  const existing = await prisma.tripPhoto.findFirst({ where: { folder, fileName, status: { not: "pending" } } });
  if (existing) return { status: 409, body: { ...echo, error: "already " + existing.status, id: existing.id } };

  // Pending ones from the last hour count too, so one batch cannot sail past the
  // limit before any of it is confirmed. An older pending row is an upload that
  // never finished, and does not hold a place.
  // Per charter FOLDER, not per date: two charters on one day are two trip pages.
  const already = await prisma.tripPhoto.count({
    where: { folder, OR: [{ status: "approved" }, { status: "pending", createdAt: { gt: new Date(Date.now() - 3600000) } }] },
  });
  if (already >= MAX_PER_CHARTER) {
    return { status: 429, body: { ...echo, error: "this charter already has " + already + " photos on its trip page; the limit is " + MAX_PER_CHARTER } };
  }

  // Who may see it: the completed bookings on that date that carry a number --
  // and when there are several, only the ones the folder names (two separate
  // charters on one day each have their own folder; see bookingsForFolder).
  // A charter that never completed has no guests to show it to.
  const bookings = await prisma.externalBooking.findMany({
    where: { date: charterDate, status: "completed", bookingId: { not: null } },
    select: { bookingId: true, guestName: true },
  });
  const refs = refsField(bookingsForFolder(folder, bookings).map((b) => b.bookingId));
  if (!refs) return { status: 400, body: { ...echo, error: "no completed booking with a number on " + charterDate } };

  const row = await prisma.tripPhoto.create({
    data: {
      charterDate, folder, fileName, bookingRefs: refs,
      bytes: Math.max(0, Math.round(Number(item.bytes) || 0)),
      storagePath: "pending:" + Date.now() + ":" + Math.random().toString(36).slice(2),
      proposedBy: clean(item.proposedBy, 60) || "Nauti Coral",
      status: "pending",
    },
  });
  const storagePath = photoPathFor(charterDate, row.id);
  await prisma.tripPhoto.update({ where: { id: row.id }, data: { storagePath } });

  try {
    const uploadUrl = await signUploadUrl(storagePath);
    return { status: 200, body: { ...echo, id: row.id, uploadUrl, bookingRefs: refs } };
  } catch (err) {
    await prisma.tripPhoto.update({ where: { id: row.id }, data: { status: "rejected", note: "could not sign: " + String(err.message).slice(0, 160) } }).catch(() => {});
    return { status: 502, body: { ...echo, error: "could not start the upload" } };
  }
}

// BATCHES, because of the bot checkpoint. Vercel challenges this whole PC after
// roughly forty requests in ten minutes, and the crew's own scripts are blocked
// with it. A season's photos sent one call at a time is hundreds of calls, so
// `items` (sign) and `ids` (confirm, remove) carry up to 50 per request. The
// uploads themselves go straight to storage and never touch Vercel.
const BATCH = 50;

async function POST(req) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!storageConfigured()) return NextResponse.json({ error: "Storage is not configured on this deployment." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const each = async (list, fn) => {
    const results = [];
    for (const x of list.slice(0, BATCH)) results.push((await fn(x)).body); // in order: the count limit depends on it
    return NextResponse.json({ results });
  };

  if (body.action === "confirm") {
    if (Array.isArray(body.ids)) return each(body.ids, confirmOne);
    const r = await confirmOne(body.id); return NextResponse.json(r.body, { status: r.status });
  }
  if (body.action === "remove") {
    if (Array.isArray(body.ids)) return each(body.ids, removeOne);
    const r = await removeOne(body.id); return NextResponse.json(r.body, { status: r.status });
  }
  if (Array.isArray(body.items)) return each(body.items, signOne);
  const r = await signOne(body);
  return NextResponse.json(r.body, { status: r.status });
}

module.exports = { GET, POST };
