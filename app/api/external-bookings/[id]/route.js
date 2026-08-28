const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: { status } — toggles pending/confirmed. Confirming blocks the date on the public calendar.
async function PATCH(req, { params }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = params;
  const { status } = await req.json();
  if (!["pending", "confirmed"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const existing = await prisma.externalBooking.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  const updated = await prisma.externalBooking.update({ where: { id }, data: { status } });
  if (status === "confirmed") {
    await prisma.blockedDate.upsert({
      where: { vesselId_date: { vesselId: existing.vesselId, date: existing.date } },
      update: {},
      create: { vesselId: existing.vesselId, date: existing.date },
    });
  }
  return NextResponse.json(updated);
}

async function DELETE(req, { params }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = params;
  await prisma.externalBooking.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
