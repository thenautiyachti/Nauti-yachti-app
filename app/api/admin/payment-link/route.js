const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Create a Stripe checkout link for a booking that was agreed somewhere else.
//
// WHY THIS IS SEPARATE FROM /api/checkout. That route is the public booking
// form: it CREATES an Inquiry and then pays for it. Most bookings do not arrive
// that way — they arrive on WhatsApp or by phone, get written down, and then
// need paying for. Sending such a guest through the public form would mint a
// second booking for a charter that already exists.
//
// So this attaches a payment to a booking already on the books. The session
// carries `metadata.inquiryId`, which is exactly what the Stripe webhook reads,
// so paying flips that same row to paid with nothing to reconcile by hand.
//
// It runs on the server, which is the point: the live keys live in the Vercel
// environment and not on anybody's laptop. A link generated from a developer
// machine carries test keys and takes no money while looking like it worked.
//
// Body: { bookingId: "NY-20260906-01", amount?: 850 }

const SITE = "https://www.thenautiyachti.com";

async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ref = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  if (!ref) {
    return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
  }

  const booking = await prisma.inquiry.findFirst({ where: { bookingId: ref } });
  if (!booking) {
    return NextResponse.json({ error: "No booking with reference " + ref }, { status: 404 });
  }
  // Never issue a second link for money already taken.
  if (booking.paymentStatus === "paid") {
    return NextResponse.json({ error: ref + " is already paid" }, { status: 409 });
  }

  const amount = body.amount != null ? Number(body.amount) : Number(booking.priceQuoted);
  if (!amount || amount <= 0) {
    return NextResponse.json(
      { error: "No usable price on " + ref + ". Pass an amount." },
      { status: 400 }
    );
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
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
    ref,
  ].filter(Boolean).join(" · ");

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      // Email deliberately not pre-filled when we do not have one: these
      // bookings routinely carry no address, and checkout is the one moment a
      // guest will willingly hand one over.
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
      cancel_url: SITE + "/#packages",
      metadata: { inquiryId: booking.id, bookingRef: ref },
      phone_number_collection: { enabled: true },
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: {
          message: "I agree to the [Cancellation Policy & Waiver Terms](" + SITE + "/terms).",
        },
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Stripe refused: " + e.message }, { status: 502 });
  }

  await prisma.inquiry.update({
    where: { id: booking.id },
    data: { stripeSessionId: session.id },
  });

  // Say plainly whether this link can actually take money. A test-mode session
  // renders a convincing Stripe page, accepts a test card, reports success and
  // collects nothing — so "which mode is this" must never be something the
  // owner has to infer from the id.
  const live = String(session.id).startsWith("cs_live_");

  return NextResponse.json({
    ok: true,
    bookingRef: ref,
    guest: booking.name,
    amount,
    url: session.url,
    live,
    mode: live ? "LIVE — this takes real money" : "TEST — this collects nothing",
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
  });
}

module.exports = { POST };
