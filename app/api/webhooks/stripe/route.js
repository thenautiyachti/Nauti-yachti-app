const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { redeem: redeemGiftCertificate, generateUniqueCode: generateGiftCode } = require("../../../../lib/giftCertificates");
const { sendGiftCertificateEmail, sendBookingConfirmationEmail } = require("../../../../lib/email");

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
            // The money is in the account today, so it is income today. Cash
            // basis: recognising it at redemption instead would leave real cash
            // absent from the books until a trip that might be months away, and
            // would disagree with the tax return. The liability -- a charter owed
            // later -- stays visible through the certificate’s own balance, which
            // is a better record than a journal entry nobody maintains.
            //
            // Wrapped: the certificate is minted and the buyer already has their
            // code. A ledger failure must not fail the webhook, or Stripe retries
            // and mints a second certificate for one payment.
            try {
              await prisma.ledgerEntry.create({
                data: {
                  type: "income",
                  category: "Gift certificate",
                  amount,
                  note: "Gift certificate " + code + " sold"
                    + (cert.purchaserName ? " to " + cert.purchaserName : "")
                    + " — a charter is owed against this until it is redeemed",
                  origin: "Website",
                  date: new Date().toISOString().slice(0, 10),
                },
              });
            } catch (ledgerErr) {
              console.error("[webhooks/stripe] certificate sold but NOT booked to the ledger:", ledgerErr);
            }

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

      // A paid website booking used to stop here, as an Inquiry marked "paid".
      // It never became a booking: it did not appear in the Bookings list, it
      // was not on the calendar, and no money reached the ledger. Somebody could
      // pay in full and, as far as every other screen was concerned, not exist.
      //
      // Deliberately created as "booked", not "completed" — the trip has not
      // happened yet. The income row follows when the owner marks it completed,
      // which keeps one rule for how a charter's money is recognised instead of
      // a separate one for website bookings.
      //
      // Idempotent via platformRef: Stripe retries webhooks, and a retry must
      // not mint a second booking. The session id is the natural key here, the
      // same way a Boatsetter reservation number is for a platform booking.
      if (paidInquiry) {
        try {
          const alreadyBooked = await prisma.externalBooking.findFirst({
            where: { platformRef: session.id },
          });
          if (!alreadyBooked) {
            // amount_total is what Stripe actually charged, in cents — it is
            // the truth after coupons and gift certificates, which priceQuoted
            // is not.
            const paid = typeof session.amount_total === "number" ? session.amount_total / 100 : null;
            const party = Number.parseInt(paidInquiry.partySize, 10);
            await prisma.externalBooking.create({
              data: {
                vesselId: paidInquiry.vesselId || "unknown",
                vesselName: paidInquiry.vesselName || paidInquiry.packageName || "Unassigned",
                date: paidInquiry.date,
                hours: paidInquiry.hours ?? null,
                guestName: paidInquiry.name || null,
                email: paidInquiry.email || null,
                phone: paidInquiry.phone || null,
                partySize: Number.isFinite(party) ? party : null,
                platform: "Website",
                status: "booked",
                pricePaid: paid,
                bookingId: paidInquiry.bookingId || null,
                platformRef: session.id,
                referralSource: "website",
                note: "Booked and paid through the website checkout. Created automatically from the Stripe webhook.",
              },
            });
          }
        } catch (bookErr) {
          // The guest has paid either way. Log loudly rather than failing the
          // webhook, which would make Stripe retry forever.
          console.error("[webhooks/stripe] Failed to create booking from paid inquiry:", bookErr);
        }
      }

        // Tell the guest. The booking-success page promises a confirmation will
        // land in their inbox shortly, and until now nothing sent one for a
        // charter -- only for gift certificates. A live $165 test produced a
        // confirmation screen, a database row, and silence at both the guest
        // address and the owner mailbox.
        //
        // Deliberately not awaited and deliberately swallowed: Stripe retries any
        // webhook that does not return 200, and a mail outage must never cause
        // the same payment to be processed twice. The booking is already saved;
        // the email is a courtesy on top of a completed transaction.
        if (paidInquiry) {
          sendBookingConfirmationEmail(paidInquiry).catch(() => {});
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
