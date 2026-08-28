const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");

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
    const inquiryId = session.metadata && session.metadata.inquiryId;

    try {
      const data = {
        paymentStatus: "paid",
        status: "confirmed",
        stripePaymentIntentId: session.payment_intent || null,
      };

      if (inquiryId) {
        await prisma.inquiry.update({ where: { id: inquiryId }, data });
      } else if (session.id) {
        // Fallback lookup in case metadata is ever missing.
        await prisma.inquiry.updateMany({ where: { stripeSessionId: session.id }, data });
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
