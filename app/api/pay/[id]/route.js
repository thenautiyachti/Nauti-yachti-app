const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { findPayable, notPayableReason, metadataFor } = require("../../../../lib/payableBooking");

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

  const amount = Number(booking.amount);

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
      metadata: metadataFor(booking),
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
