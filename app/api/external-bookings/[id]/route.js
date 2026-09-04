const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { STATUSES } = require("../../../../lib/bookingStatus");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: { status?, pricePaid?, startTime?, hours?, guestName?, email?, partySize?, note? } —
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
  // How the booking was WON, as opposed to which platform processed it. The
  // three highest-value bookings on record (repeat guest, direct, word of
  // mouth) all sit under platform "Other", so `platform` alone cannot answer
  // "what is actually bringing in work".
  if ("referralSource" in body) data.referralSource = body.referralSource || null;
  // "Never ask this one for a review." Already on the model and honoured by the
  // weekly reminder script; the console could not set it until now.
  if ("marketingOptOut" in body) data.marketingOptOut = Boolean(body.marketingOptOut);
  // null clears the mark ("undo ask"); a truthy value stamps it now.
  if ("reviewRequestedAt" in body) data.reviewRequestedAt = body.reviewRequestedAt ? new Date(body.reviewRequestedAt) : null;
  if ("platformRef" in body) data.platformRef = body.platformRef || null;

  const updated = await prisma.externalBooking.update({ where: { id }, data });

  // Marking a charter completed is the moment its money becomes real, and until
  // now nothing happened to the ledger when it did — every income row had to be
  // typed in separately, and the two records were only ever joined by hand.
  // That is exactly how six charters' income went missing and had to be found
  // and re-entered one at a time.
  //
  // Idempotent on purpose: it looks for an existing linked income row first, so
  // re-saving a completed booking, or flipping the status back and forth, can
  // never double the income.
  //
  // It also refuses to guess. No pricePaid means no row, because a fabricated
  // number sitting in the ledger is worse than an obviously missing one.
  let ledgerCreated = null;
  if (updated.status === "completed" && updated.pricePaid > 0) {
    const already = await prisma.ledgerEntry.findFirst({
      where: { type: "income", externalBookingId: updated.id },
    });
    if (!already) {
      ledgerCreated = await prisma.ledgerEntry.create({
        data: {
          type: "income",
          category: "Reservation",
          subcategory: updated.vesselName || null,
          amount: updated.pricePaid,
          // For a platform booking, pricePaid is the payout — what the guest
          // was charged is not knowable here. Left null rather than guessed;
          // the reconciliation tab is where a gross figure gets filled in.
          grossAmount: null,
          note: [
            updated.guestName,
            updated.vesselName,
            updated.hours ? `${updated.hours}hr` : null,
            "auto-logged when marked completed",
          ].filter(Boolean).join(" — "),
          origin: updated.platform === "Other" ? "Cash" : updated.platform,
          bookingId: updated.bookingId || null,
          externalBookingId: updated.id,
          date: updated.date,
        },
      });
    }
  }

  return NextResponse.json({ ...updated, ledgerCreated });
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
