const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { groupExternalBookingState } = require("../../../lib/serialize");
const { HOLDS_THE_DAY } = require("../../../lib/bookingStatus");

// Returns { [vesselId]: { [date]: "partial" | "full" } } derived from the hours
// of bookings that actually occupy the boat (see groupExternalBookingState).
// Enquiries occupy nothing and must never shade a date.
async function GET() {
  const rows = await prisma.externalBooking.findMany({ where: { status: { in: HOLDS_THE_DAY } } });
  return NextResponse.json(groupExternalBookingState(rows));
}

module.exports = { GET };
