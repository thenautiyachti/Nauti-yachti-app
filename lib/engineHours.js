// How many hours has this boat run?
//
// TWO OF THE THREE BOATS HAVE NO HOUR METER, and that changes what a row in
// EngineHoursLog means. The owner, logging the first readings on 6 Sep 2026:
//
//   explorer  "There is no engine our counter on this boat so my plan is to
//              just log every hour we take out for each reservation"
//   islander  "This boat does not have an hour meter so we just have to log it
//              per reservation"
//   yachti    "I have not yet got to this boat this boat does have an engine
//              hour counter I just don't know what it reads yet but I want to
//              at least Kick It Off at 1 hour"
//
// So the column holds two different kinds of number. On the Yachti it is a
// METER READING — the number on the dial, which only ever goes up. On the
// Explorer and Islander it is a DURATION — four hours for a four-hour charter,
// and the boat's real total is every one of those added together.
//
// The schema comment said "hour-meter reading at that point, not a duration",
// and the console believed it: it took the LATEST row per vessel and used that
// as the current hours. Under the owner's plan that breaks on the second
// charter — log 4 hours today and 3 hours next Saturday and the Explorer's
// engine appears to go BACKWARDS from 4 to 3. Maintenance intervals are judged
// against that number, so every service item on both unmetered boats would have
// been measured against a figure that wanders up and down at random.
//
// Neither way of logging is wrong. A boat with no meter cannot report a
// reading, and asking the owner to keep a running total in his head at the dock
// is how you get arithmetic errors instead of missing data. The fix is for the
// code to know which kind of number it is looking at.

// Metered boats report a reading; unmetered boats report time run.
function isMetered(vessel) {
  return !!(vessel && vessel.hasHourMeter);
}

// The boat's hours now.
//
// Metered: the most recent reading. Earlier rows are history, not addends —
// adding them would count the same engine time many times over.
//
// Unmetered: the sum of every duration logged. Each row is time that was
// actually run, so the total is the total.
function currentHours(vessel, logs) {
  const mine = (logs || []).filter((l) => l && l.vesselId === (vessel && vessel.id) && l.hours != null);
  if (!mine.length) return null;
  if (isMetered(vessel)) {
    const latest = mine.reduce((best, l) => {
      if (!best) return l;
      if (l.date > best.date) return l;
      if (l.date === best.date && String(l.createdAt) > String(best.createdAt)) return l;
      return best;
    }, null);
    return latest ? Number(latest.hours) : null;
  }
  // Rounded to one decimal: a run of 3.5-hour charters otherwise accumulates a
  // float tail that shows up as 24.700000000000003 on the maintenance card.
  return Math.round(mine.reduce((s, l) => s + Number(l.hours || 0), 0) * 10) / 10;
}

// Every vessel's current hours, keyed by id.
function hoursByVessel(vessels, logs) {
  const out = {};
  for (const v of vessels || []) out[v.id] = currentHours(v, logs);
  return out;
}

// The highest hours across the fleet.
//
// Maintenance items are not tied to one boat, so they are judged against the
// hardest-worked engine. Previously this took the max of every raw row, which
// for an unmetered boat meant the longest single charter rather than its total
// — so a fleet with 300 accumulated hours could report 8.
function fleetHours(vessels, logs) {
  const vals = Object.values(hoursByVessel(vessels, logs)).filter((h) => h != null);
  return vals.length ? Math.max(...vals) : null;
}

// What to call the number on screen, so nobody has to guess which kind it is.
function hoursLabel(vessel) {
  return isMetered(vessel) ? "hour-meter reading" : "hours run (totalled from each charter)";
}

module.exports = { isMetered, currentHours, hoursByVessel, fleetHours, hoursLabel };
