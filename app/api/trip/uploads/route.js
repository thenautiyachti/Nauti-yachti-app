const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { verifyTripKey, normalizeRef } = require("../../../../lib/tripLink");
const { findTrip } = require("../../../../lib/tripBooking");
const { tripView } = require("../../../../lib/tripInfo");
const {
  eventKeyFor, prettyDate, rejectReason, storagePathFor,
  storageConfigured, signUploadUrl, storedSize, signedReadUrls, previewKind,
} = require("../../../../lib/guestUploads");
const { TRIP_UPLOAD_CONSENT } = require("../../../../lib/uploadConsent");

// Photos and video sent in from a guest's trip page.
//
// GET  ?ref&k          -- what this party has already sent, with short-lived links to view it.
// POST action:"sign"   -- write the row, hand back a one-shot upload URL.
// POST action:"confirm"-- the browser says it landed; ask the bucket.
//
// The same pipeline as /share-your-photos (lib/guestUploads.js): the browser
// uploads straight to the private bucket and the app only does the paperwork.
// The difference is what the row knows. On the share page the guest picks a
// charter from a list and the booking is a guess from their phone number; here
// the link that opened the page was signed for one booking, so bookingId is a
// fact, and the consent wording is stored with the tick.
//
// Everything lands where share-page uploads land, so scripts/pull-guest-uploads.js
// brings these into Photos\00 Inbox with no change, and nothing is ever posted
// from here: the owner approves media the way he always has.

// A party of twelve each sending a handful is a lot more than one stranger on the
// share page, and every request here carries a signed link, so the ceiling is per
// booking and higher.
const PER_HOUR = Number(process.env.TRIP_UPLOAD_PER_HOUR || 200);

function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

async function authorised(ref, key) {
  const r = normalizeRef(ref);
  if (!r || !verifyTripKey(r, key)) return null;
  const trip = await findTrip(r);
  return trip ? { ref: r, trip } : null;
}

async function GET(req) {
  const url = new URL(req.url);
  const auth = await authorised(url.searchParams.get("ref"), url.searchParams.get("k"));
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.guestUpload.findMany({
    where: { bookingId: auth.ref, source: "trip", status: { in: ["uploaded", "pulled"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, uploaderName: true, fileName: true, contentType: true, sizeBytes: true, storagePath: true, createdAt: true, status: true, note: true },
  });
  // Once the pull script has moved a file to the owner's PC it is removed from
  // storage (the free plan holds 1 GB), so it is listed as received, not shown.
  const inStorage = (r) => !(r.status === "pulled" && /^on the PC only/.test(String(r.note || "")));
  const urls = await signedReadUrls(rows.filter(inStorage).map((r) => r.storagePath));
  return NextResponse.json({
    configured: storageConfigured(),
    uploads: rows.map((r) => ({
      id: r.id,
      by: r.uploaderName,
      fileName: r.fileName,
      kind: previewKind(r.contentType),
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
      url: urls[r.storagePath] || null,
    })),
  });
}

async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const auth = await authorised(body.ref, body.k);
  if (!auth) return NextResponse.json({ error: "This trip link is not valid." }, { status: 404 });
  if (!storageConfigured()) {
    return NextResponse.json({ error: "Uploads are not switched on yet. Please text us the photos instead." }, { status: 503 });
  }

  const view = tripView(auth.trip);
  if (!view.canUpload) {
    return NextResponse.json({ error: "Photo uploads open on the day of your trip." }, { status: 400 });
  }

  if (body.action === "confirm") {
    const id = clean(body.id, 40);
    const row = id ? await prisma.guestUpload.findUnique({ where: { id } }) : null;
    // Only this booking's own uploads can be confirmed from this booking's link.
    if (!row || row.bookingId !== auth.ref || row.source !== "trip") {
      return NextResponse.json({ error: "Unknown upload" }, { status: 404 });
    }
    // Trust the bucket, not the browser: see app/api/guest-uploads/route.js.
    const size = await storedSize(row.storagePath);
    if (size == null) return NextResponse.json({ ok: false, status: "pending", error: "We cannot see that file yet." });
    await prisma.guestUpload.update({
      where: { id: row.id },
      data: { status: "uploaded", sizeBytes: size || row.sizeBytes },
    });
    return NextResponse.json({ ok: true, status: "uploaded" });
  }

  // ---- sign -----------------------------------------------------------------
  const name = clean(body.name, 80);
  const file = body.file || {};
  if (!name) return NextResponse.json({ error: "Please tell us who these are from." }, { status: 400 });
  if (body.consent !== true) {
    return NextResponse.json({ error: "We need your permission before we can take them." }, { status: 400 });
  }
  const bad = rejectReason(file);
  if (bad) return NextResponse.json({ error: bad.charAt(0).toUpperCase() + bad.slice(1) + "." }, { status: 400 });

  const recent = await prisma.guestUpload.count({
    where: { bookingId: auth.ref, source: "trip", createdAt: { gt: new Date(Date.now() - 3600000) } },
  });
  if (recent >= PER_HOUR) {
    return NextResponse.json({ error: "That is a lot of files in one go. Give us an hour and send the rest." }, { status: 429 });
  }

  const t = auth.trip;
  const eventKey = eventKeyFor(t.date, t.packageName);
  const row = await prisma.guestUpload.create({
    data: {
      uploaderName: name,
      // The column predates the trip page and is required. Here the link is the
      // identity, and asking everybody aboard for a phone number to send a photo
      // would cost more uploads than it is worth.
      uploaderPhone: "",
      uploaderEmail: null,
      eventKey,
      eventLabel: prettyDate(t.date) + (t.packageName ? " — " + t.packageName : ""),
      bookingId: auth.ref,
      source: "trip",
      fileName: clean(file.name, 200),
      storagePath: "pending:" + Date.now() + ":" + Math.random().toString(36).slice(2),
      sizeBytes: Math.round(Number(file.size)),
      contentType: String(file.type).toLowerCase(),
      consentAt: new Date(),
      consentText: TRIP_UPLOAD_CONSENT,
      userAgent: clean(req.headers.get("user-agent"), 300) || null,
      status: "pending",
    },
  });

  const path = storagePathFor(eventKey, row.contentType, row.id);
  await prisma.guestUpload.update({ where: { id: row.id }, data: { storagePath: path } });

  let uploadUrl;
  try {
    uploadUrl = await signUploadUrl(path);
  } catch (err) {
    await prisma.guestUpload.update({
      where: { id: row.id },
      data: { status: "rejected", note: "could not sign: " + String(err.message).slice(0, 200) },
    }).catch(() => {});
    return NextResponse.json({ error: "We could not start that upload. Try again in a moment." }, { status: 502 });
  }
  return NextResponse.json({ id: row.id, uploadUrl });
}

module.exports = { GET, POST };
