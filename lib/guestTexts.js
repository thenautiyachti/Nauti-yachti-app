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
      + link
      + " Any questions just text me back.";
  }

  // No checkout for this row. Say what we have and ask them to confirm, rather
  // than inventing a link — the owner sends the payment link by hand after.
  return greeting(b) + " — Austin with The Nauti Yachti. "
    + "I've got you down for " + what + (when ? " on " + when : "") + ". "
    + "Reply to confirm and I'll send you the link to pay and lock the seat in.";
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
  // 7:00" for a 7:00 departure puts the guest on the ramp watching it go —
  // which is exactly what the first version of this said to Hunter, whose glow
  // night boards at 6:30 and pushes off at 7:00.
  const where = meetingPoint(b);
  if (board) {
    parts.push("We push off at " + board + " from " + (where || "the ramp")
      + ", so get there a little before that.");
  } else if (where) {
    parts.push("We're leaving from " + where + ".");
  }
  parts.push("Anything you need before then, just text me.");
  return parts.join(" ");
}

module.exports = { bookingLinkMessage, reminderMessage, payLink };
