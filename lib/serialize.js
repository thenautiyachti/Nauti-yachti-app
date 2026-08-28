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
const FULL_DAY_HOURS = 8;

// Sums confirmed external-booking hours per vessel/date and buckets each
// into "partial" or "full". Returns { [vesselId]: { [date]: "partial"|"full" } }.
function groupExternalBookingState(externalBookingRows) {
  const totals = {};
  for (const row of externalBookingRows) {
    if (row.status !== "confirmed") continue;
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
