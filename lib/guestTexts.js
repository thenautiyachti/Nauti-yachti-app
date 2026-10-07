// The two texts the owner sends most often, written once so the console and
// anything else send the same words.
//
// WHY THIS EXISTS. lib/owedCharters.js already did this for one situation — the
// charter we owe somebody — and the "Text about owed" button in the console is
// the most-used thing on that screen. The owner asked for the same one-tap text
// for the other two situations he is in every week (11 Sep 2026):
//
//   "for those that have a current booking status, can I have a text button to
//    them so I can send a reminder to them (similar to Christian) and new
//    inquiries should be able to have a text button now so we can send them a
//    check out link to confirm a booking"
//
// SHORT ON PURPOSE. These are texts, not emails. The owed template's own note
// applies: a text that runs to five sentences reads as a form letter, and this
// is a small operation where the guest has usually spoken to Austin directly.
//
// Signed with his name, never the LLC — texts and site copy keep the person,
// automated email signs as the company.
const SITE = require("./demo").siteBase();  // the demo links to itself
const { GLOW_PACKAGE_ID, GLOW_MEETING_POINT } = require("./glowEvent");

// Where to tell a guest to turn up.
//
// Only Boatz & Glowz has a fixed one, and it is not a detail to paraphrase:
// the whole package is a taxi service from a specific ramp. Owner, 11 Sep 2026:
// "please note the meeting point for boatz and glow is at Scott's Ridge off
// lake conroe." A reminder that says "the ramp" to somebody who has never been
// is a text he has to answer by hand.
//
// Every other charter meets wherever that booking was arranged, which is not
// recorded on the row — so those stay generic rather than guessing.
function meetingPoint(b) {
  return b && b.packageId === GLOW_PACKAGE_ID ? GLOW_MEETING_POINT : null;
}

// THE LAST LINE OF EVERY TEXT, because a message that ends on a link reads like
// it came from a machine.
//
// Owner, 13 Sep 2026: "let them know that this is a real person they can reply
// to this text message so we can talk to them if they have any questions or
// concerns." Two of these templates ended on the checkout URL and nothing else,
// which is exactly the shape of an automated payment demand — and a guest who
// assumes nobody is listening does not ask the question that would have closed
// the booking.
//
// It is also literally true, which is why it can be said: these are pasted into
// the owner's own phone and sent from it. Nothing here is sent by the system, so
// a reply really does reach a person.
//
// One sentence, used by all three, so the guest hears the same thing whichever
// message they get.
const REPLY_LINE = "This is my real number, not an auto-text — reply any time with any questions.";

function firstName(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0];
}

function greeting(b) {
  const f = firstName(b.name || b.guestName);
  return f ? "Hey " + f : "Hey";
}

/** "Saturday, September 19" — no year; nobody texts a year about next weekend. */
function longDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

/** "7:00 PM" from a stored "19:00". Returns null for anything unparseable. */
function clockTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  let h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return h + ":" + m[2] + " " + suffix;
}

// A booking has a payment page when /pay/<id> can resolve it AND there is a
// price to charge.
//
// BOTH TABLES NOW. This used to refuse every ExternalBooking, because /pay
// resolved against Inquiry only — so the guests who book by text, which is
// most of them, were the only ones who could not be sent a link. Owner,
// 11 Sep 2026: "I want all inquiry texts to contain a check out link, like
// Brian's ... based on their inquiry selection." lib/payableBooking.js is the
// other half of that; this is the half that decides whether to offer it.
//
// The price is what still gates it, and rightly: a booking with no priceQuoted
// has nothing to charge, and a link to a £0 checkout helps nobody. Put the
// package and price on the row and the button appears.
function payLink(b) {
  if (!b) return null;
  if (b.paymentStatus === "paid") return null;
  const amount = b.priceQuoted != null ? Number(b.priceQuoted) : null;
  if (!(amount > 0)) return null;
  return SITE + "/pay/" + b.id;
}

/**
 * For a lead that has not paid: the message that turns it into a booking.
 * Returns null when there is nothing honest to send.
 */
function bookingLinkMessage(booking) {
  const b = booking || {};
  const link = payLink(b);
  const when = longDate(b.date);
  const what = b.packageName || "your charter";

  if (link) {
    return greeting(b) + " — Austin with The Nauti Yachti. "
      + (when ? "Here's the link to lock in " + what + " for " + when + ": " : "Here's the link to lock in " + what + ": ")
      + link + " "
      + REPLY_LINE;
  }

  // No checkout for this row. Say what we have and ask them to confirm, rather
  // than inventing a link — the owner sends the payment link by hand after.
  return greeting(b) + " — Austin with The Nauti Yachti. "
    + "I've got you down for " + what + (when ? " on " + when : "") + ". "
    + "Just say the word and I'll send you the link to pay and lock the seat in. "
    + REPLY_LINE;
}

/**
 * For somebody whose card was declined. A DIFFERENT MESSAGE from the one above,
 * which is the whole point.
 *
 * Sarah Griffith's card was declined for insufficient funds at 10:47pm on
 * 12 Sep 2026. The console offered her the ordinary "here's the link to lock it
 * in" text — which reads as though nobody noticed she had already tried, and
 * says nothing about whether her seats are still there. That is the question she
 * actually has.
 *
 * So this one leads with the seats being held, and it does NOT say why the card
 * failed. The owner knows it was insufficient funds; telling her so in writing
 * is a small humiliation that buys nothing. "It didn't go through" is enough, and
 * it is also true of every other decline reason.
 */
