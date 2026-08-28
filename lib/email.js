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
      // NOTE: update the "from" address to a domain you've verified in Resend.
      body: JSON.stringify({
        from: "Nauti Yachti Bookings <bookings@yourdomain.com>",
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

module.exports = { sendInquiryEmail };
