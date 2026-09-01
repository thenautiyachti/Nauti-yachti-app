const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
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
    if (!["booked", "completed", "cancelled"].includes(body.status)) {
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
  if ("platformRef" in body) data.platformRef = body.platformRef || null;

  const updated = await prisma.externalBooking.update({ where: { id }, data });
  return NextResponse.json(updated);
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
