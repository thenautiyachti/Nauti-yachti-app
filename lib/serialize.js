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
// "an inquiry blocks a date". Nothing had noticed because every inquiry was
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

// WHEN a partly-booked day is actually taken.
//
// A guest's complaint, 8 Sep 2026: "you click on availability and it just says
// partially booked but doesn't give you a time slot of when it's booked."
//
// He is right, and the information was already there — every booking carries a
// startTime and a number of hours. groupExternalBookingState throws both away
// and keeps only the SUM, because all it ever needed to answer was whether the
// day was full. So a guest looking at an orange square could see that some of
// the day was gone and had no way to learn which part, which is the one thing
// that decides whether they can still come.
//
// Returns { [vesselId]: { [date]: [{ start, hours, endMinutes, startMinutes }] } },
// sorted through the day.
//
// A booking with no startTime is skipped rather than guessed at. Twelve of the
// forty-two rows have none — mostly older ones taken by text — and inventing a
// window for those would be worse than the square the guest is complaining
// about: wrong times are actionable in a way that vague ones are not.
function groupBookedWindows(externalBookingRows) {
  const out = {};
  for (const row of externalBookingRows) {
    if (!holdsTheDay(row.status)) continue;
    if (!row.startTime || !row.hours) continue;
    const m = String(row.startTime).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const startMinutes = Number(m[1]) * 60 + Number(m[2]);
    const hours = Number(row.hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    out[row.vesselId] = out[row.vesselId] || {};
    out[row.vesselId][row.date] = out[row.vesselId][row.date] || [];
    out[row.vesselId][row.date].push({
      start: row.startTime,
      hours,
      startMinutes,
      endMinutes: startMinutes + Math.round(hours * 60),
    });
  }
  for (const v in out) {
    for (const d in out[v]) out[v][d].sort((a, b) => a.startMinutes - b.startMinutes);
  }
  return out;
}

// "19:00" + 4h -> "7–11pm". Minutes are shown only when they are not zero,
// because "7:00–11:00pm" is noisier than "7–11pm" and every charter so far
// starts on the hour.
function formatWindow(win) {
  const label = (mins) => {
    const total = ((mins % 1440) + 1440) % 1440;
    const h24 = Math.floor(total / 60), mm = total % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { text: mm ? `${h12}:${String(mm).padStart(2, "0")}` : String(h12), pm: h24 >= 12 };
  };
  const a = label(win.startMinutes), b = label(win.endMinutes);
  // Drop the first meridiem when both ends share it: "7–11pm", not "7pm–11pm".
  return a.pm === b.pm
    ? `${a.text}–${b.text}${b.pm ? "pm" : "am"}`
    : `${a.text}${a.pm ? "pm" : "am"}–${b.text}${b.pm ? "pm" : "am"}`;
}

module.exports = {
  parsePackage,
  groupBlockedDates,
  groupExternalBookingState,
  groupBookedWindows,
  formatWindow,
  FULL_DAY_HOURS,
};
