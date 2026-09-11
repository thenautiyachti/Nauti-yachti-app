const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const {
  STATUSES,
  statusesAgree,
  bookingStatusToInquiry,
} = require("../../../../lib/bookingStatus");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { normalizePhone } = require("../../../../lib/bookingPhones");
const { recordCompletedBookingIncome } = require("../../../../lib/bookingLedger");

// Body: { status?, pricePaid?, paymentMethod?, startTime?, hours?, guestName?, email?, partySize?, note? } —
// only the fields present are updated. Setting status updates whether the
// date counts as "partially" booked (its own hours only, and only while
// status is "completed") — see /api/partial-dates. The rest let the owner
// fill in details after the fact (e.g. logging what a guest actually paid
// once known).
async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.externalBooking.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const data = {};
  if ("status" in body) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }
  if ("pricePaid" in body) data.pricePaid = body.pricePaid === "" || body.pricePaid == null ? null : Number(body.pricePaid);
  if ("startTime" in body) data.startTime = body.startTime || null;
  if ("hours" in body) data.hours = body.hours === "" || body.hours == null ? null : Number(body.hours);
  if ("guestName" in body) data.guestName = body.guestName || null;
  if ("email" in body) data.email = body.email || null;
  if ("partySize" in body) data.partySize = body.partySize === "" || body.partySize == null ? null : Number(body.partySize);
  if ("note" in body) data.note = body.note || null;
  if ("phone" in body) data.phone = body.phone || null;
  // Everyone else on the booking. Validated through the one module that knows
  // the shape, so a hand-rolled payload cannot put unparseable text in the
  // column and break the dock page for every booking that follows.
  if ("phonesJson" in body) {
    if (body.phonesJson == null || body.phonesJson === "") {
      data.phonesJson = null;
    } else {
      let parsed;
      try {
        parsed = typeof body.phonesJson === "string" ? JSON.parse(body.phonesJson) : body.phonesJson;
      } catch {
        return NextResponse.json({ error: "phonesJson is not valid JSON" }, { status: 400 });
      }
      if (!Array.isArray(parsed)) {
        return NextResponse.json({ error: "phonesJson must be an array" }, { status: 400 });
      }
      const clean = parsed
        .map((e) => ({ number: normalizePhone(e && e.number), label: String((e && e.label) || "").trim() }))
        .filter((e) => e.number);
      data.phonesJson = clean.length ? JSON.stringify(clean) : null;
    }
  }
  // How the booking was WON, as opposed to which platform processed it. The
  // three highest-value bookings on record (repeat guest, direct, word of
  // mouth) all sit under platform "Other", so `platform` alone cannot answer
  // "what is actually bringing in work".
  if ("referralSource" in body) data.referralSource = body.referralSource || null;
  // HOW the money arrived. Only ever set because somebody said so -- there is
  // no signal anywhere that proves cash changed hands, which is precisely why
  // the ledger must not infer it. Empty string clears it back to unknown.
  if ("paymentMethod" in body) data.paymentMethod = body.paymentMethod || null;
  // "Never ask this one for a review." Already on the model and honoured by the
  // weekly reminder script; the console could not set it until now.
  if ("marketingOptOut" in body) data.marketingOptOut = Boolean(body.marketingOptOut);
  // null clears the mark ("undo ask"); a truthy value stamps it now.
  if ("reviewRequestedAt" in body) data.reviewRequestedAt = body.reviewRequestedAt ? new Date(body.reviewRequestedAt) : null;
  // Same shape for the gate code: stamped when it is texted from the dock page,
  // cleared to undo. The dock page had no way to record this at all, so a card
  // looked identical before and after sending and the only way to answer "did I
  // already do this?" was to go and read your own text messages.
  if ("gateCodeSentAt" in body) data.gateCodeSentAt = body.gateCodeSentAt ? new Date(body.gateCodeSentAt) : null;
  if ("platformRef" in body) data.platformRef = body.platformRef || null;

  const updated = await prisma.externalBooking.update({ where: { id }, data });

  // Marking a charter completed is the moment its money becomes real, and until
  // now nothing happened to the ledger when it did — every income row had to be
  // typed in separately, and the two records were only ever joined by hand.
  // That is exactly how six charters' income went missing and had to be found
  // and re-entered one at a time.
  //
  // The rule itself moved to lib/bookingLedger.js on 8 Sep 2026, so that
  // completing a charter from the Inquiries tab recognises its money the same
  // way this route does. It is idempotent and refuses to guess a price.
  const ledgerCreated = await recordCompletedBookingIncome(prisma, updated);

  // KEEP THE WEBSITE INQUIRY IN STEP.
  //
  // A website checkout leaves two rows for one charter — the Inquiry the guest
  // filled in, and the mirror booking the Stripe webhook creates. Nothing
  // joined their statuses, so marking a charter completed here left the
  // Inquiries tab still showing it as booked and paid. Reported 8 Sep 2026 on
  // Oscar RoblesGil's 6 Sep charter, the first website checkout to make such a
  // pair; every one after him would have done the same.
  //
  // Matched on bookingId, which the checkout stamps on both rows, and falling
  // back to the Stripe session id. Both are unique, so this can never touch a
  // different guest's row.
  //
  // updateMany, not update: a booking with no inquiry behind it (every platform
  // booking) must be a no-op, not a crash.
  let inquirySynced = null;
  if ("status" in body) {
    const where = updated.bookingId
      ? { bookingId: updated.bookingId }
      : updated.platformRef
        ? { stripeSessionId: updated.platformRef }
        : null;
    if (where) {
      const linked = await prisma.inquiry.findFirst({ where });
      // Compare buckets rather than strings, or a live inquiry sitting at
      // "pending" gets rewritten to "new" on every unrelated save.
      if (linked && !statusesAgree(linked.status, updated.status)) {
        const next = bookingStatusToInquiry(updated.status);
        await prisma.inquiry.update({ where: { id: linked.id }, data: { status: next } });
        inquirySynced = { id: linked.id, from: linked.status, to: next };
      }
    }
  }

  return NextResponse.json({ ...updated, ledgerCreated, inquirySynced });
}

async function DELETE(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.externalBooking.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
