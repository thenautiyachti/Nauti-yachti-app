const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { groupExternalBookingState } = require("../../../lib/serialize");

// Returns { [vesselId]: { [date]: "partial" | "full" } } derived from
// non-cancelled external bookings' hours (see groupExternalBookingState).
async function GET() {
  const rows = await prisma.externalBooking.findMany({ where: { status: { not: "cancelled" } } });
  return NextResponse.json(groupExternalBookingState(rows));
}

module.exports = { GET };
