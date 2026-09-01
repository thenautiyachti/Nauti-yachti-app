const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { sendInquiryEmail } = require("../../../lib/email");
const { CREW_LIST_PACKAGE_ID, CREW_LIST_PACKAGE_NAME } = require("../../../lib/crewList");

// Public: a two-field name + email signup for the guest mailing list.
// See lib/crewList.js for why these land in the Inquiry table.

// Rough shape check only. Real deliverability gets proven the first time
// the owner actually sends to the list.
function looksLikeEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  // Free-text context, e.g. "Was aboard Sept 19" from the on-boat QR code.
  const source = typeof body.source === "string" ? body.source.trim().slice(0, 200) : "";

  if (!name) return NextResponse.json({ error: "Missing field: name" }, { status: 400 });
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }

  // Don't create a second row for someone who already signed up — the point
  // of this list is unique contacts, not a submission log.
  const existing = await prisma.inquiry.findFirst({
    where: { packageId: CREW_LIST_PACKAGE_ID, email },
  });
  if (existing) {
    return NextResponse.json({ ok: true, alreadyOnList: true });
  }

  const created = await prisma.inquiry.create({
    data: {
      name,
      email,
      // Phone is optional here (a two-field form converts far better than a
      // three-field one) but the column is non-null, so store an empty string.
      phone,
      packageId: CREW_LIST_PACKAGE_ID,
      packageName: CREW_LIST_PACKAGE_NAME,
      message: source || null,
      // Deliberately no bookingId: this is not a booking and must never
      // consume a number out of the NY-YYYYMMDD-NN sequence.
    },
  });

  // Reuse the existing owner-notification path so a signup surfaces the same
  // way an inquiry does. Best-effort — the row is already saved either way.
  const emailResult = await sendInquiryEmail(created);

  return NextResponse.json({ ok: true, email: emailResult });
}

module.exports = { POST };
