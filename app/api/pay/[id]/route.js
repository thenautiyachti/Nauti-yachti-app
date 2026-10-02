const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { findPayable, notPayableReason, metadataFor } = require("../../../../lib/payableBooking");
const { availabilityProblem } = require("../../../../lib/availabilityQuery");
const { holdsTheDay, INQUIRY_STATUS_BUCKET } = require("../../../../lib/bookingStatus");
const { parsePackage } = require("../../../../lib/serialize");
const { checkGiftCertificate, applicableAmount, redeem: redeemGiftCertificate } = require("../../../../lib/giftCertificates");
const { sendBookingConfirmationEmail } = require("../../../../lib/email");

// Public: hand a guest from our own payment page to Stripe.
//
// The URL carries the booking's internal id, which is a cuid — unguessable, and
// known only to whoever was sent the link. That id IS the capability to pay this
// one booking, the same reasoning /api/gift-certificates/by-session already
// relies on. A booking reference like "NY-20260906-01" would NOT do: those are
// sequential and somebody could walk them and read other people's charters.
//
// What this deliberately does not do: it returns nothing about the booking. The
// page renders the summary server-side; this route only mints a session and
// replies with a URL, so a guessed id leaks no name, phone or date.
//
// Body: none. POST /api/pay/<booking id> — an Inquiry OR an ExternalBooking.
// Both are resolved by lib/payableBooking, so a charter agreed by text can be
// paid the same way as one booked on the site.

const SITE = "https://www.thenautiyachti.com";

