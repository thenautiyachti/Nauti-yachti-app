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

// A booking that has a payment page is one the /pay/<id> route can actually
// resolve, and that route reads the Inquiry table only. An ExternalBooking has
// no online checkout, so offering its guest a payment link would send them to
// "this link is no longer valid" — worse than sending nothing.
function payLink(b) {
  if (!b || b.kind === "external") return null;
  if (b.paymentStatus === "paid") return null;
  if (!(Number(b.priceQuoted) > 0)) return null;
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
  if (board) parts.push("We push off at " + board + ", so get to the ramp a little before that.");
  parts.push("Anything you need before then, just text me.");
  return parts.join(" ");
}

module.exports = { bookingLinkMessage, reminderMessage, payLink };
