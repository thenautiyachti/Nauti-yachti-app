const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { sendInquiryEmail } = require("../../../../lib/email");
const { generateBookingId } = require("../../../../lib/bookingId");

// Log an enquiry that arrived by text, WhatsApp or phone.
//
// WHY THIS EXISTS. Most bookings do not come through the booking form, and the
// public /api/inquiries route is shaped for a guest filling one in. So enquiries
// were being written straight into the database with a script instead — which
// worked, and silently skipped the one thing that tells the owner a booking now
// exists: sendInquiryEmail. Oscar's booking on 5 Sep 2026 was logged that way
// and produced no notification at all.
//
// Anything that creates a booking must notify, or the record and the owner's
// awareness of it drift apart. That is the whole failure mode of the direct
// channel: the 8 Aug 2025 charter existed only in one person's memory until a
// photograph turned up a year later.
//
// Body: { name, phone?, email?, date, hours?, partySize?, vesselId?, vesselName?,
//         packageId?, packageName?, priceQuoted?, message? }

async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const b = await req.json().catch(() => ({}));
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!phone && !email) {
    return NextResponse.json(
      { error: "A guest needs a phone number or an email address — otherwise there is no way back to them." },
      { status: 400 }
    );
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ? b.date : null;

  // A charter with no stated occasion is a Tubing / Wakeboarding charter. That
  // is the owner's default, not a guess — see lib/addOns.js.
  const packageId = b.packageId || "tubing";
  const packageName = b.packageName || "Tubing / Wakeboarding";

  const created = await prisma.inquiry.create({
    data: {
      name,
      // Non-null columns, so an unknown contact detail is stored empty rather
      // than as a placeholder that later looks like real data.
      email,
      phone,
      packageId,
      packageName,
      vesselId: b.vesselId || null,
      vesselName: b.vesselName || null,
      date,
      hours: b.hours != null ? Number(b.hours) : null,
      partySize: b.partySize != null ? String(b.partySize) : null,
      priceQuoted: b.priceQuoted != null ? Number(b.priceQuoted) : null,
      message: b.message || null,
      status: "new",
      bookingId: await generateBookingId(date),
    },
  });

  // The point of the route. Awaited, and its result returned, so a mail failure
  // is visible here rather than swallowed — the caller has just promised a guest
  // something and needs to know the owner was actually told.
  const emailResult = await sendInquiryEmail(created);

  return NextResponse.json({
    ok: true,
    id: created.id,
    bookingId: created.bookingId,
    ownerNotified: emailResult,
  });
}

module.exports = { POST };
