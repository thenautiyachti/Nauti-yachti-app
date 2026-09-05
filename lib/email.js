// Every email from this file uses this one sender. It was three separate string
// literals, two of which never read FROM_EMAIL -- so they kept sending as
// Resend's sandbox address long after thenautiyachti.com was verified.
//
// The fallback is still the sandbox sender, deliberately: it reaches the Resend
// account holder, so a misconfigured deployment still gets mail to the owner
// rather than none at all. It can reach nobody else.
const FROM = () => process.env.FROM_EMAIL || "The Nauti Yachti <onboarding@resend.dev>";

// Sends the inquiry notification email via Resend (https://resend.com).
// If RESEND_API_KEY isn't set, this just logs to the server console —
// the inquiry is still saved to the database either way, so nothing is
// lost; you just won't get the email until a key is added.
async function sendInquiryEmail(entry) {
  const apiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_EMAIL || "bookings@thenautiyachti.com";

  const subject = `New charter inquiry — ${entry.packageName}`;
  const text = [
    `Name: ${entry.name}`,
    `Email: ${entry.email}`,
    `Phone: ${entry.phone}`,
    `Package: ${entry.packageName}`,
    `Vessel: ${entry.vesselName || "—"}`,
    `Requested date: ${entry.date || "—"}`,
    `Party size: ${entry.partySize || "—"}`,
    `Quoted price: ${entry.priceQuoted ? "$" + entry.priceQuoted : "—"}`,
    `Message: ${entry.message || "—"}`,
  ].join("\n");

  if (!apiKey) {
    console.log("[email] RESEND_API_KEY not set — inquiry saved but no email sent.");
    console.log(text);
    return { sent: false, reason: "no-api-key" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      // Resend's shared testing sender — works immediately, no domain
      // verification needed. Swap to "bookings@thenautiyachti.com" once
      // that domain is verified in the Resend dashboard for a branded from-address.
      body: JSON.stringify({
        from: FROM(),
        to: [ownerEmail],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend request failed:", await res.text());
      return { sent: false, reason: "send-failed" };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] Resend request threw:", err);
    return { sent: false, reason: "send-failed" };
  }
}

// What a guest gets after paying for a charter.
//
// thenautiyachti.com verified on 4 Sep 2026 and FROM_EMAIL is set in
// production, so a guest now receives this at their own address. Before that it
// went out as Resend's sandbox sender, which delivers ONLY to the Resend
// account holder while still returning success — the guest received nothing and
// nothing anywhere said so.
//
// The owner stays copied on every one of these, and should. It is the cheapest
// possible check that a booking landed, and it is what would have surfaced the
// delivery problem above if anyone had been watching for it.
async function sendBookingConfirmationEmail(booking) {
  const apiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_EMAIL || "bookings@thenautiyachti.com";
  const from = FROM();
  // Sending and receiving are separate problems. Resend sends AS the domain, but
  // thenautiyachti.com has no MX records, so mail addressed back to it would
  // bounce -- a confirmation a guest cannot reply to is a poor look on the one
  // message they are most likely to answer. Replies go to the inbox actually
  // read instead.
  const replyTo = process.env.REPLY_TO_EMAIL || ownerEmail;
  if (!apiKey) return { sent: false, reason: "no-api-key" };
  if (!booking || !booking.email) return { sent: false, reason: "no-guest-email" };

  // WHERE THE BOAT IS, AND HOW TO GET THROUGH THE GATE.
  //
  // Until 5 Sep 2026 this email said only "we'll be in touch with the meeting
  // point" — while the FAQ told guests the address arrives WITH the booking
  // confirmation. So the site promised something the email did not deliver, and
  // every booking needed a manual follow-up before the guest could find the
  // dock. The first real booking went out that way.
  //
  // THE ADDRESS GOES IN THIS EMAIL. THE GATE CODE DOES NOT, BY DECISION.
  //
  // An email is forwarded, screenshotted and kept forever. The code changes
  // rarely, so putting it here would leave every guest the business has ever
  // emailed holding working access to a private gated residence indefinitely —
  // a risk that compounds with every booking and shows no symptom until it
  // matters. The address carries none of that and is needed to plan the drive.
  //
  // The code is sent on the day instead. The real hazard there is FORGETTING —
  // twelve people at a gate with no way in — so that send needs to be one tap
  // from the booking, not a thing to remember.
  //
  // THIS FILE DELIBERATELY DOES NOT READ DOCK_GATE_CODE.
  //
  // It briefly did, so the decision could be flipped with an environment
  // variable — which was a mistake, because the Arriving tab on the phone page
  // needs that same variable to build its text. Setting it for the tab would
  // have silently started mailing the code to every guest as a side effect.
  // One variable cannot mean both "the crew can see this" and "email it to
  // customers", so the email simply does not have access to it.
  //
  // Putting the code in email is a real decision with a real cost, and it
  // should look like one: a code change with this comment attached, not a
  // config toggle somebody flips without seeing the reasoning.
  //
  // The address comes from the environment, never the repository. If unset, the
  // block degrades to the old wording rather than emailing the word
  // "undefined" to a paying guest.
  const dockAddress = process.env.DOCK_ADDRESS || "";
  const gateCode = ""; // never emailed — see above, and app/admin/ask for where it is used
  const contactPhone = process.env.CONTACT_PHONE || "(832) 948-2912";
  const arriveEarly = process.env.ARRIVE_MINUTES_EARLY || "15";
  const haveDirections = Boolean(dockAddress);

  const money = (n) => (n == null ? null : "$" + Number(n).toFixed(2));
  // What the card was actually charged, not the list price. A 99% coupon on a
  // $165 charter takes $1.65; telling the guest they paid $165 is a worse error
  // than sending nothing, because it looks like an overcharge.
  const paidAmount = Number(booking.priceQuoted || 0)
    - Number(booking.discountAmount || 0)
    - Number(booking.giftAmount || 0);
  const line = (label, value) => (value ? `<tr><td style="padding:4px 14px 4px 0;color:#666">${label}</td><td style="padding:4px 0"><strong>${value}</strong></td></tr>` : "");

  const subject = `You're booked — ${booking.packageName || "charter"} on ${booking.date || "a date we'll confirm"}`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px">
      <h2 style="margin:0 0 4px">You're all set, ${(booking.name || "").split(" ")[0] || "there"}.</h2>
      <p style="margin:0 0 16px;color:#555">We've got your payment and your charter. Here's what we have on file.</p>
      <table style="border-collapse:collapse;font-size:14px">
        ${line("Booking", booking.bookingId)}
        ${line("Package", booking.packageName)}
        ${line("Boat", booking.vesselName)}
        ${line("Date", booking.date)}
        ${line("Hours", booking.hours)}
        ${line("Guests", booking.partySize)}
        ${line("Charter", money(booking.priceQuoted))}
        ${booking.discountAmount ? line("Discount" + (booking.couponCode ? " (" + booking.couponCode + ")" : ""), "-" + money(booking.discountAmount)) : ""}
        ${booking.giftAmount ? line("Gift certificate", "-" + money(booking.giftAmount)) : ""}
        ${line("<strong>Paid</strong>", money(paidAmount))}
      </table>
      ${haveDirections ? `
      <div style="margin:22px 0 0;padding:16px 18px;background:#faf7fd;border:1px solid #e6dcf0;border-radius:8px">
        <h3 style="margin:0 0 10px;font-size:15px">Getting to the boat</h3>
        <table style="border-collapse:collapse;font-size:14px">
          ${line("Address", dockAddress)}
          ${gateCode ? line("Gate code", gateCode) : ""}
          ${line("Arrive", `${arriveEarly} minutes before your start time`)}
          ${line("Any problems", contactPhone)}
        </table>
        <p style="margin:12px 0 0;font-size:13px;color:#555">
          It is a private gated dock rather than a public marina, so there is no sign
          and no dock office to look for. Parking is on site next to the dock, so you
          can unload straight onto the boat.
        </p>
        ${gateCode
          ? `<p style="margin:8px 0 0;font-size:12px;color:#888">
              Please keep the gate code to your own party &mdash; it is a private residence.
            </p>`
          : `<p style="margin:8px 0 0;font-size:13px;color:#555">
              We will text you the gate code on the morning of your charter.
            </p>`}
      </div>
      <p style="margin:18px 0 0;font-size:14px">
        Arriving before your start time matters: boarding and the safety briefing
        otherwise come out of your booked hours. Bring swimsuits, towels, sunscreen,
        and whatever you would like to eat and drink &mdash; the cooler, ice and water
        are already on board.
      </p>
      <p style="margin:14px 0 0;font-size:14px">
        Anything need changing? Reply to this email or call ${contactPhone}.
      </p>` : `
      <p style="margin:18px 0 0;font-size:14px">
        We'll be in touch before your day on the water with the meeting point and timing.
        Reply to this email or call ${contactPhone} if anything needs changing.
      </p>`}
      <p style="margin:14px 0 0;font-size:12px;color:#888">
        The Nauti Yachti &middot; Lake Conroe, TX &middot; ${contactPhone}
      </p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [booking.email], cc: [ownerEmail], reply_to: replyTo, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] booking confirmation NOT sent:", res.status, body.slice(0, 200));
      return { sent: false, reason: "resend-" + res.status };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] booking confirmation threw:", err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendInquiryEmail, sendGiftCertificateEmail, sendBookingConfirmationEmail };

// Emails a purchased gift certificate.
//
// This used the sandbox sender until 4 Sep 2026, which meant the BUYER's copy
// was rejected while the owner's went through — a sale that looks complete from
// the owner's side and is silent from the buyer's. It uses FROM() now, so both
// arrive. Nothing was ever lost to it: no gift certificate has yet sold, which
// is precisely why it could sit here unnoticed until one did.
//
// That is why the purchase flow never depends on this: the code is shown on
// the confirmation page immediately, and this email is a convenience on top.
// The owner copy is always attempted, because that one does reach a verified
// address and gives a record of the sale.
async function sendGiftCertificateEmail(cert) {
  const apiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_EMAIL || "bookings@thenautiyachti.com";

  const money = (n) => `$${Number(n || 0).toFixed(2)}`;
  const lines = [
    `Gift certificate ${cert.code}`,
    ``,
    `Value: ${money(cert.initialAmount)}`,
    cert.recipientName ? `For: ${cert.recipientName}` : null,
    cert.purchaserName ? `From: ${cert.purchaserName}` : null,
    cert.message ? `Message: ${cert.message}` : null,
    cert.expiresAt ? `Expires: ${cert.expiresAt}` : `No expiry date.`,
    ``,
    `To redeem, enter the code at checkout on thenautiyachti.com, or mention it`,
    `when booking by phone on (832) 948-2912. It can be used across more than`,
    `one trip until the balance runs out.`,
  ].filter(Boolean).join("\n");

  if (!apiKey) {
    console.log("[email] RESEND_API_KEY not set — gift certificate not emailed.");
    console.log(lines);
    return { sent: false, reason: "no-api-key" };
  }

  const recipients = [ownerEmail];
  if (cert.purchaserEmail && cert.purchaserEmail !== ownerEmail) {
    recipients.push(cert.purchaserEmail);
  }

  const results = [];
  for (const to of recipients) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM(),
          to: [to],
          subject: to === ownerEmail
            ? `Gift certificate sold — ${cert.code} (${money(cert.initialAmount)})`
            : `Your Nauti Yachti gift certificate — ${cert.code}`,
          text: lines,
        }),
      });
      results.push({ to, ok: res.ok });
      if (!res.ok) {
        console.error(`[email] gift certificate to ${to} failed:`, res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      console.error(`[email] gift certificate to ${to} threw:`, err);
      results.push({ to, ok: false });
    }
  }
  return { sent: results.some((r) => r.ok), results };
}
