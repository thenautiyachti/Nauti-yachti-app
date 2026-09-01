const { NextResponse } = require("next/server");

// Public: start a Stripe Checkout session to BUY a gift certificate.
//
// Deliberately does NOT create the GiftCertificate row here. If it did, an
// abandoned checkout would leave a live, spendable certificate behind that
// nobody paid for. The purchase details ride along in Stripe metadata and the
// certificate is minted by the webhook once payment actually succeeds.
const MIN_AMOUNT = 25;
const MAX_AMOUNT = 5000;

async function POST(req) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Payments are not yet configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
    return NextResponse.json(
      { error: `Amount must be between $${MIN_AMOUNT} and $${MAX_AMOUNT}` },
      { status: 400 }
    );
  }
  // Whole dollars only — a $73.42 gift certificate helps nobody, and it keeps
  // the printed card and the spoken code tidy.
  const cents = Math.round(amount * 100);
  if (cents % 100 !== 0) {
    return NextResponse.json({ error: "Please choose a whole dollar amount" }, { status: 400 });
  }
  if (!body.purchaserEmail) {
    return NextResponse.json({ error: "An email address is required so we can send the certificate" }, { status: 400 });
  }

  try {
    const Stripe = require("stripe");
    const stripe = new Stripe(secretKey);
    const origin = new URL(req.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: body.purchaserEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `The Nauti Yachti gift certificate — $${amount.toFixed(0)}`,
              description: "Redeemable against any charter on Lake Conroe. No expiry.",
            },
            unit_amount: cents,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/gift-certificates/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/gift-certificates`,
      // Stripe metadata values are strings and capped at 500 characters each,
      // so the personal message is truncated rather than risking a rejected
      // session on a long note.
      metadata: {
        kind: "gift-certificate",
        amount: String(amount),
        purchaserName: String(body.purchaserName || "").slice(0, 200),
        purchaserEmail: String(body.purchaserEmail || "").slice(0, 200),
        purchaserPhone: String(body.purchaserPhone || "").slice(0, 40),
        recipientName: String(body.recipientName || "").slice(0, 200),
        message: String(body.message || "").slice(0, 450),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[gift-certificates/purchase] Stripe session failed:", err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
  }
}

module.exports = { POST };
