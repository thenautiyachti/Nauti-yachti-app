const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { signedReadUrls, previewKind, storageConfigured, localFileNameFor } = require("../../../../lib/guestUploads");

// Photos and video guests have sent in, for the console.
//
// Until 2 Oct 2026 there was no console view of these at all: the owner learned
// of an upload when scripts/pull-guest-uploads.js dropped it into
// Photos\00 Inbox. With the trip page asking every guest for their photos, he
// needs to SEE what has come in, from his phone, without a PC run.
//
// GET   -- the latest uploads from both doors (the share page and trip pages),
//          each with a link that works for an hour. summary.fresh is how many
//          have arrived and not yet been pulled to the PC.
// PATCH {id, status}  -- "rejected" throws one out (the puller then skips it);
//          "uploaded" puts it back. Rows are never deleted; see GuestUpload.
//
// Nothing here publishes anything. Using a guest photo in a post or on the site
// goes through the media library and the approval it always has.

// scripts/pull-guest-uploads.js removes a file from storage once it is safely
// on the PC, and says so on the row (owner, 2 Oct 2026: the free plan holds 1 GB).
function onPcOnly(r) {
  return r.status === "pulled" && /^on the PC only/.test(String(r.note || ""));
}

async function GET(req) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const url = new URL(req.url);
  const showRejected = url.searchParams.get("rejected") === "1";

  const rows = await prisma.guestUpload.findMany({
    where: { status: { in: showRejected ? ["uploaded", "pulled", "rejected"] : ["uploaded", "pulled"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  // Rejected files are listed for the record but not re-signed: there is no
  // reason to keep handing out links to something he threw out. Nor are files
  // the pull script has already moved to the PC and removed from storage.
  // Once Coral approves a pulled photo she moves it into its charter's
  // Completed/_guest media, and the next sync puts a web copy on that trip page.
  // That copy is the preview here, and its folder is where the file now is
  // (3 Oct 2026: Tyler's card still said "in 00 Inbox" after it had been filed).
  // The PC copy's name ends with the upload's own id, so the match is exact.
  const pulled = rows.filter((r) => r.status !== "rejected" && onPcOnly(r)).map((r) => ({ id: r.id, name: localFileNameFor(r) }));
  const onTrip = {};
  if (pulled.length) {
    const copies = await prisma.tripPhoto.findMany({
      where: { status: "approved", OR: pulled.map((p) => ({ fileName: { endsWith: "/" + p.name } })) },
      select: { folder: true, fileName: true, storagePath: true },
    });
    for (const p of pulled) {
      const c = copies.find((x) => x.fileName.endsWith("/" + p.name));
      if (c) onTrip[p.id] = c;
    }
  }
  const urls = await signedReadUrls([
    ...rows.filter((r) => r.status !== "rejected" && !onPcOnly(r)).map((r) => r.storagePath),
    ...Object.values(onTrip).map((c) => c.storagePath),
  ]);
  const fresh = await prisma.guestUpload.count({ where: { status: "uploaded" } });

  return NextResponse.json({
    configured: storageConfigured(),
    summary: { fresh },
    uploads: rows.map((r) => ({
      id: r.id,
      status: r.status,
      source: r.source || "share",
      by: r.uploaderName,
      phone: r.uploaderPhone || null,
      bookingId: r.bookingId,
      eventLabel: r.eventLabel,
      fileName: r.fileName,
      kind: previewKind(r.contentType),
      sizeBytes: r.sizeBytes,
      consentAt: r.consentAt,
      consentText: r.consentText || null,
      createdAt: r.createdAt,
      pulledAt: r.pulledAt,
      onPcOnly: onPcOnly(r),
      // Filed and on its trip page: the charter folder it lives in, and a
      // preview of the trip-page copy (the original stays on the PC).
      filedIn: onTrip[r.id] ? onTrip[r.id].folder : null,
      url: onTrip[r.id] ? urls[onTrip[r.id].storagePath] || null : urls[r.storagePath] || null,
    })),
  });
}

async function PATCH(req) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").slice(0, 40);
  const status = body.status === "rejected" ? "rejected" : body.status === "uploaded" ? "uploaded" : null;
  if (!id || !status) return NextResponse.json({ error: "id and status (rejected|uploaded) are required" }, { status: 400 });

  const row = await prisma.guestUpload.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Putting one back that already reached the PC returns it to "pulled", not
  // "uploaded" -- otherwise the puller would fetch it a second time.
  const next = status === "uploaded" && row.pulledAt ? "pulled" : status;
  const updated = await prisma.guestUpload.update({ where: { id }, data: { status: next } });
  return NextResponse.json({ id: updated.id, status: updated.status });
}

module.exports = { GET, PATCH };
