// Every email from this file uses this one sender. It was three separate string
// literals, two of which never read FROM_EMAIL -- so they kept sending as
// Resend's sandbox address long after thenautiyachti.com was verified.
//
// The fallback is still the sandbox sender, deliberately: it reaches the Resend
// account holder, so a misconfigured deployment still gets mail to the owner
// rather than none at all. It can reach nobody else.
const FROM = () => process.env.FROM_EMAIL || "The Nauti Yachti <onboarding@resend.dev>";

// Boatz & Glowz leaves from a different place at a different time from every
// other charter, and those facts live in one file so the site, the captions,
// the automations and this email cannot drift apart. They have before.
const {
  GLOW_PACKAGE_ID,
  GLOW_MEETING_POINT,
  GLOW_START_TIME,
  GLOW_CHECK_IN_TIME,
  GLOW_RETURN_TIME,
  GLOW_END_NOTE,
} = require("./glowEvent");

// "17:00" -> "5:00 PM". Returns null for anything it cannot read, so a missing
// or malformed startTime simply omits the line rather than mailing a paying
// guest "NaN:00 PM" on the one message they are most likely to keep.
function formatClock(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm == null ? "" : hhmm).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) return null;
  return (h % 12 || 12) + ":" + m[2] + " " + (h >= 12 ? "PM" : "AM");
}

