// Has an agent actually missed a run?
//
// THE BUG THIS REPLACES. Staleness was decided by fuzzy substring matching on
// the schedule text:
//
//     if (/day/i.test(schedule))          return days > 2;
//     if (/monday|week/i.test(schedule))  return days > 9;
//
// "Mondays and Fridays, 9am" contains the substring "day", inside "Mondays".
// So every twice-weekly agent matched the FIRST branch and was judged against a
// daily two-day threshold — the weekly branch below it was unreachable for
// exactly the agents it was written for.
//
// On Sunday 6 Sep 2026 that put four agents on the owner's dashboard under
// "has gone quiet": Joy, Reef, Shelly and Nova. All four had run on Friday
// exactly as scheduled and were not due again until Monday. Nothing was wrong.
//
// A false alarm is not a harmless alarm. This panel exists because scheduled
// runs here really do die silently, and an alert that cries wolf every weekend
// is one the owner learns to scroll past — which is precisely when the real
// outage arrives.
//
// So: work out when the agent was actually last DUE, and compare against that.

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Pull "9am", "10:30am", "7:15pm", "08:30 AM" out of a schedule line.
function parseTimes(s) {
  const out = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    let hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    const suffix = m[3].toLowerCase();
    if (hour > 12 || minute > 59) continue;
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    out.push({ hour, minute });
  }
  // 24-hour times with no am/pm, e.g. "at 14:30".
  if (!out.length) {
    const re24 = /\b(\d{1,2}):(\d{2})\b/g;
    while ((m = re24.exec(s)) !== null) {
      const hour = Number(m[1]);
      const minute = Number(m[2]);
      if (hour <= 23 && minute <= 59) out.push({ hour, minute });
    }
  }
  return out.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
}

// Which weekdays it runs on. Named days win; otherwise "every day" / "twice a
// day" / "daily" mean all seven.
function parseDays(s) {
  const lower = String(s || "").toLowerCase();
  const days = [];
  DAY_NAMES.forEach((name, i) => {
    if (lower.includes(name)) days.push(i);
  });
  if (days.length) return days;
  if (/(every|each|a|per)\s+day|daily/.test(lower)) return [0, 1, 2, 3, 4, 5, 6];
  return [];
}

function parseSchedule(schedule) {
  const s = String(schedule || "");
  return {
    days: parseDays(s),
    times: parseTimes(s),
    monthly: /month/i.test(s),
  };
}

// The most recent moment this agent was supposed to run, at or before `now`.
// null when the schedule cannot be read — in which case nothing is claimed.
function lastDueRun(schedule, now) {
  const { days, times, monthly } = parseSchedule(schedule);
  const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
  // A monthly cadence with no weekday is not worth guessing at; the caller
  // treats null as "cannot judge", which is the honest answer.
  if (monthly && !days.length) return null;
  if (!days.length || !times.length) return null;

  // Walk back a day at a time. Five weeks is far more than any cadence here
  // needs and bounds the loop.
  for (let back = 0; back <= 35; back++) {
    const d = new Date(at.getFullYear(), at.getMonth(), at.getDate() - back);
    if (!days.includes(d.getDay())) continue;
    let best = null;
    for (const t of times) {
      const slot = new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.hour, t.minute, 0, 0);
      if (slot.getTime() <= at.getTime() && (!best || slot > best)) best = slot;
    }
    if (best) return best;
  }
  return null;
}

// How long after a missed slot before it counts as quiet.
//
// Generous on purpose: runs carry up to ~9 minutes of jitter, a run itself
// takes time, and a machine that was asleep may catch up. Three hours means a
// failed 9am Monday run is on the dashboard by lunchtime — soon enough to act
// on, late enough not to flag a run that is merely running.
const GRACE_MS = 3 * 60 * 60 * 1000;

// Has this agent missed the run she was last due to make?
//
// `run` is her latest activity row ({ startedAt }). No run at all returns false:
// "never reported" is a different state with its own line on the dashboard, and
// reporting it twice under two headings helps nobody.
function isQuiet(run, schedule, now, graceMs) {
  if (!run || !run.startedAt) return false;
  const at = now instanceof Date ? now.getTime() : (now == null ? Date.now() : now);
  const grace = graceMs == null ? GRACE_MS : graceMs;
  // Judge against the last slot that is FULLY past — the most recent one older
  // than the grace period — rather than the last slot of any age.
  //
  // The difference matters. Checking the newest slot and then excusing it while
  // it is inside the grace window means an agent that has missed a week of runs
  // looks healthy for three hours after every fresh slot ticks by, because the
  // only slot being examined is one nobody could have run yet.
  const due = lastDueRun(schedule, at - grace);
  if (!due) return false;
  return new Date(run.startedAt).getTime() < due.getTime();
}

// For the dashboard line: "she runs Mondays and Fridays, 9am" is what the owner
// already sees; this adds when that next actually falls.
function nextDueRun(schedule, now) {
  const { days, times } = parseSchedule(schedule);
  const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
  if (!days.length || !times.length) return null;
  for (let ahead = 0; ahead <= 35; ahead++) {
    const d = new Date(at.getFullYear(), at.getMonth(), at.getDate() + ahead);
    if (!days.includes(d.getDay())) continue;
    for (const t of times) {
      const slot = new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.hour, t.minute, 0, 0);
      if (slot.getTime() > at.getTime()) return slot;
    }
  }
  return null;
}

module.exports = { parseSchedule, parseTimes, parseDays, lastDueRun, nextDueRun, isQuiet, GRACE_MS, DAY_NAMES };
