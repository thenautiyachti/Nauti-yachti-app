const { prisma } = require("./db");

// Booking ID format: "NY-YYYYMMDD-NN", e.g. "NY-20260529-01". NN is a daily
// sequence starting at 01, counted across BOTH Inquiry and ExternalBooking
// together for that date — so a site booking and an external booking on the
// same day share one counter rather than each numbering independently.
//
// Only ever called for NEW rows going forward. Historical rows are never
// backfilled — they keep a null bookingId, which the admin console renders
// as a blank/em-dash.
async function generateBookingId(date) {
  if (!date) return null;

  const compact = String(date).replace(/-/g, "");
  const prefix = `NY-${compact}-`;

  const [inquiries, externalBookings] = await Promise.all([
    prisma.inquiry.findMany({
      where: { bookingId: { startsWith: prefix } },
      select: { bookingId: true },
    }),
    prisma.externalBooking.findMany({
      where: { bookingId: { startsWith: prefix } },
      select: { bookingId: true },
    }),
  ]);

  let maxSeq = 0;
  for (const row of [...inquiries, ...externalBookings]) {
    if (!row.bookingId) continue;
    const suffix = row.bookingId.slice(prefix.length);
    const n = parseInt(suffix, 10);
    if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
  }

  const next = maxSeq + 1;
  // Zero-pad to 2 digits for the normal case; if a single day somehow blows
  // past 99 bookings, just keep counting instead of throwing/truncating.
  const suffix = next < 100 ? String(next).padStart(2, "0") : String(next);
  return `${prefix}${suffix}`;
}

module.exports = { generateBookingId };
