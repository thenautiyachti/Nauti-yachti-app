// What a booking's status means, defined once, for both models.
//
// THE LIFECYCLE, in the owner's own words (4 Sep 2026):
//
//   inquiry  ─────► booked ─────► completed      the charter ran
//      │               │  ▲
//      │               │  │
//      │               ├──┴────► owed            paid for, never sailed, and no
//      │               │                          new date yet. Added 5 Sep 2026
//      │               │                          -- see below. Goes back to
//      │               │                          booked the moment a date is
//      │               │                          agreed; it is a waiting room,
//      │               │                          not a destination.
//      │               │
//      │               └───────► cancelled       "payment was passed through
//      │                                          and some type of repayment,
//      │                                          if any, is issued back"
//      │
//      └──────────────────────► lapsed           "if the inquiry never makes it
//                                                 to booking stage, its not
//                                                 technically cancelled, its
//                                                 just lapsed"
//
// WHY "owed" EXISTS, in the owner's words (5 Sep 2026): "it neither booked or
// canceled so what is?"
//
// Christian Gehring paid $520 in June for an 11 July charter that never ran, and
// he has been sitting as "cancelled" ever since. That is wrong in the direction
// that costs money. Cancelled says a repayment may be owed and the relationship
// is over; the truth is the opposite -- the business is holding his money and
// owes him a boat, and he still wants to go. The owner's standing rule is to
// offer the date rather than the refund, and a status that reads "cancelled"
// argues against that rule every time anyone looks at the row.
//
// It is named for the thing it already had a name for: lib/owedCharters.js was
// written for exactly this guest, and calls them owed charters throughout. One
// concept, one word.
//
// THE TRAP, and it is the same one this file's original comment warns about
// below: `owed` must NOT hold the day. An owed charter has no date -- Gehring's
// is literally the string "TBD" -- so anything that treats a real booking as an
// occupied day has to keep saying no to it. holdsTheDay() is where that lives,
// and it is deliberately left alone.
//
// THE MISTAKE THIS FIXES, and it was made twice. "cancelled" was carrying three
// different situations at once: a real cancellation with money moving, a
// platform enquiry that never converted, and -- on the Inquiry side -- a website
// enquiry that went quiet, which the bucket map literally spelled
// `lapsed: "cancelled"`.
//
// Measured before the fix: of 34 ExternalBooking rows marked cancelled, THIRTY-
// THREE had never had a cent move. One -- Christian Gehring's $520 -- was real.
//
// Why it mattered beyond tidiness: every conversion count was wrong in a
// direction nobody could see. "Every GetMyBoat enquiry since 13 June cancelled"
// described seventeen bookings being lost, when there were never seventeen
// bookings. And a cancellation is a refund question, which is the single thing
// this business has most often got wrong -- burying one real one among 33
// non-events is how it stays buried.
//
// THE DANGEROUS PART, which is why the predicates exist. Four places used
// `status !== "cancelled"` as a proxy for "this is a real booking" -- including
// app/page.js, the PUBLIC availability calendar. Introducing a new status
// without fixing those first would have put 33 enquiries on the live calendar as
// booked days, blocking dates guests could actually have had. So the meaning
// lives here and callers ask questions; they do not compare strings.

const STATUSES = ["inquiry", "lapsed", "booked", "owed", "completed", "cancelled"];

const LABELS = {
  inquiry: "Enquiry",
  lapsed: "Lapsed",
  booked: "Booked",
  owed: "Owed",
  completed: "Completed",
  cancelled: "Cancelled",
};

const DESCRIPTIONS = {
  inquiry: "Someone asked. Waiting on them, or on us. Still live.",
  lapsed: "Asked and never booked. Nothing went wrong — it just did not convert.",
  booked: "Confirmed and on the calendar.",
  owed: "They paid, the trip never happened, and there is no new date yet. We are holding their money and owe them a charter. Not a cancellation — they still want to go.",
  completed: "The charter ran.",
  cancelled: "It WAS a booking. Money went through, and a repayment may be owed.",
};

