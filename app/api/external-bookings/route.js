const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const bookings = await prisma.externalBooking.findMany({ orderBy: { date: "asc" } });
  return NextResponse.json(bookings);
}

// Body: { vesselId, vesselName, date, guestName, partySize, platform, status, note }
async function POST(req) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  const { vesselId, vesselName, date, guestName, partySize, platform, status, note } = body;
  if (!vesselId || !vesselName || !date || !platform) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }
  const booking = await prisma.externalBooking.create({
    data: {
      vesselId, vesselName, date, platform,
      guestName: guestName || null,
      partySize: partySize ? Number(partySize) : null,
      status: status === "confirmed" ? "confirmed" : "pending",
      note: note || null,
    },
  });
  if (booking.status === "confirmed") {
    await prisma.blockedDate.upsert({
      where: { vesselId_date: { vesselId, date } },
      update: {},
      create: { vesselId, date },
    });
  }
  return NextResponse.json(booking);
}

module.exports = { GET, POST };
