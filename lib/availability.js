// IS THIS BOAT FREE FOR THIS CHARTER? Asked by the server, not the page.
//
// Owner, 1 Oct 2026: "We need to check for availability when a guest books or
// pays." Until then the only thing standing between two guests and the same
// boat on the same day was the calendar on the home page, and that calendar
// only DISPLAYS availability: the date box under it accepts any date at all.
// Two different guests could book, and pay for, the same boat on the same day.
//
// Pure, so it can be tested without a database. lib/availabilityQuery.js
// fetches the rows and calls this.
//
// WHAT A "SLOT" IS HERE. A website booking names a boat, a date and a number of
// hours, never a start time: the owner settles the time with the guest. So the
// question this can answer is the one the public calendar already answers: is
// the boat's day blocked, and has it got this many hours left? A day holds
// FULL_DAY_HOURS (8), the same figure that turns a calendar square from
// "partial" to "full", so the page and the server mean the same thing by full.
//
// A booking with no hours on it counts as none, exactly as on the calendar.
// That under-fills a day rather than over-fills it; the troubleshooting table
// in the manual tells the owner to add the hours.

const { FULL_DAY_HOURS } = require("./serialize");

// How long an unpaid website checkout keeps its slot while the guest is on
// Stripe's page. Matches the Checkout session's own lifetime (set in
// app/api/checkout to the shortest Stripe allows, 30 minutes) plus a margin,
// so a slot is never released while a session that could still pay for it is
// open.
const HOLD_MINUTES = 35;

/**
 * Why this charter cannot go on this boat on this day, or null if it can.
 *
 *   vesselId, date, hours   what is being asked for (hours may be null)
 *   blockedDates            ["YYYY-MM-DD"] the owner has blocked for this boat
 *   occupying               rows that hold the day (lib/occupancy.js shape):
 *                           { id, bookingId, vesselId, date, hours }
 *   holds                   unpaid website checkouts still inside HOLD_MINUTES,
 *                           same shape
 *   exclude                 { ids: [...], bookingId } — the booking being asked
 *                           about, which must never conflict with itself
 *
 * Returns { reason, hoursLeft, message } where reason is "blocked", "full" or
 * "not-enough-hours". The message is written for the guest.
 */
function slotProblem({ vesselId, date, hours, vesselName, blockedDates = [], occupying = [], holds = [], exclude = {} }) {
  if (!vesselId || !date) return null;
  const boat = vesselName || "That boat";

  if (blockedDates.includes(date)) {
    return {
      reason: "blocked",
      hoursLeft: 0,
      message: boat + " is not available on that date. Please pick another date or boat, or call us on 832-948-2912.",
    };
  }

  const excludedIds = new Set((exclude.ids || []).filter(Boolean));
  const mine = (r) => excludedIds.has(r.id) || (exclude.bookingId && r.bookingId === exclude.bookingId);

  // Holds and real bookings are the same question: somebody else is expecting
  // this boat on this day. A hold that has since been paid for is also in the
  // occupying list under the same booking number, so count each number once.
  const seen = new Set();
  let taken = 0;
  for (const r of [...occupying, ...holds]) {
    if (r.vesselId !== vesselId || r.date !== date || mine(r)) continue;
    if (r.bookingId) {
      if (seen.has(r.bookingId)) continue;
      seen.add(r.bookingId);
    }
    taken += Number(r.hours) || 0;
  }

  const hoursLeft = Math.max(0, FULL_DAY_HOURS - taken);
  if (hoursLeft <= 0) {
    return {
      reason: "full",
      hoursLeft: 0,
      message: boat + " is fully booked on that date. Please pick another date or boat, or call us on 832-948-2912.",
    };
  }
  const want = Number(hours) || 0;
  if (want > hoursLeft) {
    return {
      reason: "not-enough-hours",
      hoursLeft,
      message: boat + " only has " + hoursLeft + " hour" + (hoursLeft === 1 ? "" : "s")
        + " left on that date. Please choose fewer hours, another date or another boat, or call us on 832-948-2912.",
    };
  }
  return null;
}

/**
 * Does this start time overlap a charter already booked at a known time?
 *
 * Owner, 15 Oct 2026: once a guest picks a date "it should ask for an estimated
 * time, ensure it's available". slotProblem answers "are there hours left in
 * the day"; this answers "is the boat out at THAT time". Only bookings with a
 * recorded start time can be checked, which is also all the public calendar
 * can show. A booking with no start time is still counted by slotProblem.
 *
 *   startTime "HH:MM", hours   what is being asked for
 *   timed     [{ startTime, hours }] the boat's other charters that day
 *   turnaround minutes kept clear between two charters
 */
function windowProblem({ startTime, hours, vesselName, timed = [], turnaround = 0 }) {
  const m = String(startTime || "").match(/^(\d{1,2}):(\d{2})$/);
  const want = Number(hours) || 0;
  if (!m || !want) return null;
  const a0 = Number(m[1]) * 60 + Number(m[2]);
  const a1 = a0 + Math.round(want * 60);
  for (const r of timed) {
    const n = String(r.startTime || "").match(/^(\d{1,2}):(\d{2})$/);
    const h = Number(r.hours) || 0;
    if (!n || !h) continue;
    const b0 = Number(n[1]) * 60 + Number(n[2]);
    const b1 = b0 + Math.round(h * 60);
    if (a0 < b1 + turnaround && b0 < a1 + turnaround) {
      const label = (mins) => {
        const h24 = Math.floor(mins / 60) % 24, mm = mins % 60;
        return (h24 % 12 === 0 ? 12 : h24 % 12) + (mm ? ":" + String(mm).padStart(2, "0") : "") + (h24 >= 12 ? "pm" : "am");
      };
      return {
        reason: "time-taken",
        message: (vesselName || "That boat") + " is already out " + label(b0) + " to " + label(b1)
          + " that day. Please pick a start time outside that, another date or another boat, or call us on 832-948-2912.",
      };
    }
  }
  return null;
}

/**
 * The seat-sale version: is there room for this party on the night?
 * `seats` is lib/eventSeats.js countSeats() output, counted WITHOUT the
 * booking being asked about.
 */
function seatProblem({ seats, partySize }) {
  if (!seats) return null; // no count, no refusal: the same rule the page uses
  const want = Number.parseInt(partySize, 10) || 0;
  if (want <= seats.available) return null;
  return {
    reason: seats.available === 0 ? "sold-out" : "not-enough-seats",
    seatsLeft: seats.available,
    message: seats.available === 0
      ? "That night is sold out. Join the crew list on the event page to hear about the next one."
      : "Only " + seats.available + " seat" + (seats.available === 1 ? "" : "s")
        + " left on that night. Please book " + seats.available + " or fewer, or call us on 832-948-2912.",
  };
}

module.exports = { HOLD_MINUTES, slotProblem, windowProblem, seatProblem };