const COLORS = {
  inquiry: "#8A7CA8",
  lapsed: "#6E6480",
  booked: "#4FA8E8",
  // The console's existing "you need to do something about this" amber, rather
  // than a sixth invented hue. An owed charter is a task, and it should look
  // like the other tasks -- not like a variant of cancelled.
  owed: "#E8934A",
  completed: "#7FE0B8",
  cancelled: "#F0559C",
};

// Website enquiries carry their own status values. Both models now land on the
// same five buckets, so the unified table can stop pretending a lapsed enquiry
// is a cancellation.
const INQUIRY_STATUS_BUCKET = {
  new: "inquiry",
  pending: "inquiry",
  lapsed: "lapsed",
  booked: "booked",
  owed: "owed",
  completed: "completed",
  cancelled: "cancelled",
};

// --- the questions callers actually want to ask -----------------------------

// Does this occupy the boat on its date? The only question the availability
// calendar, the partial-date map and the day-conflict checks should ever ask.
// Nothing that has not been booked occupies anything.
// NOTE ON "owed": deliberately absent. It is the one status where a real
// booking, with real money behind it, occupies no day at all -- that is what
// makes it owed. Adding it here would block a date nobody has chosen yet, and
// for Gehring it would try to block the string "TBD".
function holdsTheDay(status) {
  return status === "booked" || status === "completed";
}

// Was this ever a real booking? True for a cancellation, because it was one
// before it was cancelled -- which is exactly what separates it from a lapsed
// enquiry, and what makes a repayment possible. True for an owed charter for
// the same reason, and more plainly: it still is one.
function wasEverBooked(status) {
  return status === "booked" || status === "completed" ||
    status === "cancelled" || status === "owed";
}

// Somebody asked. Live enquiries and lapsed ones together are the denominator
// for a conversion rate; neither is the numerator for anything.
function isEnquiry(status) {
  return status === "inquiry" || status === "lapsed";
}

// Still worth chasing: nobody has said no, and it has not gone quiet. An owed
// charter is the most worth chasing of the three -- the guest has already paid
// and already said yes, and the only missing thing is a date.
function isLive(status) {
  return status === "inquiry" || status === "booked" || status === "owed";
}

// Paid for, never sailed, no date. The business is holding money against a
// charter it has not delivered, which makes this a liability rather than a
// sale, and a to-do rather than a record.
function isOwed(status) {
  return status === "owed";
}

// The charter ran. Drives the review ask list and the season counts.
function didSail(status) {
  return status === "completed";
}

// Money moved and may have to come back. Rare, and always worth a look.
//
// "owed" is NOT one of these, and that distinction is the whole reason it was
// added. A cancellation is a relationship that ended and a refund question; an
// owed charter is a relationship that is still open and a scheduling question.
// Counting Gehring as a cancellation for two months is what buried him.
function isCancellation(status) {
  return status === "cancelled";
}

// Should a missing price be reported as a gap? For something that sailed, and
// for something owed: if the business is holding a guest's money against an
// undelivered charter, not knowing how much is a gap by any reading. An enquiry
// with no price is not a gap, it is an enquiry.
function needsAPrice(status) {
  return status === "completed" || status === "owed";
}

// A row written before this vocabulary existed may still say "cancelled" while
// carrying no money at all. Analysis over historical data can use this to spot
// one rather than trusting the label.
function looksLikeALapsedEnquiry(booking) {
  if (!booking) return false;
  if (booking.status !== "cancelled") return false;
  return !Number(booking.pricePaid || 0);
}

// For Prisma `in` filters, where a predicate cannot be used. Derived from the
// predicates so the two cannot drift apart.
const HOLDS_THE_DAY = STATUSES.filter(holdsTheDay);
const ENQUIRIES = STATUSES.filter(isEnquiry);
const OWED = STATUSES.filter(isOwed);

module.exports = {
  STATUSES,
  LABELS,
  DESCRIPTIONS,
  COLORS,
  INQUIRY_STATUS_BUCKET,
  HOLDS_THE_DAY,
  ENQUIRIES,
  OWED,
  holdsTheDay,
  wasEverBooked,
  isEnquiry,
  isLive,
  isOwed,
  didSail,
  isCancellation,
  needsAPrice,
  looksLikeALapsedEnquiry,
};