async function POST(req, { params }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing booking" }, { status: 400 });

  const booking = await findPayable(id);
  // Same answer for "no such booking" and "not payable", so this cannot be used
  // to discover which ids exist.
  const reason = notPayableReason(booking);
  if (reason === "not-found") {
    return NextResponse.json({ error: "This payment link is no longer valid." }, { status: 404 });
  }
  if (reason === "already-paid") {
    return NextResponse.json({ error: "This booking is already paid." }, { status: 409 });
  }
  if (reason === "no-price") {
    return NextResponse.json(
      { error: "There is no price on this booking yet — please contact us." },
      { status: 400 }
    );
  }

  // A BOOKING THAT DOES NOT HOLD ITS DAY YET has to find it free before it is
  // paid for: a platform inquiry, or a website inquiry the owner is chasing.
  // One that is already booked holds the day already — the owner confirmed it,
  // and nothing else can be booked over it now that every booking is checked.
  const status = booking.kind === "inquiry"
    ? (INQUIRY_STATUS_BUCKET[booking.row.status] || booking.row.status)
    : booking.row.status;
  if (!holdsTheDay(status)) {
    const pkgRow = booking.packageId
      ? await prisma.package.findUnique({ where: { id: booking.packageId } }).catch(() => null)
      : null;
    const slot = await availabilityProblem({
      pkg: pkgRow ? parsePackage(pkgRow) : null,
      vesselId: booking.row.vesselId, vesselName: booking.vesselName,
      date: booking.date, hours: booking.hours, partySize: booking.partySize,
      exclude: { ids: [booking.id], bookingId: booking.bookingId },
    });
    if (slot) {
      return NextResponse.json({ error: slot.message, unavailable: true, reason: slot.reason }, { status: 409 });
    }
  }

  // A GIFT CERTIFICATE, typed on the payment page.
  //
  // Owner, 1 Oct 2026: "We need to have the option to redeem gift certificates
  // on the checkout process somehow." Most charters are agreed by text and paid
  // through this page, so a code that only worked on the website's booking form
  // would miss most of the guests holding one. Same rule as the form: the code
  // is the only thing trusted from the browser, the balance is read here, and
  // it is spent only once the money has actually arrived (the webhook) — or
  // right here when the certificate covers everything and there is nothing for
  // Stripe to charge.
  const body = await req.json().catch(() => ({}));
  let amount = Number(booking.amount);
  let gift = null;
  let giftApplied = 0;
  if (body && body.giftCertificateCode) {
    const g = await checkGiftCertificate(body.giftCertificateCode);
    if (!g.ok) {
      return NextResponse.json({ error: g.reason, giftInvalid: true }, { status: 400 });
    }
    gift = g.certificate;
    giftApplied = applicableAmount(gift, amount);
    amount = Math.round((amount - giftApplied) * 100) / 100;
  }

  if (gift && amount <= 0) {
    // Stripe cannot take a $0 payment, so the certificate settles it here.
    try {
      await redeemGiftCertificate(gift.id, giftApplied, {
        bookingId: booking.bookingId,
        note: "Covered booking " + (booking.bookingId || booking.id) + " in full, on its payment page",
      });
    } catch (err) {
      console.error("[pay] gift certificate redemption failed:", err.message);
      return NextResponse.json({ error: "We could not apply that gift certificate. Please call us." }, { status: 400 });
    }
    const paid = { paymentStatus: "paid", status: "booked", paymentMethod: "Gift certificate", paymentFailedAt: null, paymentFailedError: null };
    const row = booking.kind === "external"
      ? await prisma.externalBooking.update({
          where: { id: booking.id },
          data: {
            ...paid,
            note: ((booking.row.note || "") + "\nPaid in full by gift certificate " + gift.code
              + " ($" + giftApplied.toFixed(2) + ") on its payment page.").trim(),
          },
        })
      : await prisma.inquiry.update({
          where: { id: booking.id },
          data: { ...paid, giftCertificateCode: gift.code, giftAmount: giftApplied },
        });
    // The same confirmation a card payment gets: where to go and when.
    const r = await sendBookingConfirmationEmail({
      name: booking.name, email: row.email, phone: row.phone,
      date: row.date, hours: row.hours, partySize: row.partySize,
      packageId: row.packageId, packageName: row.packageName,
      startTime: row.startTime || null, vesselId: row.vesselId, vesselName: row.vesselName,
      bookingId: row.bookingId, priceQuoted: booking.amount,
    }).catch((e) => ({ sent: false, reason: e.message }));
    if (r && r.sent) {
      const table = booking.kind === "external" ? prisma.externalBooking : prisma.inquiry;
      await table.update({ where: { id: booking.id }, data: { confirmationSentAt: new Date() } }).catch(() => {});
    }
    return NextResponse.json({ ok: true, url: SITE + "/booking-success?gift=1", giftCovered: true });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Payments are not available right now." }, { status: 503 });
  }

  const Stripe = require("stripe");
  const stripe = new Stripe(secretKey);

  const when = booking.date
    ? new Date(booking.date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })
    : "date to be confirmed";
  const itemName = [booking.packageName, booking.vesselName].filter(Boolean).join(" — ");
  const description = [
    when,
    booking.hours ? booking.hours + " hours" : null,
    booking.partySize ? booking.partySize + " guests" : null,
    booking.bookingId,
  ].filter(Boolean).join(" · ");

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      ...(booking.email ? { customer_email: booking.email } : {}),
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: itemName || "Charter booking", description },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: SITE + "/booking-success?session_id={CHECKOUT_SESSION_ID}",
      // Back to the page they came from, not the homepage — a guest who
      // changes their mind mid-checkout should land somewhere that still
      // offers to take their money.
      cancel_url: SITE + "/pay/" + booking.id,
      // The key the webhook reads to flip THIS booking to paid.
      // Which table to flip when the money lands. An ExternalBooking carries
      // externalBookingId instead — see lib/payableBooking metadataFor.
      // The certificate rides along in the metadata and is spent by the
      // webhook once the card part has been paid — never before, so an
      // abandoned checkout cannot spend somebody's certificate.
      metadata: gift
        ? { ...metadataFor(booking), giftCertificateCode: gift.code, giftAmount: String(giftApplied) }
        : metadataFor(booking),
      phone_number_collection: { enabled: true },
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: {
          message: "I agree to the [Cancellation Policy & Waiver Terms](" + SITE + "/terms).",
        },
      },
    });
  } catch (e) {
    console.error("[pay] " + e.message);
    return NextResponse.json(
      { error: "We could not start checkout. Please try again, or contact us." },
      { status: 502 }
    );
  }

  const table = booking.kind === "external" ? prisma.externalBooking : prisma.inquiry;
  await table.update({
    where: { id: booking.id },
    data: { stripeSessionId: session.id },
  });

  return NextResponse.json({ ok: true, url: session.url });
}

module.exports = { POST };
