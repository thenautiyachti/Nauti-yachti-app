// Guests who paid for a charter that never ran.
//
// This is the mirror image of lib/reviews.js. That one goes out AFTER a
// delivered charter and asks for something. This one goes out after an
// UNDELIVERED one and offers something — and the difference in direction
// changes almost every decision in here.
//
// WHY IT EXISTS: Christian Gehring paid $520 in June for an 11 July charter,
// cancelled, asked to reschedule, and then heard nothing for two months. Not
// because anyone decided to ignore him — because there was no list he could
// appear on. The review flow only ever looked at COMPLETED charters, so a
// guest who never got on the water was invisible to every piece of automation
// the business had.
//
// It should stay rare. That is the point: rare things are exactly what get
// forgotten, because nobody builds a habit around them.

const { normalizePhone, smsHref, firstName, daysSince } = require("./reviews");

// --- who qualifies -----------------------------------------------------------

// Money taken, date gone, charter never delivered. Deliberately NOT restricted
// to status "cancelled": a booking left sitting as "booked" with its date in
// the past is the same failure wearing a different label, and arguably worse
// because nobody even marked it.
//
// A booking with no date at all counts too. Gehring's is "TBD" precisely
// BECAUSE it never ran — filtering on a parseable date would drop the one row
// this was written for.
function isOwedCharter(b, today) {
  if (!b) return false;
  if (Number(b.pricePaid) <= 0) return false;
  if (b.status === "completed") return false;
  if (b.marketingOptOut) return false;
  const d = String(b.date || "");
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(d);
  return !dated || d < today;
}

// Freshest first: a guest who slipped last week is far likelier to rebook than
// one from last season, and the wording below changes with it.
function owedCharters(bookings, today) {
  return (bookings || [])
    .filter((b) => isOwedCharter(b, today))
    .map((b) => ({
      ...b,
      daysOwed: /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ? daysSince(b.date, today) : null,
      reachable: !!(b.phone || b.email),
    }))
    .sort((a, b) => (b.daysOwed ?? 99999) - (a.daysOwed ?? 99999));
}

// --- what to say -------------------------------------------------------------

// THE STANDING RULE, set by the owner on 3 Sep 2026:
//
//   "I don't want to ask if they want a refund. I would rather fit them in
//    the schedule."
//
// So none of these mention a refund. That is not a trick — the money is still
// theirs and they can ask — but opening with "do you want your money back?"
// invites the answer that ends the relationship, when the guest's original
// intent was to go boating. Offer the boat; let them raise the refund.
//
// Equally, none of them apologise at length. A paragraph of contrition reads
// as a business bracing for a complaint. One honest line, then a date.
const TEMPLATES = [
  { id: "sms", label: "Text message (recommended)" },
  { id: "warm", label: "Warm — under 60 days" },
  { id: "cold", label: "Cold — months later" },
  { id: "nolink", label: "Platform-safe (no link)" },
];

function windowFor(daysOwed) {
  if (daysOwed == null) return "cold"; // undated means it has been drifting
  if (daysOwed <= 60) return "warm";
  return "cold";
}

function owedMessage(templateId, booking, today) {
  const b = booking || {};
  const hi = firstName(b.name || b.guestName) ? `Hey ${firstName(b.name || b.guestName)}` : "Hey";
  const boat = b.vesselName || "the boat";

  switch (templateId) {
    case "sms":
      // Short on purpose. This is the one that actually gets sent, and a text
      // that runs to five sentences reads as a form letter.
      return `${hi} — Austin with The Nauti Yachti. We haven't forgotten about you. ` +
        why(b) +
        ` We'd love to get you on the water. What weekend works and I'll hold ${boat} for you?`;

    case "warm":
      return `${hi},\n\n` +
        `We still have you down from when your trip didn't happen, and we haven't forgotten about you. ` +
        `We'd really like to get you out on the water.\n\n` +
        `Tell me a weekend that suits and I'll hold ${boat} for you — your booking stands, nothing to re-pay.\n\n` +
        `— Austin & Brooke, The Nauti Yachti`;

    case "cold":
      // Months later, leading with nostalgia would be insulting. Lead with the
      // fact that it was left unfinished and that the business knows it.
      return `${hi},\n\n` +
        `This is overdue and that's on us. Your charter never happened and we never got you rescheduled.\n\n` +
        `Your booking still stands — nothing to re-pay. If you'd still like to go out, name a weekend ` +
        `and I'll hold ${boat}. If the timing has passed for you, just say and we'll sort it out properly.\n\n` +
        `— Austin & Brooke, The Nauti Yachti`;

    case "nolink":
      return `${hi} — Austin from The Nauti Yachti. Your charter never ran and your booking still stands. ` +
        `We'd like to get you out on the water. Reply here with a weekend that works and I'll hold ${boat}.`;

    default:
      return owedMessage("sms", b, today);
  }
}

// The one honest sentence about what happened, without inventing a reason.
function why(b) {
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ""));
  if (dated) return `Your ${b.date} trip never got back on the calendar.`;
  return `Your trip never got back on the calendar.`;
}

function owedSubject(b) {
  return `Let's get you back on the water — The Nauti Yachti`;
}

// The tap-to-text link, same shape as the review flow so the dock page and the
// Monday email can render both lists identically.
function owedSmsHref(booking, today) {
  return smsHref(booking.phone, owedMessage("sms", booking, today));
}

module.exports = {
  TEMPLATES,
  isOwedCharter,
  owedCharters,
  windowFor,
  owedMessage,
  owedSubject,
  owedSmsHref,
};
