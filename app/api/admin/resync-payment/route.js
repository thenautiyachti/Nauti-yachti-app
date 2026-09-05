const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { sendBookingConfirmationEmail } = require("../../../../lib/email");

// Re-read a booking's Stripe session and repair anything the webhook missed.
//
// WHY THIS EXISTS. The first real payment this system took — 5 Sep 2026, a
// WhatsApp booking paid through /pay — succeeded in every way that involved
// money and still left two holes: Stripe collected the guest's email address
// and we discarded it, and the terms acceptance was never recorded. The missing
// email then silently suppressed the confirmation, because that mail goes to
// the guest and CCs the owner, so an empty address means nobody hears anything.
//
// The webhook is fixed. This exists for the bookings taken BEFORE it was, and
// for the next time a webhook and a payment disagree — which is a thing that
// happens, and which otherwise has to be repaired by hand out of the Stripe
// dashboard.
//
// It only ever copies FROM Stripe. It cannot mark something paid that Stripe
// does not say is paid.
//
// Body: { bookingId: "NY-20260906-01", sendEmail?: true }

async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ref = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  if (!ref) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  const booking = await prisma.inquiry.findFirst({ where: { bookingId: ref } });
  if (!booking) return NextResponse.json({ error: "No booking " + ref }, { status: 404 });
  if (!booking.stripeSessionId) {
    return NextResponse.json({ error: ref + " has no Stripe session to read" }, { status: 400 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });

  const Stripe = require("stripe");
  const stripe = new Stripe(secretKey);

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId);
  } catch (e) {
    return NextResponse.json({ error: "Stripe: " + e.message }, { status: 502 });
  }

  const changed = {};
  const email = session.customer_details?.email;
  const phone = session.customer_details?.phone;

  // Never overwrite something already on file with something Stripe did not
  // return — a blank must not clobber a good address.
  if (email && email !== booking.email) changed.email = email;
  if (phone && phone !== booking.phone) changed.phone = phone;
  if (session.consent?.terms_of_service === "accepted" && !booking.termsAcceptedAt) {
    changed.termsAcceptedAt = new Date();
  }
  if (session.payment_status === "paid") {
    if (booking.paymentStatus !== "paid") changed.paymentStatus = "paid";
    if (booking.status !== "booked" && booking.status !== "completed") changed.status = "booked";
    if (!booking.stripePaymentIntentId && session.payment_intent) {
      changed.stripePaymentIntentId = session.payment_intent;
    }
  }

  let updated = booking;
  if (Object.keys(changed).length) {
    updated = await prisma.inquiry.update({ where: { id: booking.id }, data: changed });
    // Keep the booking row in step — it is what the Bookings tab and the
    // calendar read, and a contact detail that exists on only one of the two is
    // the kind of split that makes people distrust both.
    const ext = await prisma.externalBooking.findFirst({ where: { bookingId: ref } });
    if (ext) {
      await prisma.externalBooking.update({
        where: { id: ext.id },
        data: {
          ...(changed.email ? { email: changed.email } : {}),
          ...(changed.phone ? { phone: changed.phone } : {}),
        },
      });
    }
  }

  let emailResult = { sent: false, reason: "not-requested" };
  if (body.sendEmail && updated.paymentStatus === "paid") {
    emailResult = await sendBookingConfirmationEmail(updated);
  }

  return NextResponse.json({
    ok: true,
    bookingRef: ref,
    stripePaymentStatus: session.payment_status,
    stripeAmount: typeof session.amount_total === "number" ? session.amount_total / 100 : null,
    changed: Object.keys(changed),
    email: updated.email || null,
    phone: updated.phone || null,
    termsAcceptedAt: updated.termsAcceptedAt || null,
    confirmationEmail: emailResult,
  });
}

module.exports = { POST };
