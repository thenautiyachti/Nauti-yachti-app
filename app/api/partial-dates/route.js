const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { groupExternalBookingState } = require("../../../lib/serialize");
const { HOLDS_THE_DAY } = require("../../../lib/bookingStatus");
const { occupyingRows } = require("../../../lib/occupancy");

// Returns { [vesselId]: { [date]: "partial" | "full" } } derived from the hours
// of bookings that actually occupy the boat (see groupExternalBookingState).
// Inquiries occupy nothing and must never shade a date -- but a booking the
// owner CONFIRMED does, and until 5 Sep 2026 one taken by text held no date at
// all because only the Stripe webhook ever wrote a diary row. See
// lib/occupancy.js, which also stops a card booking being counted twice.
async function GET() {
  const [ext, inquiries] = await Promise.all([
    prisma.externalBooking.findMany({ where: { status: { in: HOLDS_THE_DAY } } }),
    prisma.inquiry.findMany({
      where: { status: "booked" },
      select: { id: true, bookingId: true, vesselId: true, date: true, hours: true, status: true },
    }),
  ]);
  return NextResponse.json(groupExternalBookingState(occupyingRows(ext, inquiries)));
}

module.exports = { GET };
