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
const SITE = "https://www.thenautiyachti.com";
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
  parts.push(REPLY_LINE);
  return parts.join(" ");
}

module.exports = { bookingLinkMessage, paymentFailedMessage, reminderMessage, payLink };
