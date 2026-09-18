// A Stripe checkout link for a booking that was agreed somewhere else.
//
//   node scripts/payment-link.js NY-20260906-01
//   node scripts/payment-link.js NY-20260906-01 --amount 850
//
// WHY THIS EXISTS. The website's own checkout (app/api/checkout/route.js) is
// built for a guest filling in the booking form: it CREATES an Inquiry row and
// then pays for it. Most bookings do not arrive that way. They arrive on
// WhatsApp, by text, or over the phone, get written down here, and then need
// paying for — and running the guest through the public form would mint a
// second booking for a charter that already exists.
//
// So this attaches a payment to a booking that is ALREADY on the books. The
// session carries `metadata.inquiryId`, which is the exact key the Stripe
// webhook reads (app/api/webhooks/stripe/route.js), so when the guest pays,
// their existing row flips to paid on its own. Nothing has to be reconciled by
// hand and no duplicate is created.
//
// It also collects an email and a verified phone number at checkout. That
// matters more than it sounds: the direct channel is the business's biggest and
// worst-tracked, and its bookings routinely carry no way to contact the guest
// afterwards. Paying is the one moment they will willingly hand both over.
const fs = require("fs");
const path = require("path");

const SECRETS = "C:/Users/immex/.secrets/nauti-yachti.env";
if (fs.existsSync(SECRETS)) {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { prisma } = require(path.join(__dirname, "..", "lib", "db"));
const { findPayableByRef, metadataFor, modelFor } =
  require(path.join(__dirname, "..", "lib", "payableBooking"));
const { bookingLinkMessage } = require(path.join(__dirname, "..", "lib", "guestTexts"));

const SITE = "https://www.thenautiyachti.com";
const argv = process.argv.slice(2);
const ref = argv.find((a) => !a.startsWith("--"));
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

if (!ref) {
  console.error("\n  Usage: node scripts/payment-link.js <bookingId>   e.g. NY-20260906-01");
  console.error("         --amount <dollars>   override the quoted price\n");
  process.exit(1);
}

(async () => {
  // BOTH TABLES. This read prisma.inquiry only, which meant the one command for
  // charging a booking agreed off the website could not see a booking agreed off
  // the website. Josh Ramirez, 18 Sep 2026: created by hand, then "No booking
  // with reference NY-20260919-11" from the tool built to charge him.
  const booking = await findPayableByRef(ref);
  if (!booking) {
    console.error("\n  No booking with reference " + ref + "\n");
    process.exit(1);
  }

  // Never send a second link for money already taken.
  if (booking.paymentStatus === "paid") {
    console.error("\n  " + ref + " is already PAID. Nothing to collect.\n");
    process.exit(1);
  }

  const amount = val("--amount") != null ? Number(val("--amount")) : Number(booking.amount);
  if (!amount || amount <= 0) {
    console.error("\n  " + ref + " has no usable price (priceQuoted = " + booking.amount + ").");
    console.error("  Pass --amount <dollars> to set one.\n");
    process.exit(1);
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error("\n  STRIPE_SECRET_KEY is not set — cannot create a link.\n");
    process.exit(1);
  }

  const Stripe = require(path.join(__dirname, "..", "node_modules", "stripe"));
  const stripe = new Stripe(secretKey);

  const when = booking.date
    ? new Date(booking.date + "T00:00:00").toLocaleDateString("en-US",
        { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "date to be confirmed";
  const itemName = [booking.packageName, booking.vesselName].filter(Boolean).join(" — ");
  const description = [
    when,
    booking.hours ? booking.hours + " hours" : null,
    booking.partySize ? booking.partySize + " guests" : null,
    ref,
  ].filter(Boolean).join(" · ");
  const seats = booking.partySize ? booking.partySize + (booking.partySize === 1 ? " seat" : " seats") : "booking";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    // The email is deliberately NOT pre-filled. Most of these bookings have no
    // address on file — that is the whole problem with the direct channel —
    // and Stripe collects one at checkout, which is how it gets captured.
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
    // The key the webhook reads. Without it the payment cannot find its
    // booking and somebody has to match it up by hand later.
    // Which table the webhook flips when the money lands. An ExternalBooking
    // carries externalBookingId; hardcoding inquiryId sent the payment looking
    // for a row that does not exist, and the guest would have paid into silence.
    metadata: metadataFor(booking),
    phone_number_collection: { enabled: true },
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: {
        message: "I agree to the [Cancellation Policy & Waiver Terms](" + SITE + "/terms).",
      },
    },
  });

  const live = String(session.id).startsWith("cs_live_");

  // Saved only when it is real. A test id on a live booking makes every later
  // repair fail on a booking that was never broken.
  if (live || argv.includes("--test-ok")) {
    await modelFor(booking).update({
      where: { id: booking.id },
      data: { stripeSessionId: session.id },
    });
  }

  if (!live) {
    console.error("\n  TEST MODE \u2014 STRIPE_SECRET_KEY is a test key.");
    console.error("  This link renders a convincing Stripe page, accepts a test card,");
    console.error("  reports success and COLLECTS NOTHING. Do not send it to a guest.");
    console.error("  The session id has NOT been saved against " + ref + ", so nothing");
    console.error("  downstream is poisoned. Pass --test-ok to save it anyway.\n");
  }

  console.log("\n  " + ref + "   " + booking.name);
  console.log("  " + itemName);
  console.log("  " + description);
  console.log("\n  AMOUNT   $" + amount.toFixed(2));
  console.log("  EXPIRES  " + new Date(session.expires_at * 1000).toLocaleString() +
    "   (Stripe's own limit is 24 hours)");
  console.log("\n  " + (live ? "SEND THIS LINK:" : "TEST LINK \u2014 DO NOT SEND:") + "\n");
  console.log("  " + session.url + "\n");
  console.log("  When they pay, " + ref + " flips to paid on its own — the session carries");
  console.log("  the booking id, so nothing needs matching up afterwards, and the");
  console.log("  confirmation email goes out with it.\n");

  // THE OTHER LINK, and usually the better one. A Stripe session dies after 24
  // hours; /pay/<id> mints a fresh one whenever the guest opens it, so a text
  // sent tonight still works on Saturday. The session above is for somebody
  // standing in front of you ready to pay now.
  const durable = bookingLinkMessage(booking.row);
  if (durable) {
    console.log("  OR SEND THE TEXT, which never expires:\n");
    console.log("  " + durable + "\n");
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error("\n  " + e.message + "\n");
  process.exit(1);
});
