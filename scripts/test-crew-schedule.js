// The real schedules, and the real Sunday that produced four false alarms.
const { parseSchedule, lastDueRun, nextDueRun, isQuiet } = require("../lib/crewSchedule");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(58) +
    (good ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}
const fmt = (d) => (d ? d.toDateString().slice(0, 3) + " " +
  String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") : null);

console.log("\n  READING THE SCHEDULES AS WRITTEN\n");
ok("Mondays and Fridays, 9am", parseSchedule("Mondays and Fridays, 9am"),
  { days: [1, 5], times: [{ hour: 9, minute: 0 }], monthly: false });
ok("Mondays, 10:30am", parseSchedule("Mondays, 10:30am"),
  { days: [1], times: [{ hour: 10, minute: 30 }], monthly: false });
ok("Every day, 11am", parseSchedule("Every day, 11am"),
  { days: [0, 1, 2, 3, 4, 5, 6], times: [{ hour: 11, minute: 0 }], monthly: false });
ok("Twice a day, 11:15am and 7:15pm", parseSchedule("Twice a day, 11:15am and 7:15pm"),
  { days: [0, 1, 2, 3, 4, 5, 6], times: [{ hour: 11, minute: 15 }, { hour: 19, minute: 15 }], monthly: false });
ok("Every day, 8:30am and 2:30pm", parseSchedule("Every day, 8:30am and 2:30pm").times,
  [{ hour: 8, minute: 30 }, { hour: 14, minute: 30 }]);
ok("noon is 12, not 0", parseSchedule("Every day, 12:00pm").times, [{ hour: 12, minute: 0 }]);
ok("midnight is 0, not 12", parseSchedule("Every day, 12:00am").times, [{ hour: 0, minute: 0 }]);
ok("unreadable schedule claims nothing", parseSchedule("when he feels like it").days, []);

console.log("\n  THE WEEKEND CADENCE, ADDED 6 SEP 2026\n");
// Joy, Reef and Shelly picked up Saturday and Sunday because that is when
// charters actually run. The string has to parse to exactly those four days,
// or the staleness check silently goes back to guessing.
const WEEKEND = "Fridays, Saturdays, Sundays and Mondays, 9am";
ok("four days, in week order", parseSchedule(WEEKEND).days, [0, 1, 5, 6]);
ok("and one time", parseSchedule(WEEKEND).times, [{ hour: 9, minute: 0 }]);
ok("the 9:30 variant", parseSchedule("Fridays, Saturdays, Sundays and Mondays, 9:30am").times,
  [{ hour: 9, minute: 30 }]);
ok("Saturday's own slot is the most recent one on Saturday",
  fmt(lastDueRun(WEEKEND, new Date(2026, 8, 12, 11, 0))), "Sat 09:00");
ok("Wednesday looks back to Monday",
  fmt(lastDueRun(WEEKEND, new Date(2026, 8, 9, 12, 0))), "Mon 09:00");
ok("and forward to Friday", fmt(nextDueRun(WEEKEND, new Date(2026, 8, 9, 12, 0))), "Fri 09:00");
// The whole reason for the change: a Saturday charter is no longer ignored
// until Monday.
ok("ran Friday, still fine on Friday evening",
  isQuiet({ startedAt: new Date(2026, 8, 11, 9, 5).toISOString() }, WEEKEND, new Date(2026, 8, 11, 20, 0)), false);
ok("ran Friday, quiet by Saturday lunchtime",
  isQuiet({ startedAt: new Date(2026, 8, 11, 9, 5).toISOString() }, WEEKEND, new Date(2026, 8, 12, 13, 0)), true);

console.log("\n  NOVA: RUNS DAILY, SPEAKS ON MONDAYS\n");
// Her cadence is daily now, so a missed Tuesday is a real fault even though she
// is not due to SAY anything until the following Monday. The check watches that
// she ran, which is the part that would actually be broken.
const NOVA = "Every day, 10:30am";
ok("every day", parseSchedule(NOVA).days, [0, 1, 2, 3, 4, 5, 6]);
ok("ran this morning, fine",
  isQuiet({ startedAt: new Date(2026, 8, 8, 10, 35).toISOString() }, NOVA, new Date(2026, 8, 8, 18, 0)), false);
ok("missed a day, flagged",
  isQuiet({ startedAt: new Date(2026, 8, 6, 10, 35).toISOString() }, NOVA, new Date(2026, 8, 8, 18, 0)), true);

console.log("\n  THE SUNDAY THAT CAUSED THIS\n");
// Sunday 6 Sep 2026, 6pm. Joy, Reef and Shelly ran Friday 4 Sep as scheduled.
const SUNDAY_6PM = new Date(2026, 8, 6, 18, 0);
const FRIDAY_RUN = { startedAt: new Date(2026, 8, 4, 12, 57).toISOString() };

ok("last due run was Friday morning, not today",
  fmt(lastDueRun("Mondays and Fridays, 9am", SUNDAY_6PM)), "Fri 09:00");
// The whole point: she ran after her Friday slot and Monday has not arrived.
ok("Joy is NOT quiet", isQuiet(FRIDAY_RUN, "Mondays and Fridays, 9am", SUNDAY_6PM), false);
ok("Reef is NOT quiet", isQuiet(FRIDAY_RUN, "Mondays and Fridays, 9:30am", SUNDAY_6PM), false);
ok("Shelly is NOT quiet", isQuiet(FRIDAY_RUN, "Mondays and Fridays, 10am", SUNDAY_6PM), false);
ok("Nova is NOT quiet", isQuiet(FRIDAY_RUN, "Mondays, 10:30am", SUNDAY_6PM), false);
ok("and Monday is what comes next",
  fmt(nextDueRun("Mondays and Fridays, 9am", SUNDAY_6PM)), "Mon 09:00");

console.log("\n  BUT A REAL MISS STILL FIRES\n");
// Monday lunchtime, and the 9am run never happened.
const MONDAY_1PM = new Date(2026, 8, 7, 13, 0);
ok("Joy missed Monday 9am", isQuiet(FRIDAY_RUN, "Mondays and Fridays, 9am", MONDAY_1PM), true);
// Ran Saturday, so Sunday's 11am slot came and went untouched. That must fire
// even though Monday's own 11am is still inside the grace window.
ok("a daily agent that missed a whole day",
  isQuiet({ startedAt: new Date(2026, 8, 5, 11, 5).toISOString() }, "Every day, 11am", MONDAY_1PM), true);
ok("a daily agent that ran this morning is fine",
  isQuiet({ startedAt: new Date(2026, 8, 7, 11, 5).toISOString() }, "Every day, 11am", MONDAY_1PM), false);

console.log("\n  THE GRACE PERIOD\n");
// 9:20am Monday: the 9am slot passed twenty minutes ago and she may be running
// right now. Flagging that is how a panel earns a reputation for lying.
const MONDAY_920 = new Date(2026, 8, 7, 9, 20);
ok("twenty minutes past the slot is not yet quiet",
  isQuiet(FRIDAY_RUN, "Mondays and Fridays, 9am", MONDAY_920), false);
ok("four hours past it is", isQuiet(FRIDAY_RUN, "Mondays and Fridays, 9am", new Date(2026, 8, 7, 13, 5)), true);

console.log("\n  TWICE-DAILY AGENTS\n");
const SIREN = "Twice a day, 11:15am and 7:15pm";
// Siren's evening slot is the one that binds after 7:15pm.
ok("evening slot is the last due at 10pm",
  fmt(lastDueRun(SIREN, new Date(2026, 8, 6, 22, 0))), "Sun 19:15");
ok("morning slot is the last due at 1pm",
  fmt(lastDueRun(SIREN, new Date(2026, 8, 6, 13, 0))), "Sun 11:15");
// Before the day's first slot, yesterday's evening run is the last one due.
ok("before the first slot it is yesterday evening",
  fmt(lastDueRun(SIREN, new Date(2026, 8, 6, 8, 0))), "Sat 19:15");
ok("ran at 11:20, not quiet at 1pm",
  isQuiet({ startedAt: new Date(2026, 8, 6, 11, 20).toISOString() }, SIREN, new Date(2026, 8, 6, 15, 0)), false);
ok("ran at 11:20, quiet by 11pm — the 7:15 slot was missed",
  isQuiet({ startedAt: new Date(2026, 8, 6, 11, 20).toISOString() }, SIREN, new Date(2026, 8, 6, 23, 0)), true);

console.log("\n  A WIDENED SCHEDULE DOES NOT ACCUSE ANYONE RETROACTIVELY\n");
// Saturday and Sunday were added to Joy on Sunday evening. Her 9am Sunday slot
// did not exist at 9am that morning, so it cannot be a missed run — otherwise
// fixing false alarms generates a fresh crop of them.
const CHANGED = new Date(2026, 8, 6, 20, 30);
const SUNDAY_9PM = new Date(2026, 8, 6, 21, 0);
ok("without the stamp, this morning counts as missed",
  isQuiet(FRIDAY_RUN, WEEKEND, SUNDAY_9PM), true);
ok("with it, the slot predates the schedule and does not",
  isQuiet(FRIDAY_RUN, WEEKEND, SUNDAY_9PM, undefined, CHANGED), false);
// It must not become a permanent excuse: the next real slot still counts.
ok("Monday's run is still owed",
  isQuiet(FRIDAY_RUN, WEEKEND, new Date(2026, 8, 7, 13, 0), undefined, CHANGED), true);
ok("a stamp in the far past changes nothing",
  isQuiet(FRIDAY_RUN, WEEKEND, new Date(2026, 8, 7, 13, 0), undefined, new Date(2020, 0, 1)), true);
ok("an unparseable stamp is ignored rather than excusing everything",
  isQuiet(FRIDAY_RUN, WEEKEND, new Date(2026, 8, 7, 13, 0), undefined, "not a date"), true);


console.log("\n  IT REFUSES TO GUESS\n");
// "Never reported" is its own line on the dashboard; saying it twice under two
// headings helps nobody.
ok("no run at all is not 'quiet'", isQuiet(null, "Every day, 11am", SUNDAY_6PM), false);
ok("an unreadable schedule judges nothing",
  isQuiet(FRIDAY_RUN, "whenever he asks", SUNDAY_6PM), false);
ok("and has no last-due", lastDueRun("whenever he asks", SUNDAY_6PM), null);
ok("a monthly cadence with no weekday is not guessed at",
  lastDueRun("Once a month", SUNDAY_6PM), null);

console.log("\n  THE OLD LOGIC, FOR THE RECORD\n");
// Proof the substring bug was real: "Mondays" contains "day".
ok("'Mondays and Fridays, 9am' matches /day/i", /day/i.test("Mondays and Fridays, 9am"), true);
ok("so the weekly branch below it was unreachable",
  /day/i.test("Mondays, 10:30am"), true);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
