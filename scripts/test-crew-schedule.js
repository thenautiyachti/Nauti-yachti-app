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
