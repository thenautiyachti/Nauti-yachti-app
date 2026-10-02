const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { findTrip } = require("../../../../lib/tripBooking");
const { tripView } = require("../../../../lib/tripInfo");
const { tripPath, tripUrl, normalizeRef } = require("../../../../lib/tripLink");
const { draftTripReply } = require("../../../../lib/tripDrafts");
const { sendTripReplyGuestEmail } = require("../../../../lib/email");

// Trip page messages, from the owner's side.
//
// GET   -- every conversation, newest activity first, each with the draft he is
//          offered; summary.waiting feeds the Messages tab badge.
// POST  {bookingId, body}   -- the owner replies. Owner only.
// PATCH {bookingId}         -- clear it: he answered another way. Sends nothing.
//
// THE CREW MAY READ, NEVER SEND. GET accepts the crew's service key so Siren can
// see what guests have asked and upsert a better draft through
// /api/message-suggestions. POST does not: owner, 2 Oct 2026, "drafts, you
// send". A reply reaches a guest only from the console, after he presses Send.

const MAX_BODY = 2000;
const FROM_US = "The Nauti Yachti";

async function canRead(req) {
  const key = req.headers.get("x-jarvis-key");
  return (await isAdminAuthenticated())
    || Boolean(process.env.JARVIS_SERVICE_KEY && key === process.env.JARVIS_SERVICE_KEY);
}

function conversationId(ref) {
  return "trip:" + ref;
}

async function GET(req) {
  if (!(await canRead(req))) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // A conversation that has gone quiet for four months is history, not a queue.
  const since = new Date(Date.now() - 120 * 86400000);
  const rows = await prisma.tripMessage.findMany({ where: { createdAt: { gt: since } }, orderBy: { createdAt: "asc" } });

  const byRef = new Map();
  for (const m of rows) {
    if (!byRef.has(m.bookingId)) byRef.set(m.bookingId, []);
    byRef.get(m.bookingId).push(m);
  }

  const drafts = byRef.size
    ? await prisma.messageReplyDraft.findMany({
        where: { platform: "trip", usedAt: null, conversationId: { in: [...byRef.keys()].map(conversationId) } },
      })
    : [];
  const draftFor = new Map(drafts.map((d) => [d.conversationId, d]));

  const threads = [];
  for (const [ref, msgs] of byRef) {
    const trip = await findTrip(ref);
    const view = trip ? tripView(trip) : null;
    const last = msgs[msgs.length - 1];
    const lastGuest = [...msgs].reverse().find((m) => m.fromGuest) || null;
    // Waiting means the guest spoke last and he has not cleared it. Clearing
    // (PATCH) is for a question he answered another way -- a call, a text --
    // and the next guest message brings it straight back.
    const guestSpokeLast = Boolean(last && last.fromGuest);
    const waiting = guestSpokeLast && !last.readAt;

    // A crew draft written against the guest's latest message wins; one written
    // before they wrote again is stale and is not offered. Failing both, the
    // instant draft from the booking's own details (lib/tripDrafts.js).
    let draft = null;
    if (guestSpokeLast && lastGuest) {
      const stored = draftFor.get(conversationId(ref));
      if (stored && (!stored.messageId || stored.messageId === lastGuest.id)) {
        draft = { action: "draft", suggestion: stored.suggestion, author: stored.author, reason: "written by " + stored.author };
      } else if (view) {
        const d = draftTripReply(lastGuest.body, view);
        draft = { ...d, author: d.action === "draft" ? "Nauti Pearl" : null };
      }
    }

    threads.push({
      bookingId: ref,
      guest: trip ? trip.name : null,
      hasEmail: Boolean(trip && trip.email),
      when: view ? view.when : null,
      packageName: trip ? trip.packageName : null,
      vesselName: trip ? trip.vesselName : null,
      tripPath: tripPath(ref),
      waiting,
      unread: msgs.filter((m) => m.fromGuest && !m.readAt).length,
      lastAt: last ? last.createdAt : null,
      draft,
      messages: msgs.map((m) => ({ id: m.id, fromGuest: m.fromGuest, author: m.author, body: m.body, createdAt: m.createdAt })),
    });
  }

  threads.sort((a, b) => (b.waiting - a.waiting) || (new Date(b.lastAt) - new Date(a.lastAt)));
  return NextResponse.json({ threads, summary: { waiting: threads.filter((t) => t.waiting).length } });
}

async function POST(req) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ref = normalizeRef(body.bookingId);
  const text = String(body.body || "").trim();
  if (!ref) return NextResponse.json({ error: "Which booking?" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "The reply is empty." }, { status: 400 });
  if (text.length > MAX_BODY) return NextResponse.json({ error: "Over " + MAX_BODY + " characters." }, { status: 400 });

  const trip = await findTrip(ref);
  if (!trip) return NextResponse.json({ error: "No booking " + ref }, { status: 404 });

  const now = new Date();
  const msg = await prisma.tripMessage.create({
    data: { bookingId: ref, fromGuest: false, author: FROM_US, body: text },
  });
  await prisma.tripMessage.updateMany({ where: { bookingId: ref, fromGuest: true, readAt: null }, data: { readAt: now } });
  await prisma.messageReplyDraft.updateMany({ where: { conversationId: conversationId(ref) }, data: { usedAt: now } });

  // The notice carries the reply itself, so the guest has the answer even if
  // they never open the page. No email on file (most platform bookings): the
  // reply waits on the page, and the console says so before he sends.
  const notice = trip.email
    ? await sendTripReplyGuestEmail({ email: trip.email, name: trip.name, bookingId: ref, body: text, link: tripUrl(ref) }).catch(() => ({ sent: false }))
    : { sent: false, reason: "no-guest-email" };
  if (notice.sent) {
    await prisma.tripMessage.update({ where: { id: msg.id }, data: { emailedAt: now } }).catch(() => {});
  }
  return NextResponse.json({ ok: true, emailed: Boolean(notice.sent), reason: notice.sent ? null : notice.reason });
}

async function PATCH(req) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ref = normalizeRef(body.bookingId);
  if (!ref) return NextResponse.json({ error: "Which booking?" }, { status: 400 });
  const r = await prisma.tripMessage.updateMany({ where: { bookingId: ref, fromGuest: true, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ updated: r.count });
}

module.exports = { GET, POST, PATCH };