function paymentFailedMessage(booking) {
  const b = booking || {};
  const link = payLink(b);
  const when = longDate(b.date);
  const what = b.packageName || "your charter";

  const parts = [greeting(b) + " — Austin with The Nauti Yachti."];
  parts.push("Looks like the card didn't go through" + (when ? " for " + what + " on " + when : " for " + what) + ".");
  // The reassurance is the reason this text exists at all.
  parts.push("Nothing's lost on our end — your spot is still held.");
  if (link) {
    parts.push("Whenever you're ready, same link works with any card: " + link);
  } else {
    parts.push("Say the word when you're ready and I'll send a fresh link.");
  }
  parts.push(REPLY_LINE);
  return parts.join(" ");
}

/**
 * For a booking that is already paid and on the calendar: the nudge a few days
 * before. Says the three things a guest actually forgets — day, time, where.
 */
function reminderMessage(booking) {
  const b = booking || {};
  const when = longDate(b.date);
  const board = clockTime(b.startTime);
  const boat = b.vesselName || "the boat";

  const parts = [greeting(b) + " — Austin with The Nauti Yachti."];
  if (when) {
    parts.push("Just a reminder we've got you for " + when + " on " + boat + ".");
  } else {
    parts.push("Just checking in about your charter on " + boat + ".");
  }
  // startTime is when the boat LEAVES, not when to turn up. Saying "meet us by
  // 5:00" for a 5:00 rope-off puts the guest on the ramp watching it go —
  // which is exactly what the first version of this said to Hunter. The times
  // are read from the booking row, so this text followed the glow night from a
  // 7pm departure to a 5pm one on 17 Sep 2026 without being edited.
  const where = meetingPoint(b);
  if (board) {
    parts.push("We push off at " + board + " from " + (where || "the ramp")
      + ", so get there a little before that.");
  } else if (where) {
    parts.push("We're leaving from " + where + ".");
  }
  // The trip page carries the rest: what to bring, and the photo box afterwards.
  // tripUrl is put on each row by the console's booking APIs (lib/tripLink.js).
  if (b.tripUrl) parts.push("Everything for the day is here: " + b.tripUrl);
  parts.push(REPLY_LINE);
  return parts.join(" ");
}

/**
 * The one offer worth texting people about, picked from the live coupon list
 * rather than written into this file.
 *
 * WHY IT IS DERIVED AND NOT HARDCODED: a sale that lives in source has to be
 * edited, built and deployed to end, and the day it expires the console would
 * still be offering it. Reading the coupons the admin already loads means the
 * button stops offering a code the moment it is expired, capped out or
 * switched off, with nothing to remember.
 *
 * CAMPAIGN-SHAPED ONLY -- it must have BOTH an end date and a usage cap. That
 * is the test that separates a sale from a standing perk. SIDEPIECE50 and
 * FAMILY20 are uncapped codes kept for particular people; picking by "biggest
 * discount" or "soonest expiry" alone would cheerfully text a 50% code to
 * forty-two people.
 */
function liveOffer(coupons, today) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))
    ? today
    : new Date().toISOString().slice(0, 10);
  const live = (coupons || []).filter((c) =>
    c && c.active && !c.archived &&
    c.expiresAt && String(c.expiresAt) >= day &&
    c.maxUses != null && Number(c.usedCount || 0) < Number(c.maxUses)
  );
  if (!live.length) return null;
  live.sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
  return live[0];
}

/**
 * A past guest, or somebody who asked once and never booked, and the reason to
 * get back in touch.
 *
 * TWO OPENERS, because these are not the same person. "Hope you've been well
 * since your trip" sent to somebody who never sailed is a small lie and reads
 * like a mail-merge. The offer half is identical; only the opener changes.
 *
 * It is a DRAFT. The button hands it to the phone's own SMS app with the
 * number filled in, and he sends it -- or rewrites it first. Nothing here
 * sends anything.
 */
function campaignMessage(contact, offer) {
  const c = contact || {};
  const f = firstName(c.name);
  const hi = f ? "Hey " + f : "Hey";
  const opener = c.sailed
    ? hi + " — Austin with The Nauti Yachti. Hope you've been well since your trip with us."
    : hi + " — Austin with The Nauti Yachti on Lake Conroe. You asked about a charter with us a while back.";

  if (!offer) {
    return opener + " We've still got dates open if you fancy getting back out on the water. "
      + "Have a look at " + SITE + " or just reply here. " + REPLY_LINE;
  }

  const off = offer.discountType === "percent"
    ? offer.discountValue + "% off"
    : "$" + offer.discountValue + " off";
  const cap = offer.maxUses ? " First " + offer.maxUses + " bookings." : "";
  const until = longDate(offer.expiresAt) ? " Good through " + longDate(offer.expiresAt) + "." : "";

  return opener + " We're running a sale at the moment — " + off
    + " with code " + offer.code + "." + cap + until
    + " Book at " + SITE + ", or reply here and I'll set it up for you. " + REPLY_LINE;
}

module.exports = { bookingLinkMessage, paymentFailedMessage, reminderMessage, payLink, liveOffer, campaignMessage };
