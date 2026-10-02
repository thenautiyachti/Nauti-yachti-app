const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { signedReadUrls } = require("../../../../lib/guestUploads");
const { refsList, sharingWarning } = require("../../../../lib/tripPhotos");

// The owner's side of "our photos of your trip": what is on guests' trip pages.
//
// A photo goes up when Coral puts it in a charter's Completed folder -- owner,
// 2 Oct 2026: "Folder is enough." This is where he sees what went up and takes
// down anything he does not want there. A photo he takes down stays down: the
// sync never puts back a file that already has a row.
//
// GET   -- what is up (and, with ?rejected=1, what came down), grouped by charter,
//          with one-hour previews and the bookings whose guests see each one.
// PATCH {ids: [...], status: "rejected" | "approved"}
//          "rejected" takes photos down; "approved" puts one he took down back.

async function GET(req) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const url = new URL(req.url);
  const statuses = url.searchParams.get("rejected") === "1" ? ["approved", "rejected", "removed"] : ["approved"];

  const rows = await prisma.tripPhoto.findMany({
    where: { status: { in: statuses } },
    orderBy: [{ charterDate: "desc" }, { createdAt: "asc" }],
    take: 400,
  });
  const urls = await signedReadUrls(rows.filter((r) => r.status !== "rejected").map((r) => r.storagePath));

  // Name each booking once, so he can see whose trip page a photo lands on.
  const refs = [...new Set(rows.flatMap((r) => refsList(r.bookingRefs)))];
  const bookings = refs.length
    ? await prisma.externalBooking.findMany({
        where: { bookingId: { in: refs } },
        select: { bookingId: true, guestName: true, packageName: true },
      })
    : [];
  const byRef = new Map(bookings.map((b) => [b.bookingId, b]));

  const groups = new Map();
  for (const r of rows) {
    const key = r.charterDate + "|" + r.folder;
    if (!groups.has(key)) {
      const visibleTo = refsList(r.bookingRefs).map((ref) => ({
        ref, name: (byRef.get(ref) || {}).guestName || null, packageName: (byRef.get(ref) || {}).packageName || null,
      }));
      groups.set(key, { charterDate: r.charterDate, folder: r.folder, visibleTo, warning: sharingWarning(visibleTo), photos: [] });
    }
    groups.get(key).photos.push({
      id: r.id, status: r.status, fileName: r.fileName, bytes: r.bytes,
      proposedBy: r.proposedBy, decidedAt: r.decidedAt, url: urls[r.storagePath] || null,
    });
  }

  return NextResponse.json({
    charters: [...groups.values()],
    summary: { live: rows.filter((r) => r.status === "approved").length },
  });
}

async function PATCH(req) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids = (Array.isArray(body.ids) ? body.ids : []).map((x) => String(x).slice(0, 40)).filter(Boolean).slice(0, 200);
  const status = ["approved", "rejected"].includes(body.status) ? body.status : null;
  if (!ids.length || !status) return NextResponse.json({ error: "ids and status (approved|rejected) are required" }, { status: 400 });
  const r = await prisma.tripPhoto.updateMany({
    where: { id: { in: ids }, status: { not: "pending" } },
    data: { status, decidedAt: new Date(), note: status === "rejected" ? "taken down by the owner" : null },
  });
  return NextResponse.json({ updated: r.count, status });
}

module.exports = { GET, PATCH };
