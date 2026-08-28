const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { sendInquiryEmail } = require("../../../lib/email");

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
    },
  });

  // Owner still gets the usual inquiry email regardless of whether payment
  // completes — same as the plain-inquiry flow today.
  sendInquiryEmail(created).catch(() => {});

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
            unit_amount: Math.round(priceQuoted * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#packages`,
      metadata: { inquiryId: created.id },
    });

    await prisma.inquiry.update({
      where: { id: created.id },
      data: { stripeSessionId: session.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Stripe session creation failed:", err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
  }
}

module.exports = { POST };
