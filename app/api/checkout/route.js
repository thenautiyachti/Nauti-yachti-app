const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { sendInquiryEmail } = require("../../../lib/email");
const { checkCoupon, discountedAmount } = require("../../../lib/coupons");
const { checkGiftCertificate, applicableAmount, redeem: redeemGiftCertificate } = require("../../../lib/giftCertificates");
const { generateBookingId } = require("../../../lib/bookingId");

// Public: customer clicks "Book this" / submits the booking form and is sent
// to Stripe's hosted Checkout for the exact quoted price. We still create the
// Inquiry row up front (same shape as /api/inquiries) so nothing is lost even
// if the customer abandons checkout — the webhook just flips it to "paid"
// once Stripe confirms the payment.
async function POST(req) {
  // Check this before touching the database: if Stripe isn't configured yet,
  // the client falls back to POST /api/inquiries to create the row instead —
  // creating it here too would leave a duplicate Inquiry behind.
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Payments are not yet configured" }, { status: 503 });
  }

  const body = await req.json();

  const required = ["name", "email", "phone", "packageId", "packageName"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `Missing field: ${field}` }, { status: 400 });
    }
  }

  const priceQuoted = body.priceQuoted != null ? Number(body.priceQuoted) : null;
  if (!priceQuoted || priceQuoted <= 0) {
    return NextResponse.json({ error: "Missing or invalid priceQuoted" }, { status: 400 });
  }

  // A coupon code is optional and never trusted from the client beyond the
  // code itself — the discount is re-derived server-side from the Coupon
  // row, exactly the same way /api/coupons/validate judges it. A bad code
  // (typo, expired, already used up) never blocks checkout — it's silently
  // ignored and the customer is charged full price.
  let finalAmount = priceQuoted;
  let appliedCoupon = null;
  if (body.couponCode) {
    const result = await checkCoupon(body.couponCode, body.email);
    if (result.valid) {
      appliedCoupon = result.coupon;
      finalAmount = discountedAmount(appliedCoupon.discountType, appliedCoupon.discountValue, priceQuoted);
    }
  }
  const discountAmount = appliedCoupon ? Math.max(0, priceQuoted - finalAmount) : null;

  // A gift certificate is applied AFTER any coupon, against whatever is still
  // owed. Like the coupon above, the code is the only thing trusted from the
  // client — the balance is re-read server-side. It is not redeemed here,
  // only measured: the draw-down happens once payment actually succeeds, in
  // the Stripe webhook, so an abandoned checkout cannot silently spend
  // someone's certificate.
  let giftCertificate = null;
  let giftApplied = 0;
  if (body.giftCertificateCode) {
    const giftResult = await checkGiftCertificate(body.giftCertificateCode);
    if (giftResult.ok) {
      giftCertificate = giftResult.certificate;
      giftApplied = applicableAmount(giftCertificate, finalAmount);
      finalAmount = Math.round((finalAmount - giftApplied) * 100) / 100;
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
      priceQuoted,
      paymentStatus: "unpaid",
      couponCode: appliedCoupon ? appliedCoupon.code : null,
      discountAmount,
      giftCertificateCode: giftCertificate ? giftCertificate.code : null,
      giftAmount: giftApplied > 0 ? giftApplied : null,
      bookingId,
      addOnIds: Array.isArray(body.addOnIds) && body.addOnIds.length ? JSON.stringify(body.addOnIds) : null,
    },
  });

  if (appliedCoupon) {
    await prisma.coupon.update({
      where: { id: appliedCoupon.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  // Owner still gets the usual inquiry email regardless of whether payment
  // completes — same as the plain-inquiry flow today.
  sendInquiryEmail(created).catch(() => {});

  // A gift certificate can cover the charter outright, and Stripe cannot
  // create a checkout session for $0 — it rejects a zero unit_amount. So when
  // nothing is left to charge, settle it here: redeem the certificate, mark
  // the booking paid, and send the customer straight to the confirmation page.
  // There is no card payment to wait on, so this is the one path where the
  // redemption happens outside the webhook.
  if (finalAmount <= 0 && giftCertificate) {
    try {
      await redeemGiftCertificate(giftCertificate.id, giftApplied, {
        bookingId: created.bookingId,
        note: `Covered booking ${created.bookingId || created.id} in full`,
      });
      await prisma.inquiry.update({
        where: { id: created.id },
        data: { paymentStatus: "paid", status: "booked" },
      });
      const origin = new URL(req.url).origin;
      return NextResponse.json({
        url: `${origin}/booking-success?gift=1`,
        couponApplied: !!appliedCoupon,
        giftCovered: true,
      });
    } catch (err) {
      console.error("[checkout] gift certificate redemption failed:", err);
      return NextResponse.json({ error: "Could not apply that gift certificate" }, { status: 400 });
    }
  }

  try {
    const Stripe = require("stripe");
    const stripe = new Stripe(secretKey);

    const origin = new URL(req.url).origin;
    const itemName = [created.packageName, created.vesselName].filter(Boolean).join(" — ");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: created.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: itemName || "Charter booking" },
            unit_amount: Math.round(finalAmount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#packages`,
      metadata: { inquiryId: created.id },
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: {
          message: `I agree to the [Cancellation Policy & Waiver Terms](${origin}/terms).`,
        },
      },
    });

    await prisma.inquiry.update({
      where: { id: created.id },
      data: { stripeSessionId: session.id },
    });

    return NextResponse.json({ url: session.url, couponApplied: !!appliedCoupon });
  } catch (err) {
    console.error("[checkout] Stripe session creation failed:", err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
  }
}

module.exports = { POST };
