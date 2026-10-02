const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { verifyTripKey, normalizeRef } = require("../../../../lib/tripLink");
const { findTrip } = require("../../../../lib/tripBooking");
const { tripView } = require("../../../../lib/tripInfo");
const { draftTripReply } = require("../../../../lib/tripDrafts");
const { sendTripMessageOwnerEmail } = require("../../../../lib/email");

// The message board on a guest's trip page.
//
// GET  ?ref&k            -- the conversation so far.
// POST {ref,k,author,body} -- a guest writes. The owner is emailed; nothing is
//                           sent back automatically. See lib/tripDrafts.js for
//                           the draft he is offered, and app/api/admin/trip-messages
//                           for where he answers.

const MAX_BODY = 2000;
// A party chatting is fine; a script is not. Per booking, per hour.
const PER_HOUR = Number(process.env.TRIP_MESSAGES_PER_HOUR || 20);

function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

async function authorised(ref, key) {
  const r = normalizeRef(ref);
  if (!r || !verifyTripKey(r, key)) return null;
  const trip = await findTrip(r);
  return trip ? { ref: r, trip } : null;
}

function shape(m) {
  return { id: m.id, fromGuest: m.fromGuest, author: m.author, body: m.body, createdAt: m.createdAt };
}

async function GET(req) {
  const url = new URL(req.url);
  const auth = await authorised(url.searchParams.get("ref"), url.searchParams.get("k"));
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await prisma.tripMessage.findMany({ where: { bookingId: auth.ref }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ messages: rows.map(shape) });
}

async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const auth = await authorised(body.ref, body.k);
  if (!auth) return NextResponse.json({ error: "This trip link is not valid." }, { status: 404 });

  const text = clean(body.body, MAX_BODY + 1);
  if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: "That is over " + MAX_BODY + " characters. Split it in two, or give us a call." }, { status: 400 });
  }
  const author = clean(body.author, 60) || null;

  const recent = await prisma.tripMessage.count({
    where: { bookingId: auth.ref, fromGuest: true, createdAt: { gt: new Date(Date.now() - 3600000) } },
  });
  if (recent >= PER_HOUR) {
    return NextResponse.json({ error: "That's a lot of messages in an hour. Call or text us on (832) 948-2912 instead." }, { status: 429 });
  }

  const msg = await prisma.tripMessage.create({
    data: { bookingId: auth.ref, fromGuest: true, author, body: text },
  });

  // Tell the owner, and tell him whether there is a draft waiting. The draft
  // itself is worked out again when he opens the thread (it is cheap and
  // deterministic), so nothing extra is stored here.
  const view = tripView(auth.trip);
  const draft = draftTripReply(text, view);
  const notice = await sendTripMessageOwnerEmail({
    bookingId: auth.ref,
    author: author || view.firstName || "A guest",
    when: view.when,
    body: text,
    drafted: draft.action === "draft",
    heldBecause: draft.action === "hold" ? draft.reason : null,
  }).catch(() => ({ sent: false }));
  if (notice && notice.sent) {
    await prisma.tripMessage.update({ where: { id: msg.id }, data: { emailedAt: new Date() } }).catch(() => {});
  }

  return NextResponse.json({ message: shape(msg) });
}

module.exports = { GET, POST };
