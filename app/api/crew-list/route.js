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

// Ten digits, however they were typed. People enter numbers with brackets,
// dots, dashes, spaces and a +1 in front, and rejecting any of those teaches
// them the form is broken rather than that their number is. Count the digits
// and accept the rest: 10, or 11 starting with a US country code.
function looksLikePhone(value) {
  if (typeof value !== "string") return false;
  const d = value.replace(/\D/g, "");
  return d.length === 10 || (d.length === 11 && d.startsWith("1"));
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
  // PHONE IS REQUIRED FROM 8 SEP 2026, and enforced HERE as well as in the
  // form — a required attribute on an input is a courtesy to the browser, not
  // a rule, and anything can POST to this endpoint.
  //
  // It used to be optional because a two-field form converts better than a
  // three-field one. In a week the list produced ONE contact, so there was not
  // much conversion left to protect; and a number is worth more than an
  // address here, because this business books over text. On the same day this
  // changed, the owner's own sending domain turned out to be silently failing
  // to deliver — which is the argument in one line.
  if (!looksLikePhone(phone)) {
    return NextResponse.json(
      { error: "We need a mobile number so we can text you the date." },
      { status: 400 }
    );
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
