// Turns a raw Package row (with its *Json string columns) into the shape
// the frontend components expect (parsed objects/arrays).
function parsePackage(p) {
  return {
    ...p,
    bullets: p.bulletsJson ? JSON.parse(p.bulletsJson) : null,
    tiers: p.tiersJson ? JSON.parse(p.tiersJson) : null,
    hourlyByVessel: p.hourlyJson ? JSON.parse(p.hourlyJson) : null,
    vessels: JSON.parse(p.vesselsJson),
  };
}

function groupBlockedDates(rows) {
  const grouped = {};
  for (const row of rows) {
    grouped[row.vesselId] = grouped[row.vesselId] || [];
    grouped[row.vesselId].push(row.date);
  }
  return grouped;
}

// An 8-hour day is treated as fully booked; anything less (but still
// confirmed) leaves the rest of the day open, so it's marked "partial"
// rather than fully blocking it the way an owner's manual BlockedDate does.
const { holdsTheDay } = require("./bookingStatus");

const FULL_DAY_HOURS = 8;

// Sums the hours of bookings that OCCUPY the boat, per vessel/date, and buckets
// each into "partial" or "full". Returns { [vesselId]: { [date]: "partial"|"full" } }.
// Includes both "booked" (upcoming/confirmed) and "completed" (already
// happened) — a future booked reservation must block the calendar just as
// much as a past one, otherwise the same date could get double-booked.
//
// It used to exclude "cancelled" and take everything else, which quietly meant
// "an enquiry blocks a date". Nothing had noticed because every enquiry was
// labelled cancelled too. holdsTheDay() is now the only test, so the filter
// cannot drift from what it means again.
function groupExternalBookingState(externalBookingRows) {
  const totals = {};
  for (const row of externalBookingRows) {
    if (!holdsTheDay(row.status)) continue;
    totals[row.vesselId] = totals[row.vesselId] || {};
    totals[row.vesselId][row.date] = (totals[row.vesselId][row.date] || 0) + (Number(row.hours) || 0);
  }
  const state = {};
  for (const vesselId in totals) {
    state[vesselId] = {};
    for (const date in totals[vesselId]) {
      state[vesselId][date] = totals[vesselId][date] >= FULL_DAY_HOURS ? "full" : "partial";
    }
  }
  return state;
}

module.exports = { parsePackage, groupBlockedDates, groupExternalBookingState, FULL_DAY_HOURS };
