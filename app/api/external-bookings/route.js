const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");
const { generateBookingId } = require("../../../lib/bookingId");

async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const bookings = await prisma.externalBooking.findMany({ orderBy: { date: "asc" } });
  return NextResponse.json(bookings);
}

const { STATUSES: EXTERNAL_BOOKING_STATUSES } = require("../../../lib/bookingStatus");

// Body: { vesselId, vesselName, date, startTime, hours, guestName, email, partySize, platform, status, note }
async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  const { vesselId, vesselName, date, startTime, hours, guestName, phone, email, partySize, platform, referralSource, status, note, pricePaid } = body;
  if (!vesselId || !vesselName || !date || !platform) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }
  const bookingId = await generateBookingId(date);
  // A completed booking only reserves its own hours, not the whole day —
  // hours accumulate toward the 8hr-day threshold (see groupExternalBookingState
  // in lib/serialize.js), not an automatic full-day block. Full-day blocks
  // are a separate, explicit owner action.
  const booking = await prisma.externalBooking.create({
    data: {
      vesselId, vesselName, date, platform,
      // How the booking was won, as opposed to who processed it. Optional, but
      // it is the only way to tell whether direct/word-of-mouth work is paying
      // off — those bookings all share platform "Other".
      referralSource: referralSource || null,
      startTime: startTime || null,
      hours: hours ? Number(hours) : null,
      guestName: guestName || null,
      // The contact the review flow actually uses. It was missing here, so a
      // number typed on the add-booking form was silently thrown away.
      phone: phone || null,
      email: email || null,
      partySize: partySize ? Number(partySize) : null,
      status: EXTERNAL_BOOKING_STATUSES.includes(status) ? status : "booked",
      note: note || null,
      pricePaid: pricePaid != null && pricePaid !== "" ? Number(pricePaid) : null,
      bookingId,
    },
  });
  return NextResponse.json(booking);
}

module.exports = { GET, POST };
