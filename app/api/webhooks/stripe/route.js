const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { redeem: redeemGiftCertificate, generateUniqueCode: generateGiftCode } = require("../../../../lib/giftCertificates");
const { sendGiftCertificateEmail, sendGiftCertificateOwnerEmail, sendBookingConfirmationEmail, sendPaymentFailedEmail, sendSlotConflictEmail, sendRefundRecordedEmail } = require("../../../../lib/email");
const { describeFailure } = require("../../../../lib/paymentFailure");
const { availabilityProblem } = require("../../../../lib/availabilityQuery");
const { holdsTheDay, INQUIRY_STATUS_BUCKET } = require("../../../../lib/bookingStatus");
const { parsePackage } = require("../../../../lib/serialize");
const { isFullRefund, refundUpdate, alreadyRecorded } = require("../../../../lib/refunds");

// IS THE BOAT STILL FREE, NOW THAT THE MONEY HAS ARRIVED?
//
// Owner, 1 Oct 2026: "We need to check for availability when a guest books or
// pays." It is checked when the booking is made and when a payment link is
// opened; this is the last look, for two guests who got through at the same
// instant. Only for a row that does not already hold its day: a booking the
// owner confirmed is his decision, and was checked when it was made.
//
// Never throws. A problem is returned for the caller to act on.
async function slotStillFree(row, kind) {
  const bucket = kind === "inquiry" ? (INQUIRY_STATUS_BUCKET[row.status] || row.status) : row.status;
  if (holdsTheDay(bucket)) return null;
  const pkgRow = row.packageId
    ? await prisma.package.findUnique({ where: { id: row.packageId } }).catch(() => null)
    : null;
  return availabilityProblem({
    pkg: pkgRow ? parsePackage(pkgRow) : null,
    vesselId: row.vesselId, vesselName: row.vesselName,
    date: row.date, hours: row.hours, partySize: row.partySize,
    exclude: { ids: [row.id], bookingId: row.bookingId },
    includeHolds: false,
  });
}

// SPEND A GIFT CERTIFICATE, once the card part has actually been paid.
//
// Two ways a code arrives: on the Inquiry row (the website's booking form has
// always written it there) or in the session's metadata (the payment link,
// since 1 Oct 2026, which may be paying a booking row with no gift columns).
// Guarded against Stripe delivering the same event twice.
async function spendGiftCertificate({ code, amount, bookingId, note }) {
  const value = Number(amount);
  if (!code || !(value > 0)) return;
  try {
    const cert = await prisma.giftCertificate.findUnique({ where: { code } });
    if (!cert) return;
    const already = await prisma.giftCertificateRedemption.findFirst({
      where: { certificateId: cert.id, bookingId: bookingId || null },
    });
    if (already) return;
    await redeemGiftCertificate(cert.id, value, { bookingId: bookingId || null, note });
  } catch (giftErr) {
    // The charter is paid for either way — surface this rather than failing
    // the webhook, since the balance can be corrected by hand.
    console.error("[webhooks/stripe] Gift certificate redemption failed:", giftErr);
  }
}