// Sends the inquiry notification email via Resend (https://resend.com).
// If RESEND_API_KEY isn't set, this just logs to the server console —
// the inquiry is still saved to the database either way, so nothing is
// lost; you just won't get the email until a key is added.
// `opts.resubmission` is a list of what changed in words ("party size",
// "phone") when this is somebody sending the same charter again with a
// correction, rather than a new inquiry. It changes the subject, because an
// identical-looking "New charter inquiry" arriving twice is how the owner ends
// up with two rows in his head for one charter — the opposite of the point.
async function sendInquiryEmail(entry, opts = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_EMAIL || "bookings@thenautiyachti.com";
  const resubmitted = Array.isArray(opts.resubmission) && opts.resubmission.length ? opts.resubmission : null;

  // A CREW-LIST SIGNUP IS NOT A CHARTER INQUIRY, and calling it one produced
  // the subject "New charter inquiry — Crew List — email signup" — clumsy to
  // read, and, for reasons never established, reliably dropped by Gmail.
  //
  // Five sends with that exact string vanished after delivery while
  // "New charter inquiry — Crew List" arrived from the same sender, to the
  // same address, with the same body, seconds apart. Sender, recipient, API
  // key, domain, DNS, body and account filters were each eliminated by direct
  // test. The cause was never found.
  //
  // The subject is now honest about what happened instead, which sidesteps
  // whatever that was AND tells him at a glance whether somebody wants to book
  // or has just left an address.
  const isCrewList = entry.packageId === "crewlist";
  const subject = isCrewList
    ? `New crew-list signup — ${entry.name || "someone"}`
    : resubmitted
      ? `Updated inquiry — ${entry.packageName} — ${entry.name || "someone"}`
      : `New charter inquiry — ${entry.packageName}`;
  const text = [
    ...(resubmitted
      ? [
          `NOT A NEW INQUIRY — ${entry.name || "they"} sent this one again and changed the ${resubmitted.join(", ")}.`,
          `The details below are the current ones. There is still only one booking.`,
          ``,
        ]
      : []),
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
    // WHAT IT ACTUALLY DID, not just that it worked.
    //
    // On 8 Sep 2026 this returned { sent: true } for every send while the owner
    // received nothing, and identical hand-rolled calls to Resend — same
    // sender, same recipient, same subject — arrived every time. "It worked" is
    // not a useful answer when the thing plainly did not, so the reply now
    // carries the recipient and Resend's own message id.
    //
    // Neither is a secret: the recipient is the owner's own address and the id
    // is what you would quote to Resend support to ask what became of it.
    const body = await res.json().catch(() => ({}));
    return { sent: true, to: ownerEmail, from: FROM(), id: body && body.id };
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

  // NOT EVERY CHARTER LEAVES FROM THE DOCK.
  //
  // This block was written for the private dock off Pearl Bay and then
  // hardcoded every word of it: the address, "a private gated dock rather than
  // a public marina", and a promise to text a gate code on the morning. Boatz &
  // Glowz does not leave from there at all. It runs from the Scott's Ridge
  // public boat ramp, with the fleet acting as a taxi to Party Cove and back —
  // which is in the package blurb, the FAQ and lib/glowEvent.js, and was in
  // none of the code that actually wrote to the guest.
  //
  // On the morning of 18 Sep 2026 Slade Deliberto paid for two glow seats and
  // was emailed 12198 Pearl Bay Ct: a gated residence across the lake from the
  // ramp his boat leaves from, with a gate code coming that does not exist. The
  // booking was right, the payment was right, and the one fact the email exists
  // to deliver was wrong.
  //
  // So the meeting point is decided by the PACKAGE, not by the deployment.
  // packageId is checked first and the name second, because the mirror
  // ExternalBooking rows carry the package name but not its id.
  const isGlow = booking.packageId === GLOW_PACKAGE_ID
    || /glow/i.test(String(booking.packageName || ""));

  // WHAT TIME IT LEAVES.
  //
  // The email said "arrive 15 minutes before your start time" and then never
  // said what the start time was — the single number a guest needs, absent from
  // the one message they keep and forward. Glow's times come from
  // lib/glowEvent.js because they belong to the event rather than to a row, and
  // they moved twice in one day on 17 Sep; every other charter reads startTime
  // off its own booking.
  const startTime = isGlow ? GLOW_START_TIME : formatClock(booking.startTime);
  const checkInTime = isGlow ? GLOW_CHECK_IN_TIME : null;

  // Glow always has somewhere to send people, with or without DOCK_ADDRESS set.
  const haveDirections = isGlow || Boolean(dockAddress);

  const money = (n) => (n == null ? null : "$" + Number(n).toFixed(2));
  // What the card was actually charged, not the list price. A 99% coupon on a
  // $165 charter takes $1.65; telling the guest they paid $165 is a worse error
  // than sending nothing, because it looks like an overcharge.
  const paidAmount = Number(booking.priceQuoted || 0)
    - Number(booking.discountAmount || 0)
    - Number(booking.giftAmount || 0);
  const line = (label, value) => (value ? `<tr><td style="padding:4px 14px 4px 0;color:#666">${label}</td><td style="padding:4px 0"><strong>${value}</strong></td></tr>` : "");

  const correction = String(booking.correctionNote || "").trim();
  const subject = correction
    ? `Corrected details — ${booking.packageName || "your charter"} on ${booking.date || "your date"}`
    : `You're booked — ${booking.packageName || "charter"} on ${booking.date || "a date we'll confirm"}`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px">
      <h2 style="margin:0 0 4px">${correction ? "A correction on your booking" : "You're all set"}, ${(booking.name || "").split(" ")[0] || "there"}.</h2>
      <p style="margin:0 0 16px;color:#555">${correction || "We've got your payment and your charter. Here's what we have on file."}</p>
      <table style="border-collapse:collapse;font-size:14px">
        ${line("Booking", booking.bookingId)}
        ${line("Package", booking.packageName)}
        ${line("Boat", booking.vesselName)}
        ${line("Date", booking.date)}
        ${haveDirections ? "" : line("Start time", startTime)}
        ${line("Hours", booking.hours)}
        ${line(isGlow ? "Seats" : "Guests", booking.partySize)}
        ${line("Charter", money(booking.priceQuoted))}
        ${booking.discountAmount ? line("Discount" + (booking.couponCode ? " (" + booking.couponCode + ")" : ""), "-" + money(booking.discountAmount)) : ""}
        ${booking.giftAmount ? line("Gift certificate", "-" + money(booking.giftAmount)) : ""}
        ${line("<strong>Paid</strong>", money(paidAmount))}
      </table>
      ${isGlow ? `
      <div style="margin:22px 0 0;padding:16px 18px;background:#faf7fd;border:1px solid #e6dcf0;border-radius:8px">
        <h3 style="margin:0 0 10px;font-size:15px">Where to meet us</h3>
        <table style="border-collapse:collapse;font-size:14px">
          ${line("Meeting point", GLOW_MEETING_POINT)}
          ${line("Check in", checkInTime)}
          ${line("Lines off", startTime)}
          ${line("Back at the ramp", GLOW_RETURN_TIME)}
          ${line("Any problems", contactPhone)}
        </table>
        <p style="margin:12px 0 0;font-size:13px;color:#555">
          Scott's Ridge is a public ramp, so park in the lot and walk down to the
          boats &mdash; we are your ride to Party Cove and back. There is no gate and
          no code for this one, and this is <strong>not</strong> our usual dock, so do
          not set off for Pearl Bay.
        </p>
        <p style="margin:8px 0 0;font-size:13px;color:#555">
          Please be at the ramp by ${checkInTime}. The whole fleet leaves together at
          ${startTime} and we are back ${GLOW_RETURN_TIME} &mdash; ${GLOW_END_NOTE}.
        </p>
      </div>
      <p style="margin:18px 0 0;font-size:14px">
        Bring a towel, a change of clothes and whatever you would like to drink
        &mdash; glow gear, the cooler, ice and water are already on board. White or
        neon lights up best out there, and there is secure storage for your bag and
        phone while you are aboard.
      </p>
      <p style="margin:14px 0 0;font-size:14px">
        Anything need changing? Reply to this email or call ${contactPhone}.
      </p>` : haveDirections ? `
      <div style="margin:22px 0 0;padding:16px 18px;background:#faf7fd;border:1px solid #e6dcf0;border-radius:8px">
        <h3 style="margin:0 0 10px;font-size:15px">Getting to the boat</h3>
        <table style="border-collapse:collapse;font-size:14px">
          ${line("Address", dockAddress)}
          ${gateCode ? line("Gate code", gateCode) : ""}
          ${line("Start time", startTime)}
          ${line("Arrive", startTime ? `${arriveEarly} minutes before that` : `${arriveEarly} minutes before your start time`)}
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
      <p style="margin:18px 0 0;font-size:14px">
        &mdash; The Nauti Yachti LLC
      </p>
      <p style="margin:10px 0 0;font-size:12px;color:#888">
        The Nauti Yachti LLC &middot; Lake Conroe, TX &middot; ${contactPhone}
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

// EVERY EVENT EMAILS BOTH SIDES. The owner's rule, 8 Sep 2026: "all four of
// these events listed should have emails sent to both us and the guest."
//
// Before this, three of the four were one-sided. An inquiry and a crew-list
// signup notified only the owner, and a gift certificate notified only the
// recipient — so a guest who filled in a form got silence, and a certificate
// could be bought without the business hearing about it at all.
//
// Both halves matter for different reasons. The guest half is reassurance:
// somebody who has just typed their details into a small business's website
// wants to know it arrived. The owner half is the business finding out.

const CONTACT_PHONE = "832-948-2912";

// WHO AN EMAIL IS FROM.
//
// Anything the site sends signs off as the company, never as a person. The
// owner asked for this on 8 Sep 2026 after reading a copy of a message that
// closed with "Austin": a templated email is sent by the business, and a first
// name on it promises a named human is at the other end of a reply.
//
// This is the EMAIL rule only. The SMS drafts in lib/reviews.js and
// lib/owedCharters.js still read "Austin & Brooke" on purpose — those are
// texts he pastes into a thread and sends himself, and a text signed by an LLC
// would be a stranger message.
const SIGN_OFF = "The Nauti Yachti LLC";

// One shell so every guest-facing email looks like the booking confirmation
// rather than three different-looking messages from the same company.
function guestShell(bodyHtml) {
  return `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
      ${bodyHtml}
      <p style="margin:18px 0 0;font-size:14px;line-height:1.6">
        &mdash; ${SIGN_OFF}
      </p>
      <p style="margin:10px 0 0;font-size:12px;color:#888">
        ${SIGN_OFF} &middot; Lake Conroe, TX &middot; ${CONTACT_PHONE}
      </p>
    </div>`;
}

// Shared sender. Every one of these returns { sent, reason } rather than
// throwing: a confirmation that fails must never take down the request that
// triggered it — the inquiry, the signup or the payment is already saved, and
// losing that to a mail error would be the worse failure by far.
async function send({ to, cc, subject, html, text, label }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "no-api-key" };
  if (!to) return { sent: false, reason: "no-recipient" };
  const ownerEmail = process.env.OWNER_EMAIL || "bookings@thenautiyachti.com";
  const replyTo = process.env.REPLY_TO_EMAIL || ownerEmail;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM(),
        to: [to],
        ...(cc ? { cc: [cc] } : {}),
        reply_to: replyTo,
        subject,
        ...(html ? { html } : { text }),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] ${label} NOT sent:`, res.status, body.slice(0, 200));
      return { sent: false, reason: "resend-" + res.status };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[email] ${label} threw:`, err.message);
    return { sent: false, reason: err.message };
  }
}

// 1. WHAT A GUEST GETS AFTER SENDING AN INQUIRY.
//
// Deliberately promises a person, not a process. Somebody inquiring about a
// boat wants to know a human will come back to them, and roughly when.
// SOMEBODY TRIED TO PAY AND COULD NOT. To the owner only.
//
// Deliberately not sent to the guest. Stripe already told them on the spot, in
// their bank's own words; a second email from us saying "your card was declined"
// is an embarrassment arriving an hour later. What it is for is the owner knowing
// without going into Stripe -- which is how Sarah Griffith's 12 Sep decline was
// found, and only because he happened to look.
//
// The whole point is the REPLY it makes possible, so the mail leads with what to
// say and whether the seats are still retryable, not with the error code.
async function sendPaymentFailedEmail(info) {
  const ownerEmail = process.env.OWNER_EMAIL || "bookings@thenautiyachti.com";
  const who = info.name || info.email || "Somebody";
  const f = info.failure || {};
  const money = "$" + Number(info.amount || 0).toFixed(2);

  // A Checkout session stays open for 24 hours, so most of the time the link the
  // guest already has still works -- which is the single most useful sentence in
  // this email and has to be true, not assumed.
  const expires = info.sessionExpiresAt ? new Date(info.sessionExpiresAt * 1000) : null;
  const stillOpen = expires && expires.getTime() > Date.now();

  const lines = [
    f.ours
      ? `${who} COULD NOT PAY AND IT IS OUR FAULT.`
      // Only claim the bank refused it when the code says so. An unrecognised
      // failure might not be a decline at all, and guessing here is how an
      // outage of ours gets described to a guest as their card's fault.
      : f.understood
        ? `${who} tried to pay ${money} and their bank said no.`
        : `${who} tried to pay ${money} and it did not go through.`,
    "",
    f.summary || "Payment failed.",
    // null means "leave this line out"; "" is a real blank line. Filtering on
    // falsiness collapsed the whole mail into one block, because every paragraph
    // break is an empty string.
    f.advise ? "What to do: " + f.advise : null,
    "",
    "Who: " + who + (info.email ? " <" + info.email + ">" : ""),
    info.phone ? "Phone: " + info.phone : null,
    info.bookingId ? "Booking: " + info.bookingId : null,
    info.packageName ? "Charter: " + info.packageName : null,
    info.date ? "Date: " + info.date : null,
    "Amount: " + money,
    "",
    // THREE STATES, NOT TWO. "No session found" is not "expired": saying the
    // link has expired when we never found one is a claim about something we did
    // not look at, and it would send him off to reissue a link that may be fine.
    !expires
      ? "We could not match this attempt to a checkout session, so whether their"
        + " link still works is unknown — check Stripe before telling them anything."
      : stillOpen
        ? "THEIR SEATS ARE NOT GONE. The payment link they already have still works"
          + " until " + expires.toLocaleString("en-US") + " — they do not need a new one,"
          + " they can just run it again with another card."
        : "Their payment link has expired, so they will need a fresh one before they can try again.",
    "",
    "Nothing was cancelled and nothing was released. This is recorded on the"
      + " booking so the console can tell 'tried and was declined' apart from"
      + " 'never opened the link' — which need opposite messages.",
  ];

  return send({
    to: ownerEmail,
    subject: (f.ours ? "PAYMENT BROKEN OUR END — " : "Payment declined — ") + who + " — " + money,
    text: lines.filter((l) => l !== null).join("\n"),
    label: "payment-failed notice",
  });
}

async function sendInquiryAckEmail(entry) {
  if (!entry || !entry.email) return { sent: false, reason: "no-guest-email" };
  const first = String(entry.name || "there").split(/\s+/)[0];
  return send({
    to: entry.email,
    // CC THE OWNER, because this is the path that demonstrably arrives.
    //
    // The separate owner notification (sendInquiryEmail) is accepted by Resend
    // with a 200 and an id and then never appears, while a hand-rolled call
    // with the same sender, recipient, subject and body arrives every time,
    // minutes apart. Sender, recipient, API key, domain, DNS, subject, body
    // content and the account's mail filters were each eliminated by direct
    // test over about two hours. No cause was found.
    //
    // The booking confirmation has never had this problem, and the thing it
    // does differently is CC the owner on the guest's message rather than send
    // him one of his own. So do that. It is one message instead of two, it is
    // the shape that works, and it also means he sees exactly what the guest
    // saw rather than a summary of it.
    cc: process.env.OWNER_EMAIL || undefined,
    subject: "We've got your inquiry — The Nauti Yachti",
    label: "inquiry acknowledgement",
    html: guestShell(`
      <h2 style="margin:0 0 12px;font-size:20px">Thanks, ${first} &mdash; we've got it.</h2>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6">
        Your inquiry about <strong>${entry.packageName || "a charter"}</strong> has come
        through and we'll come back to you personally, usually the same day.
      </p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6">
        If it's easier, just reply to this email or text
        <strong>${CONTACT_PHONE}</strong> &mdash; we answer texts fastest.
      </p>
      <p style="margin:0;font-size:14px;line-height:1.6">
        We're a small operation on Lake Conroe, so you're talking to the person
        who'll be driving the boat.
      </p>`),
  });
}

// 2. WHAT SOMEBODY GETS AFTER JOINING THE CREW LIST.
//
// The list exists so people who could not commit to a seat are not lost, so
// this says exactly what they signed up for and how to leave. Unsubscribe is
// named in the message rather than buried: the list is small and personal, and
// the honest version is that he removes you if you ask.
async function sendCrewListWelcomeEmail(entry) {
  if (!entry || !entry.email) return { sent: false, reason: "no-guest-email" };
  const first = String(entry.name || "there").split(/\s+/)[0];
  return send({
    to: entry.email,
    // CC the owner — see sendInquiryAckEmail for why this rather than a
    // separate notification.
    cc: process.env.OWNER_EMAIL || undefined,
    subject: "You're on the crew list — The Nauti Yachti",
    label: "crew list welcome",
    html: guestShell(`
      <h2 style="margin:0 0 12px;font-size:20px">You're on the list, ${first}. ⚓</h2>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6">
        Boatz &amp; Glowz only runs a couple of times a year and seats go fast.
        We'll text and email you the moment the next date is set &mdash; nothing else,
        no newsletter.
      </p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6">
        Been aboard before? Use <strong>WELCOMEBACK10</strong> for 10% off your
        next charter.
      </p>
      <p style="margin:0;font-size:13px;color:#555;line-height:1.6">
        Want off the list? Reply with "remove" and you're off &mdash; no form, no fuss.
      </p>`),
  });
}

// 3. THE OWNER'S COPY OF A GIFT CERTIFICATE.
//
// sendGiftCertificateEmail goes to the RECIPIENT. Until now nothing told the
// business a certificate had been bought, so the first anyone heard of it was
// somebody turning up wanting to redeem one.
async function sendGiftCertificateOwnerEmail(cert) {
  const ownerEmail = process.env.OWNER_EMAIL || "bookings@thenautiyachti.com";
  if (!cert) return { sent: false, reason: "no-cert" };
  const money = (n) => (n == null ? "—" : "$" + Number(n).toFixed(2));
  return send({
    to: ownerEmail,
    subject: `Gift certificate purchased — ${money(cert.amount)}`,
    label: "gift certificate owner copy",
    text: [
      `Code: ${cert.code || "—"}`,
      `Amount: ${money(cert.amount)}`,
      `Bought by: ${cert.purchaserName || "—"} <${cert.purchaserEmail || "—"}>`,
      `For: ${cert.recipientName || "—"} <${cert.recipientEmail || "—"}>`,
      `Message: ${cert.message || "—"}`,
    ].join("\n"),
  });
}

module.exports = {
  sendInquiryEmail,
  sendGiftCertificateEmail,
  sendBookingConfirmationEmail,
  sendInquiryAckEmail,
  sendPaymentFailedEmail,
  sendCrewListWelcomeEmail,
  sendGiftCertificateOwnerEmail,
};

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
    ``,
    `— ${SIGN_OFF}`,
    `Lake Conroe, TX · (832) 948-2912`,
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
