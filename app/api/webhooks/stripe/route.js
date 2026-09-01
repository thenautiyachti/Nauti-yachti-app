const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { redeem: redeemGiftCertificate, generateUniqueCode: generateGiftCode } = require("../../../../lib/giftCertificates");
const { sendGiftCertificateEmail } = require("../../../../lib/email");

// Stripe signature verification needs the exact raw request body — reading
// req.text() (not req.json()) preserves that. Must run on the Node.js
// runtime (not edge) since the Stripe SDK relies on Node APIs.
const runtime = "nodejs";

async function POST(req) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Owner hasn't added the webhook secret yet — respond cleanly instead of
    // crashing so nothing else on the site is affected.
    return NextResponse.json({ error: "Webhooks are not yet configured" }, { status: 503 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Payments are not yet configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  const Stripe = require("stripe");
  const stripe = new Stripe(secretKey);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[webhooks/stripe] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const meta = session.metadata || {};

    // A gift certificate purchase, not a charter booking. The certificate is
    // minted HERE rather than at checkout, so an abandoned session never
    // leaves behind a live certificate nobody paid for.
    if (meta.kind === "gift-certificate") {
      try {
        // Stripe retries deliveries, so guard against minting twice for one
        // payment.
        const existing = await prisma.giftCertificate.findFirst({
          where: { stripeSessionId: session.id },
        });
        if (!existing) {
          const amount = Number(meta.amount) || (session.amount_total || 0) / 100;
          const code = await generateGiftCode();
          const cert = await prisma.giftCertificate.create({
            data: {
              code,
              initialAmount: amount,
              balance: amount,
              purchaserName: meta.purchaserName || null,
              purchaserEmail: meta.purchaserEmail || session.customer_email || null,
              purchaserPhone: meta.purchaserPhone || null,
              recipientName: meta.recipientName || null,
              message: meta.message || null,
              stripeSessionId: session.id,
              note: "Purchased online",
            },
          });
          // Best-effort: the buyer already sees the code on the success page,
          // so a failed send is not a failed purchase.
          sendGiftCertificateEmail(cert).catch(() => {});
        }
      } catch (err) {
        console.error("[webhooks/stripe] Failed to mint gift certificate:", err);
      }
      return NextResponse.json({ received: true });
    }

    const inquiryId = meta.inquiryId;

    try {
      const data = {
        paymentStatus: "paid",
        status: "booked",
        stripePaymentIntentId: session.payment_intent || null,
      };

      // Keep the phone number Stripe collected at checkout. Stripe verifies it,
      // so it beats whatever was typed into our own form — but only overwrite
      // when Stripe actually returned one, so a blank never clobbers a good
      // number the owner already has on the record.
      const stripePhone = session.customer_details?.phone;
      if (stripePhone) data.phone = stripePhone;

      let paidInquiry = null;
      if (inquiryId) {
        paidInquiry = await prisma.inquiry.update({ where: { id: inquiryId }, data });
      } else if (session.id) {
        // Fallback lookup in case metadata is ever missing.
        await prisma.inquiry.updateMany({ where: { stripeSessionId: session.id }, data });
        paidInquiry = await prisma.inquiry.findFirst({ where: { stripeSessionId: session.id } });
      }

      // If a gift certificate part-paid this booking, draw it down now —
      // payment has actually succeeded. Doing it at checkout instead would let
      // an abandoned session silently spend someone's certificate.
      if (paidInquiry && paidInquiry.giftCertificateCode && paidInquiry.giftAmount > 0) {
        try {
          const cert = await prisma.giftCertificate.findUnique({
            where: { code: paidInquiry.giftCertificateCode },
          });
          // Guard against a duplicate webhook delivery redeeming twice.
          const already = cert
            ? await prisma.giftCertificateRedemption.findFirst({
                where: { certificateId: cert.id, bookingId: paidInquiry.bookingId },
              })
            : null;
          if (cert && !already) {
            await redeemGiftCertificate(cert.id, paidInquiry.giftAmount, {
              bookingId: paidInquiry.bookingId,
              note: `Applied to booking ${paidInquiry.bookingId || paidInquiry.id}`,
            });
          }
        } catch (giftErr) {
          // The charter is paid for either way — surface this rather than
          // failing the webhook, since the balance can be corrected by hand.
          console.error("[webhooks/stripe] Gift certificate redemption failed:", giftErr);
        }
      }
    } catch (err) {
      // Don't let a lookup/update failure make Stripe retry forever on a bad
      // row reference — log it for the owner to follow up on manually.
      console.error("[webhooks/stripe] Failed to mark inquiry paid:", err);
    }
  }

  return NextResponse.json({ received: true });
}

module.exports = { POST, runtime };
