const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");
const { sendInquiryEmail, sendInquiryAckEmail } = require("../../../lib/email");
const { generateBookingId } = require("../../../lib/bookingId");
const { clean: cleanSource } = require("../../../lib/referralSource");
const {
  DUPLICATE_WINDOW_MINUTES,
  UNTOUCHED_STATUS,
  findDuplicate,
  corrections,
} = require("../../../lib/duplicateInquiry");

// Admin-only: view all inquiries.
async function GET() {
  if (!(await isAdminAuthenticated())) {
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

  // THE SAME CHARTER ASKED FOR TWICE.
  //
  // Cheap to check and it runs before anything is written: the window is short,
  // the query is one indexed-ish lookup on an email, and the alternative is a
  // duplicate row plus a second acknowledgement email that makes a guest think
  // they have two bookings. See lib/duplicateInquiry.js for what counts.
  //
  // Narrowed in the query to this email and this status so a busy day does not
  // pull the whole table back to throw it away in JS.
  const recent = await prisma.inquiry.findMany({
    where: {
      // Case-insensitive to match what findDuplicate does in JS. Without this
      // the normalisation there is dead code for the only case that needs it:
      // somebody who typed Sarah@… the first time and sarah@… the second is one
      // person, and Postgres would call those two different rows.
      email: { equals: body.email, mode: "insensitive" },
      status: UNTOUCHED_STATUS,
      // Narrowed here too, not just in findDuplicate, so a group booking two
      // boats for the same day does not even come back as a candidate.
      packageId: body.packageId,
      date: body.date,
      submittedAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000) },
    },
    orderBy: { submittedAt: "desc" },
    take: 20,
  });
  const existing = findDuplicate(recent, body);

  if (existing) {
    const { data, changed } = corrections(existing, body);

    // Updated only when they actually said something new. An identical resubmit
    // leaves the row exactly as it was, including submittedAt — the charter was
    // asked for at the first time of asking, not the last.
    const inquiry = Object.keys(data).length
      ? await prisma.inquiry.update({ where: { id: existing.id }, data })
      : existing;

    // The owner hears about it ONLY if something changed, because only then is
    // the email he already has wrong. He is not told about a double-click.
    //
    // The guest gets no second acknowledgement either way: they are looking at
    // the confirmation panel, their original email is already in their inbox,
    // and a second one for one charter is the thing that causes the phone call
    // this whole change exists to prevent.
    let email = { sent: false, reason: "duplicate-no-change" };
    if (changed.length) {
      const res = await Promise.allSettled([sendInquiryEmail(inquiry, { resubmission: changed })]);
      email = res[0].status === "fulfilled" ? res[0].value : { sent: false, reason: "threw" };
    }

    // Reported as a success, because from the guest's side it is one: the
    // charter they asked for is on our screen. `duplicateOf` is here for the
    // logs and for anyone debugging a "missing" inquiry later.
    return NextResponse.json({
      inquiry,
      duplicateOf: existing.id,
      changed,
      email,
      guestEmail: { sent: false, reason: "duplicate" },
    });
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
      // Stamped server-side, not taken from the client: a timestamp the browser
      // supplies is worth nothing if the acceptance is ever questioned.
      termsAcceptedAt: body.termsAccepted ? new Date() : null,
      addOnIds: Array.isArray(body.addOnIds) && body.addOnIds.length ? JSON.stringify(body.addOnIds) : null,
      // Where they came from, if the landing URL said so. Sanitised through the
      // one module that knows the shape, so a hand-rolled payload cannot put a
      // redirect chain into a column that ends up on a console card.
      referralSource: cleanSource(body.referralSource),
    },
  });

  // BOTH SIDES — the owner is told, and the inquirer gets an acknowledgement.
  // Until 8 Sep 2026 somebody who filled in the website form received nothing
  // at all, which reads as a form that did not work.
  const [ownerRes, guestRes] = await Promise.allSettled([
    sendInquiryEmail(created),
    sendInquiryAckEmail(created),
  ]);
  const emailResult = ownerRes.status === "fulfilled" ? ownerRes.value : { sent: false, reason: "threw" };
  const guestEmailResult = guestRes.status === "fulfilled" ? guestRes.value : { sent: false, reason: "threw" };

  return NextResponse.json({ inquiry: created, email: emailResult, guestEmail: guestEmailResult });
}

module.exports = { GET, POST };
