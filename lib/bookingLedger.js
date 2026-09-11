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
      // HOW THE MONEY ARRIVED, which is not the same as who booked it.
      //
      // platform "Other" used to mean Cash by definition, and that held while
      // the only way to pay a text-taken booking was to hand over notes. From
      // 11 Sep 2026 those bookings can be sent a /pay link and settle by card,
      // so "Other" no longer implies cash — and logging card income as Cash
      // corrupts the one channel that is hardest to reconcile and easiest to
      // lose. "Website" is what Stripe money is already called here.
      //
      // Both conditions, deliberately. paymentStatus is only set to "paid" by
      // the Stripe webhook, and stripeSessionId is only set when a session was
      // actually minted — a link that was issued and never paid, then settled
      // in cash on the day, must still read as Cash.
      origin: booking.paymentStatus === "paid" && booking.stripeSessionId
        ? "Website"
        : booking.platform === "Other" ? "Cash" : booking.platform,
      bookingId: booking.bookingId || null,
      externalBookingId: booking.id,
      date: booking.date,
    },
  });
}

module.exports = { recordCompletedBookingIncome };
