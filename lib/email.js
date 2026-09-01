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

module.exports = { sendInquiryEmail, sendGiftCertificateEmail };

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
