const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");
const { sendInquiryEmail } = require("../../../lib/email");
const { generateBookingId } = require("../../../lib/bookingId");

// Admin-only: view all inquiries.
async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const inquiries = await prisma.inquiry.findMany({ orderBy: { submittedAt: "desc" } });
  return NextResponse.json(inquiries);
}

// Public: customers submit inquiries from the booking form.
async function POST(req) {
  const body = await req.json();

  const required = ["name", "email", "phone", "packageId", "packageName"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `Missing field: ${field}` }, { status: 400 });
    }
  }

  const bookingId = await generateBookingId(body.date || null);

  const created = await prisma.inquiry.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone,
      packageId: body.packageId,
      packageName: body.packageName,
      vesselId: body.vesselId || null,
      vesselName: body.vesselName || null,
      date: body.date || null,
      hours: body.hours ? Number(body.hours) : null,
      partySize: body.partySize ? String(body.partySize) : null,
      message: body.message || null,
      priceQuoted: body.priceQuoted != null ? Number(body.priceQuoted) : null,
      bookingId,
      addOnIds: Array.isArray(body.addOnIds) && body.addOnIds.length ? JSON.stringify(body.addOnIds) : null,
    },
  });

  const emailResult = await sendInquiryEmail(created);

  return NextResponse.json({ inquiry: created, email: emailResult });
}

module.exports = { GET, POST };
