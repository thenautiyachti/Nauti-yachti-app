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
// IT READS BOTH TABLES, as of 18 Sep 2026. It used to look only in Inquiry,
// which meant the one tool built to recover a missed payment could not touch a
// booking taken by text — the channel that produces most of them, that rarely
// arrives with an email address, and therefore the exact channel this repair is
// for. Owner, 18 Sep 2026: "if anyone pays via stripe, we would capture their
// email and apply it in our log for that guest so we can send them these
// confirmation emails ... this would be for any manual entered inquiry or
// booking."
//
// It only ever copies FROM Stripe. It cannot mark something paid that Stripe
// does not say is paid.
//
// Body: { bookingId: "NY-20260906-01", sendEmail?: boolean }

// The two tables spell the same booking differently. One place decides how,
// rather than every caller remembering that a guest is `name` here and
// `guestName` there.
function asEmailBooking(row, table) {
  if (table === "inquiry") return row;
  return {
    name: row.guestName, email: row.email, phone: row.phone,
    date: row.date, hours: row.hours, partySize: row.partySize,
    startTime: row.startTime,
    packageId: row.packageId, packageName: row.packageName,
    vesselId: row.vesselId, vesselName: row.vesselName,
    bookingId: row.bookingId,
    // What they actually paid, not what they were quoted. A direct booking's
    // quote is frequently edited after the fact; pricePaid is the money.
    priceQuoted: row.pricePaid != null ? row.pricePaid : row.priceQuoted,
  };
}

async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ref = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  if (!ref) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  // Inquiry first: when a booking exists in both tables it is a website
  // checkout, and the Inquiry is the row that carries the payment columns and
  // the confirmation stamp. The mirror is kept in step below.
  let table = "inquiry";
  let booking = await prisma.inquiry.findFirst({ where: { bookingId: ref } });
  if (!booking) {
    booking = await prisma.externalBooking.findFirst({ where: { bookingId: ref } });
    table = "external";
  }
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

  if (session.payment_status === "paid") {
    if (booking.paymentStatus !== "paid") changed.paymentStatus = "paid";
    if (booking.status !== "booked" && booking.status !== "completed") changed.status = "booked";
    // Stripe paying IS the assertion — the one payment method this system can
    // know without being told. See lib/channels.js.
    if (!booking.paymentMethod) changed.paymentMethod = "Stripe (card)";
    if (typeof session.amount_total === "number") {
      const paidAmount = session.amount_total / 100;
      if (table === "external" && booking.pricePaid !== paidAmount) changed.pricePaid = paidAmount;
    }
  }

  // Columns only the Inquiry table has.
  if (table === "inquiry") {
    if (session.consent?.terms_of_service === "accepted" && !booking.termsAcceptedAt) {
      changed.termsAcceptedAt = new Date();
    }
    if (session.payment_status === "paid"
      && !booking.stripePaymentIntentId && session.payment_intent) {
      changed.stripePaymentIntentId = session.payment_intent;
    }
  }

  const model = table === "inquiry" ? prisma.inquiry : prisma.externalBooking;

  let updated = booking;
  if (Object.keys(changed).length) {
    updated = await model.update({ where: { id: booking.id }, data: changed });
    // Keep the other row in step — between them they are what the Bookings tab
    // and the calendar read, and a contact detail that exists on only one of
    // the two is the kind of split that makes people distrust both.
    if (table === "inquiry") {
      const ext = await prisma.externalBooking.findFirst({ where: { bookingId: ref } });
      if (ext) {
        await prisma.externalBooking.update({
          where: { id: ext.id },
          data: {
            ...(changed.email ? { email: changed.email } : {}),
            ...(changed.phone ? { phone: changed.phone } : {}),
            ...(changed.paymentStatus ? { paymentStatus: changed.paymentStatus } : {}),
          },
        });
      }
    }
  }

  // SENDING IS NOW THE DEFAULT, and it was not.
  //
  // `sendEmail` had to be passed, so a repair could put the money right and
  // leave the guest exactly as uninformed as before — which is the failure this
  // whole route exists to undo, reintroduced as an option nobody ticks. The
  // guard against a duplicate is confirmationSentAt, which is the honest test:
  // it is written only on a real send, so "already stamped" genuinely means
  // they have already heard from us. Pass sendEmail: false to repair quietly.
  const alreadyTold = Boolean(updated.confirmationSentAt);
  const wants = body.sendEmail !== false;
  let emailResult = { sent: false, reason: !wants ? "not-requested" : alreadyTold ? "already-sent" : "not-paid" };

  if (wants && !alreadyTold && updated.paymentStatus === "paid") {
    emailResult = await sendBookingConfirmationEmail(asEmailBooking(updated, table));
    // Same rule as the webhook: a send is only real once it is written down.
    if (emailResult && emailResult.sent) {
      updated = await model.update({
        where: { id: updated.id },
        data: { confirmationSentAt: new Date() },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    bookingRef: ref,
    takenVia: table === "inquiry" ? "website" : "direct",
    stripePaymentStatus: session.payment_status,
    stripeAmount: typeof session.amount_total === "number" ? session.amount_total / 100 : null,
    changed: Object.keys(changed),
    email: updated.email || null,
    phone: updated.phone || null,
    termsAcceptedAt: updated.termsAcceptedAt || null,
    confirmationSentAt: updated.confirmationSentAt || null,
    confirmationEmail: emailResult,
  });
}

module.exports = { POST };
