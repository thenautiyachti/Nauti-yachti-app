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
        from: "Nauti Yachti Bookings <onboarding@resend.dev>",
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
// SENDER CAVEAT, and it matters: onboarding@resend.dev is Resend's shared
// testing address, which delivers only to the Resend account holder. Until a
// domain is verified at resend.com/domains and FROM_EMAIL is set to an address
// on it, a guest at their own address receives nothing and Resend returns a
// success. So the owner is copied on every one of these — if guest delivery is
// silently dropping, the owner still knows a booking landed and can follow up
// by hand. A confirmation nobody can send is worth less than one the owner sees.
async function sendBookingConfirmationEmail(booking) {
  const apiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_EMAIL || "bookings@thenautiyachti.com";
  const from = process.env.FROM_EMAIL || "The Nauti Yachti <onboarding@resend.dev>";
  if (!apiKey) return { sent: false, reason: "no-api-key" };
  if (!booking || !booking.email) return { sent: false, reason: "no-guest-email" };

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
      <p style="margin:18px 0 0;font-size:14px">
        We'll be in touch before your day on the water with the meeting point and timing.
        Reply to this email or call if anything needs changing.
      </p>
      <p style="margin:14px 0 0;font-size:12px;color:#888">
        The Nauti Yachti &middot; Lake Conroe, TX
      </p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [booking.email], cc: [ownerEmail], subject, html }),
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
// IMPORTANT DELIVERY CAVEAT: the `from` address below is Resend's shared
// testing sender, which is only permitted to deliver to the Resend account
// owner's own address. Mail to a customer will be REJECTED until
// thenautiyachti.com is verified in the Resend dashboard and the from-address
// is switched to something @thenautiyachti.com.
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
          from: "The Nauti Yachti <onboarding@resend.dev>",
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