// A payment that succeeds AFTER one that failed must not leave the decline
// behind. Every success path sets these alongside paymentStatus, so "paid" and
// "declined" can never both be true on one row.
const CLEAR_FAILURE = { paymentFailedAt: null, paymentFailedError: null };

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

  // SOMEBODY TRIED TO PAY AND IT DID NOT WORK.
  //
  // Until 13 Sep 2026 this webhook listened for success and nothing else, so a
  // declined card was invisible everywhere except Stripe's own dashboard. Sarah
  // Griffith's $100 for two glow seats was declined for insufficient funds at
  // 10:47pm on 12 Sep and her inquiry went on reading "new / unpaid", which is
  // exactly what it read before she ever opened the link.
  //
  // Recorded, not acted on: the seats are NOT released, the status is NOT
  // changed. A failed payment is a guest who wants to come and could not pay
  // yet, and a Checkout session stays open for 24 hours — so the same link she
  // already has still works. Cancelling anything here would turn a retryable
  // moment into a lost booking.
  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object;
    try {
      const failure = describeFailure(pi.last_payment_error);

      // THE PAYMENT INTENT DOES NOT CARRY OUR METADATA -- only the Checkout
      // Session does, and Sarah's intent had `metadata: {}`. So the session has
      // to be found first. Asked of Stripe rather than read off
      // payment_details.order_reference, which happens to hold the session id but
      // is not what that field is for.
      let session = null;
      try {
        const found = await stripe.checkout.sessions.list({ payment_intent: pi.id, limit: 1 });
        session = (found && found.data && found.data[0]) || null;
      } catch (listErr) {
        console.error("[webhooks/stripe] could not look up the session for " + pi.id + ":", listErr.message);
      }

      const meta = (session && session.metadata) || {};
      const data = { paymentFailedAt: new Date(), paymentFailedError: failure.summary };
      let hit = null;

      if (meta.externalBookingId) {
        hit = await prisma.externalBooking.update({ where: { id: meta.externalBookingId }, data }).catch(() => null);
      } else if (meta.inquiryId) {
        hit = await prisma.inquiry.update({ where: { id: meta.inquiryId }, data }).catch(() => null);
      } else if (session && session.id) {
        // Fallback: both tables store the session id when the checkout is
        // created, so the row is findable even with no metadata at all.
        hit = await prisma.inquiry.findFirst({ where: { stripeSessionId: session.id } });
        if (hit) await prisma.inquiry.update({ where: { id: hit.id }, data });
        else {
          hit = await prisma.externalBooking.findFirst({ where: { stripeSessionId: session.id } });
          if (hit) await prisma.externalBooking.update({ where: { id: hit.id }, data });
        }
      }

      if (!hit) {
        // Worth shouting about: a real person could not pay and we cannot say
        // who. Better a loud log than a silent shrug, which is the bug being
        // fixed here in the first place.
        console.error("[webhooks/stripe] PAYMENT FAILED and no booking matched it — intent "
          + pi.id + ", " + ((pi.amount || 0) / 100) + " USD, " + failure.summary);
      }

      // Tell the owner, because the entire point is that he should not have to
      // go and look. AWAITED, with .catch below: Stripe retries any webhook that
      // does not return 200, so a mail outage must not throw -- but not awaiting
      // it meant the notice was usually killed when this function froze, which is
      // the same failure that lost four booking confirmations on 18 Sep 2026.
      await sendPaymentFailedEmail({
        name: hit ? (hit.name || hit.guestName) : null,
        email: hit ? hit.email : (session && session.customer_details && session.customer_details.email) || null,
        phone: hit ? hit.phone : null,
        bookingId: hit ? hit.bookingId : null,
        date: hit ? hit.date : null,
        packageName: hit ? (hit.packageName || null) : null,
        amount: (pi.amount || 0) / 100,
        failure,
        sessionUrl: session && session.url,
        sessionExpiresAt: session && session.expires_at,
      }).catch((e) => console.error("[webhooks/stripe] failure notice threw:", e.message));
    } catch (err) {
      console.error("[webhooks/stripe] Failed to record a failed payment:", err);
    }
    return NextResponse.json({ received: true });
  }

  // MONEY WENT BACK.
  //
  // Owner, 1 Oct 2026: "We need to have a refunded status if that ever
  // happens." Stripe sends this for every refund made in its dashboard. A full
  // refund marks the booking refunded; a partial one records the amount and
  // leaves the status alone (see lib/refunds.js). The owner is told either way.
  //
  // THIS ONLY ARRIVES IF THE WEBHOOK IS SUBSCRIBED TO charge.refunded in the
  // Stripe dashboard. Without that, nothing here ever runs and a refund made
  // in Stripe has to be marked by hand from the status dropdown.
  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    try {
      const charged = (charge.amount || 0) / 100;
      const refunded = (charge.amount_refunded || 0) / 100;
      const full = isFullRefund({ charged, refunded, stripeSaysFull: charge.refunded });
      const day = new Date().toISOString().slice(0, 10);

      let session = null;
      if (charge.payment_intent) {
        try {
          const found = await stripe.checkout.sessions.list({ payment_intent: charge.payment_intent, limit: 1 });
          session = (found && found.data && found.data[0]) || null;
        } catch (listErr) {
          console.error("[webhooks/stripe] refund: could not look up the session:", listErr.message);
        }
      }
      const meta = (session && session.metadata) || {};

      // A gift certificate bought and then refunded is voided in full. A
      // partial refund of one is left for the owner: which part of a
      // certificate is still good is his call.
      if (meta.kind === "gift-certificate") {
        const cert = session ? await prisma.giftCertificate.findFirst({ where: { stripeSessionId: session.id } }) : null;
        if (cert && full && cert.status !== "void") {
          await prisma.giftCertificate.update({ where: { id: cert.id }, data: { status: "void", balance: 0 } });
        }
        if (cert && (!full || cert.status !== "void")) {
          await sendRefundRecordedEmail({
            name: cert.purchaserName, charged, refunded, full, matched: true,
            giftCertificate: full ? cert.code : null,
          }).catch(() => {});
        }
        return NextResponse.json({ received: true });
      }

      const sessionId = session && session.id;
      const inquiryWhere = [
        meta.inquiryId ? { id: meta.inquiryId } : null,
        sessionId ? { stripeSessionId: sessionId } : null,
        charge.payment_intent ? { stripePaymentIntentId: charge.payment_intent } : null,
      ].filter(Boolean);
      const bookingWhere = [
        meta.externalBookingId ? { id: meta.externalBookingId } : null,
        sessionId ? { stripeSessionId: sessionId } : null,
        sessionId ? { platformRef: sessionId } : null,
      ].filter(Boolean);
      const [inquiries, bookings] = await Promise.all([
        inquiryWhere.length ? prisma.inquiry.findMany({ where: { OR: inquiryWhere } }) : [],
        bookingWhere.length ? prisma.externalBooking.findMany({ where: { OR: bookingWhere } }) : [],
      ]);
      const rows = [
        ...inquiries.map((row) => ({ row, kind: "inquiry" })),
        ...bookings.map((row) => ({ row, kind: "external" })),
      ];

      const fresh = rows.filter((r) => !alreadyRecorded({ row: r.row, kind: r.kind, refunded, full }));
      for (const r of fresh) {
        const data = refundUpdate({ row: r.row, kind: r.kind, charged, refunded, full, day });
        const table = r.kind === "inquiry" ? prisma.inquiry : prisma.externalBooking;
        await table.update({ where: { id: r.row.id }, data });
      }

      // Told once per new running total, not once per Stripe retry.
      if (fresh.length || !rows.length) {
        const any = (rows[0] && rows[0].row) || {};
        await sendRefundRecordedEmail({
          name: any.name || any.guestName || (charge.billing_details && charge.billing_details.name) || null,
          bookingId: any.bookingId || null,
          date: any.date || null,
          charged, refunded, full,
          matched: rows.length > 0,
          wasCompleted: rows.some((r) => r.row.status === "completed"),
          giftCode: (inquiries.find((i) => i.giftCertificateCode) || {}).giftCertificateCode || meta.giftCertificateCode || null,
        }).catch((e) => console.error("[webhooks/stripe] refund notice threw:", e.message));
      }
    } catch (err) {
      // Logged, not thrown: a refund that could not be recorded here can be
      // marked by hand, and failing the webhook only makes Stripe retry.
      console.error("[webhooks/stripe] Failed to record a refund:", err);
    }
    return NextResponse.json({ received: true });
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
              recipientEmail: meta.recipientEmail || null,
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
                  // Stripe, not "Website": a ledger origin says HOW the money
                  // moved, and the website is where they bought it, not how they
                  // paid. Corrected 13 Sep 2026 along with the rest of the
                  // origins -- this line was the one place still able to write a
                  // source into that column.
                  origin: "Stripe",
                  date: new Date().toISOString().slice(0, 10),
                },
              });
            } catch (ledgerErr) {
              console.error("[webhooks/stripe] certificate sold but NOT booked to the ledger:", ledgerErr);
            }

          // AWAITED. "Best-effort" was doing no effort at all: this function is
          // frozen the moment it answers Stripe, so an un-awaited send is simply
          // cancelled. The buyer does see the code on the success page -- but a
          // gift certificate is usually bought FOR somebody else, and the email
          // is the thing that gets forwarded. Money taken, nothing delivered.
          //
          // .catch keeps a failed send from failing the purchase, which is what
          // best-effort was meant to mean.
          //
          // Buyer and recipient first, so the owner's one notice can say
          // whether the certificate actually reached them.
          const delivery = await sendGiftCertificateEmail(cert).catch(() => null);
          // And tell the business, once. Until 8 Sep 2026 nothing did, so the
          // first anyone heard of a certificate was somebody turning up to
          // redeem it; until 1 Oct 2026 he was told twice.
          await sendGiftCertificateOwnerEmail(cert, delivery).catch(() => {});
        }
      } catch (err) {
        console.error("[webhooks/stripe] Failed to mint gift certificate:", err);
      }
      return NextResponse.json({ received: true });
    }

    const inquiryId = meta.inquiryId;

    // A booking that was ALREADY a booking, paid through its own /pay link.
    //
    // Added 11 Sep 2026 with ExternalBooking's payment columns. This branch
    // returns early on purpose: everything below it exists to turn a paid
    // Inquiry into a booking row, and this row is already the booking. Falling
    // through would mint a duplicate charter for the money just received --
    // which is the one failure this webhook must never have.
    const externalBookingId = meta.externalBookingId;
    if (externalBookingId) {
      try {
        // Stripe paying IS the assertion -- the one payment method this
        // system can know without being told. See lib/channels.js.
        const data = { paymentStatus: "paid", status: "booked", paymentMethod: "Stripe (card)", ...CLEAR_FAILURE };

        // Still free? Only asked of a row that did not already hold its day
        // (a platform inquiry being sent a link). See slotStillFree.
        const before = await prisma.externalBooking.findUnique({ where: { id: externalBookingId } });
        const conflict = before ? await slotStillFree(before, "external") : null;
        if (conflict) {
          // Paid, but NOT booked: it stays what it was, so it is not shown
          // as a charter on a boat that belongs to somebody else.
          delete data.status;
        }
        const giftCode = meta.giftCertificateCode || null;
        const giftAmount = Number(meta.giftAmount) || 0;
        if (giftCode && giftAmount > 0 && before) {
          const line = "Gift certificate " + giftCode + " paid $" + giftAmount.toFixed(2) + " of this.";
          if (!String(before.note || "").includes(line)) {
            data.note = ((before.note || "") + "\n" + line).trim();
          }
        }
        // Stripe verifies these, so they beat whatever we had -- but only
        // overwrite when it actually returned one, so a blank never clobbers a
        // good number or address already on the record.
        const phone = session.customer_details?.phone;
        if (phone) data.phone = phone;
        const email = session.customer_details?.email;
        if (email) data.email = email;
        // amount_total is what Stripe actually charged, in cents -- the truth
        // after any coupon, which priceQuoted is not.
        if (typeof session.amount_total === "number") data.pricePaid = session.amount_total / 100;

        const paid = await prisma.externalBooking.update({
          where: { id: externalBookingId }, data,
        });

        // The card part is paid, so the certificate part is spent now.
        await spendGiftCertificate({
          code: giftCode, amount: giftAmount, bookingId: paid.bookingId,
          note: "Applied to booking " + (paid.bookingId || paid.id) + " on its payment page",
        });

        if (conflict) {
          await sendSlotConflictEmail({
            name: paid.guestName, email: paid.email, phone: paid.phone,
            date: paid.date, hours: paid.hours, vesselName: paid.vesselName,
            packageName: paid.packageName, bookingId: paid.bookingId,
            amount: typeof session.amount_total === "number" ? session.amount_total / 100 : null,
            problem: conflict.message,
          }).catch((e) => console.error("[webhooks/stripe] conflict notice threw:", e.message));
          return NextResponse.json({ received: true });
        }

        // AWAITED. It used to be fired and forgotten, with .then() attached, on
        // the reasoning that a mail outage must never make Stripe retry a
        // payment. That reasoning argues for catching, not for walking away:
        // this runs on a serverless function, which is frozen the instant its
        // response goes back to Stripe, so the request to Resend was killed in
        // flight perhaps four times out of five. The row was updated because
        // THAT was awaited. The guest heard nothing because this was not.
        //
        // The try/catch keeps the original guarantee whole: nothing in here can
        // fail the webhook or make Stripe retry.
        await sendBookingConfirmationEmail({
          name: paid.guestName, email: paid.email, phone: paid.phone,
          date: paid.date, hours: paid.hours, partySize: paid.partySize,
          // packageId and startTime decide the meeting point and the departure
          // time in the email. Leaving them out is how a glow guest was sent to
          // the private dock -- see lib/email.js.
          packageId: paid.packageId, packageName: paid.packageName,
          startTime: paid.startTime, vesselId: paid.vesselId, vesselName: paid.vesselName,
          bookingId: paid.bookingId, priceQuoted: paid.pricePaid,
        })
          .then(async (r) => {
            if (r && r.sent) {
              // Only on a real send. Stamping on a failure would turn the one
              // query that finds a forgotten guest into a query that always
              // says everything is fine.
              await prisma.externalBooking.update({
                where: { id: externalBookingId },
                data: { confirmationSentAt: new Date() },
              }).catch(() => {});
            } else {
              console.error("[webhooks/stripe] No confirmation sent for "
                + (paid.bookingId || externalBookingId) + ": " + (r && r.reason));
            }
          })
          .catch((e) => console.error("[webhooks/stripe] Confirmation failed:", e));
      } catch (err) {
        // The guest has paid either way. Log loudly rather than failing the
        // webhook, which would make Stripe retry forever.
        console.error("[webhooks/stripe] Failed to mark external booking paid:", err);
      }
      return NextResponse.json({ received: true });
    }

    try {
      const data = {
        paymentStatus: "paid",
        status: "booked",
        // A retry that works wipes the decline from the attempt before it.
        ...CLEAR_FAILURE,
        // Stripe paying IS the assertion. Everything else about how money
        // arrived has to be said by the owner -- see lib/channels.js.
        paymentMethod: "Stripe (card)",
        stripePaymentIntentId: session.payment_intent || null,
      };

      // Keep the phone number Stripe collected at checkout. Stripe verifies it,
      // so it beats whatever was typed into our own form — but only overwrite
      // when Stripe actually returned one, so a blank never clobbers a good
      // number the owner already has on the record.
      const stripePhone = session.customer_details?.phone;
      if (stripePhone) data.phone = stripePhone;

      // KEEP THE EMAIL TOO. This was missing, and it cost the first real
      // booking its confirmation: Oscar paid on 5 Sep 2026 through a link for a
      // booking taken over WhatsApp, which had no email on file. Stripe
      // collected one at checkout, we discarded it, and
      // sendBookingConfirmationEmail then returned "no-guest-email" — so
      // neither the guest nor the owner (who is CC'd on that same send) heard
      // anything. The payment was fine; the paperwork was silent.
      //
      // Every booking agreed off the website arrives with no address, so this
      // is the normal case for the direct channel rather than an edge one.
      const stripeEmail = session.customer_details?.email;
      if (stripeEmail) data.email = stripeEmail;

      // Record that the terms were accepted, and when. The checkout demands
      // consent (`consent_collection.terms_of_service`), so Stripe knows — but
      // if the Release and Waiver is ever tested, what matters is being able to
      // show WHO accepted and WHEN from our own records, which is exactly what
      // the termsAcceptedAt column exists for. It was never being written.
      if (session.consent?.terms_of_service === "accepted") {
        data.termsAcceptedAt = new Date();
      }

      // Still free? Asked before the row is marked booked, of the row as it
      // was. A clash leaves it paid but NOT booked, creates no booking row,
      // sends the guest nothing, and tells the owner. See slotStillFree.
      const before = inquiryId
        ? await prisma.inquiry.findUnique({ where: { id: inquiryId } })
        : (session.id ? await prisma.inquiry.findFirst({ where: { stripeSessionId: session.id } }) : null);
      const conflict = before ? await slotStillFree(before, "inquiry") : null;
      if (conflict) delete data.status;

      // A certificate named in the metadata (the payment link) is recorded on
      // the row as well, so the inquiry says how it was paid.
      if (meta.giftCertificateCode && Number(meta.giftAmount) > 0) {
        data.giftCertificateCode = meta.giftCertificateCode;
        data.giftAmount = Number(meta.giftAmount);
      }

      let paidInquiry = null;
      if (before) {
        paidInquiry = await prisma.inquiry.update({ where: { id: before.id }, data });
      }

      if (paidInquiry && conflict) {
        await spendGiftCertificate({
          code: paidInquiry.giftCertificateCode, amount: paidInquiry.giftAmount,
          bookingId: paidInquiry.bookingId,
          note: "Applied to booking " + (paidInquiry.bookingId || paidInquiry.id),
        });
        await sendSlotConflictEmail({
          name: paidInquiry.name, email: paidInquiry.email, phone: paidInquiry.phone,
          date: paidInquiry.date, hours: paidInquiry.hours, vesselName: paidInquiry.vesselName,
          packageName: paidInquiry.packageName, bookingId: paidInquiry.bookingId,
          amount: typeof session.amount_total === "number" ? session.amount_total / 100 : null,
          problem: conflict.message,
        }).catch((e) => console.error("[webhooks/stripe] conflict notice threw:", e.message));
        return NextResponse.json({ received: true });
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
                paymentMethod: "Stripe (card)",
                status: "booked",
                // PAID. This was missing, and paymentStatus defaults to
                // "unpaid" — so every website checkout produced a mirror row
                // carrying the money in pricePaid and the word "unpaid" beside
                // it. The Bookings tab showed a settled charter on the chase
                // list, and once the status column started colouring by payment
                // (v2.9.13) it showed them in the blue that means "nobody has
                // paid and nobody is chasing it".
                //
                // Carlyn, Oscar and Slade were all wrong this way at once on
                // 18 Sep 2026 and had to be corrected by hand. The inquiry knew,
                // the mirror did not, and nothing compared them.
                paymentStatus: "paid",
                // A row created this instant carries no decline to clear. Stated
                // anyway, because every other place that marks a payment paid
                // clears it, and an invariant with one silent exception is how
                // the exception becomes the next bug.
                ...CLEAR_FAILURE,
                pricePaid: paid,
                // WHICH PACKAGE THEY BOUGHT. Also missing, so every mirror row
                // had a null package — the Bookings tab could not say whether a
                // charter was a glow seat or a tubing day, and lib/email.js
                // reads packageId to decide where to tell the guest to meet.
                // The inquiry has carried both since the table was created.
                packageId: paidInquiry.packageId || null,
                packageName: paidInquiry.packageName || null,
                priceQuoted: paidInquiry.priceQuoted ?? null,
                bookingId: paidInquiry.bookingId || null,
                platformRef: session.id,
                stripeSessionId: session.id,
                // INHERIT WHAT BROUGHT THEM, not just which door they walked
                // through. This was hardcoded "website", which is true of every
                // checkout and therefore says nothing — the whole point of
                // referralSource is that it is distinct from `platform`.
                //
                // Now a booking that started with an Instagram DM tagged
                // ?from=ig-tube carries that all the way to the money, which is
                // what makes a campaign answerable rather than arguable.
                referralSource: paidInquiry.referralSource || "website",
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
        // Not awaited — a mail outage must never make Stripe retry a payment
        // webhook — but the RESULT is no longer thrown away. `.catch(() => {})`
        // does not even catch a returned { sent: false }: the function reported
        // exactly why it could not send and nobody read it, which is how the
        // first real payment produced a paid booking and silence at both the
        // guest's address and the owner's.
        //
        // Stamping confirmationSentAt only on a real send turns "did the guest
        // hear from us" into a fact that can be queried, which is what
        // scripts/check-output.js asks every morning.
        if (paidInquiry) {
          // AWAITED, for the reason above: a floating promise on a serverless
          // function is a promise the platform is free to kill, and it did.
          await sendBookingConfirmationEmail(paidInquiry)
            .then(async (r) => {
              if (r && r.sent) {
                await prisma.inquiry.update({
                  where: { id: paidInquiry.id },
                  data: { confirmationSentAt: new Date() },
                }).catch(() => {});
              } else {
                console.error("[webhooks/stripe] confirmation NOT sent for " +
                  (paidInquiry.bookingId || paidInquiry.id) + ": " + (r && r.reason));
              }
            })
            .catch((e) => console.error("[webhooks/stripe] confirmation threw:", e.message));
        }

      // If a gift certificate part-paid this booking, draw it down now —
      // payment has actually succeeded. Doing it at checkout instead would let
      // an abandoned session silently spend someone's certificate.
      if (paidInquiry) {
        await spendGiftCertificate({
          code: paidInquiry.giftCertificateCode, amount: paidInquiry.giftAmount,
          bookingId: paidInquiry.bookingId,
          note: `Applied to booking ${paidInquiry.bookingId || paidInquiry.id}`,
        });
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
