// What a booking's status means, defined once, for both models.
//
// THE LIFECYCLE, in the owner's own words (4 Sep 2026):
//
//   inquiry  ─────► booked ─────► completed      the charter ran
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

const STATUSES = ["inquiry", "lapsed", "booked", "completed", "cancelled"];

const LABELS = {
  inquiry: "Enquiry",
  lapsed: "Lapsed",
  booked: "Booked",
  completed: "Completed",
  cancelled: "Cancelled",
};

const DESCRIPTIONS = {
  inquiry: "Someone asked. Waiting on them, or on us. Still live.",
  lapsed: "Asked and never booked. Nothing went wrong — it just did not convert.",
  booked: "Confirmed and on the calendar.",
  completed: "The charter ran.",
  cancelled: "It WAS a booking. Money went through, and a repayment may be owed.",
};

const COLORS = {
  inquiry: "#8A7CA8",
  lapsed: "#6E6480",
  booked: "#4FA8E8",
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
  completed: "completed",
  cancelled: "cancelled",
};

// --- the questions callers actually want to ask -----------------------------

// Does this occupy the boat on its date? The only question the availability
// calendar, the partial-date map and the day-conflict checks should ever ask.
// Nothing that has not been booked occupies anything.
function holdsTheDay(status) {
  return status === "booked" || status === "completed";
}

// Was this ever a real booking? True for a cancellation, because it was one
// before it was cancelled -- which is exactly what separates it from a lapsed
// enquiry, and what makes a repayment possible.
function wasEverBooked(status) {
  return status === "booked" || status === "completed" || status === "cancelled";
}

// Somebody asked. Live enquiries and lapsed ones together are the denominator
// for a conversion rate; neither is the numerator for anything.
function isEnquiry(status) {
  return status === "inquiry" || status === "lapsed";
}

// Still worth chasing: nobody has said no, and it has not gone quiet.
function isLive(status) {
  return status === "inquiry" || status === "booked";
}

// The charter ran. Drives the review ask list and the season counts.
function didSail(status) {
  return status === "completed";
}

// Money moved and may have to come back. Rare, and always worth a look.
function isCancellation(status) {
  return status === "cancelled";
}

// Should a missing price be reported as a gap? Only for something that sailed.
// An enquiry with no price is not a gap, it is an enquiry.
function needsAPrice(status) {
  return status === "completed";
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

module.exports = {
  STATUSES,
  LABELS,
  DESCRIPTIONS,
  COLORS,
  INQUIRY_STATUS_BUCKET,
  HOLDS_THE_DAY,
  ENQUIRIES,
  holdsTheDay,
  wasEverBooked,
  isEnquiry,
  isLive,
  didSail,
  isCancellation,
  needsAPrice,
  looksLikeALapsedEnquiry,
};
