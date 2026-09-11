const { ledgerOriginFor } = require("./channels");
// Turning a completed charter into an income row, in one place.
//
// WHY THIS IS A MODULE. Marking a charter completed is the moment its money
// becomes real, and this used to live inline in the bookings PATCH route. That
// was fine while the bookings tab was the only way to complete a charter.
//
// It stopped being fine on 8 Sep 2026, when the Inquiries tab started pushing
// its status onto the mirror booking (see lib/bookingStatus.js). Without this,
// completing a website charter from Inquiries would have flipped the booking to
// "completed" and quietly written no income row at all — which is precisely the
// failure that already cost this business six charters' income, found and
// re-entered one at a time.
//
// One rule for how a charter's money is recognised, whichever tab it was
// recognised from.

// Idempotent on purpose: it looks for an existing linked income row first, so
// re-saving a completed booking, or flipping the status back and forth, can
// never double the income.
//
// It also refuses to guess. No pricePaid means no row, because a fabricated
// number sitting in the ledger is worse than an obviously missing one.
//
// Returns the created LedgerEntry, or null when nothing was written — which is
// the common case and is not an error.
async function recordCompletedBookingIncome(prisma, booking) {
  if (!booking || booking.status !== "completed") return null;
  if (!(Number(booking.pricePaid) > 0)) return null;

  const already = await prisma.ledgerEntry.findFirst({
    where: { type: "income", externalBookingId: booking.id },
  });
  if (already) return null;

  return prisma.ledgerEntry.create({
    data: {
      type: "income",
      category: "Reservation",
      subcategory: booking.vesselName || null,
      amount: booking.pricePaid,
      // For a platform booking, pricePaid is the payout — what the guest was
      // charged is not knowable here. Left null rather than guessed; the
      // reconciliation tab is where a gross figure gets filled in.
      grossAmount: null,
      note: [
        booking.guestName,
        booking.vesselName,
        booking.hours ? `${booking.hours}hr` : null,
        "auto-logged when marked completed",
      ].filter(Boolean).join(" — "),
      // HOW THE MONEY ARRIVED — READ, NOT GUESSED.
      //
      // This used to be `platform === "Other" ? "Cash" : platform`, which was a
      // guess wearing a rule's clothes. It held only while the single way to
      // pay a text-taken booking was to hand over notes, and it broke the day
      // those bookings gained a /pay link: a card payment filed as cash, in the
      // channel that is hardest to reconcile and easiest to lose.
      //
      // The owner's rule, 11 Sep 2026: "The only way to capture cash payments
      // would be me telling u they paid in cash, no other way to confirm it
      // really." So the booking now carries paymentMethod and this reads it.
      //
      // Null when nothing has been asserted and the channel cannot answer
      // either — which is a booking whose money nobody has accounted for, and
      // should look like one. See lib/channels.js.
      origin: ledgerOriginFor(booking),
      bookingId: booking.bookingId || null,
      externalBookingId: booking.id,
      date: booking.date,
    },
  });
}

module.exports = { recordCompletedBookingIncome };
