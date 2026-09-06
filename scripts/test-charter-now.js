// What the helm is told about the charter it is on. A wrong "back by" here is
// either unpaid hours or a refund argument at the dock.
const { parseTimeOfDay, charterWindow, charterNow, minutesLeft, humanLeft, addOnsFor } =
  require("../lib/charterNow");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(56) +
    (good ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

console.log("\n  START TIMES, HOWEVER THEY WERE TYPED\n");
ok("24-hour", parseTimeOfDay("11:00"), { hour: 11, minute: 0 });
ok("with am", parseTimeOfDay("11:00 AM"), { hour: 11, minute: 0 });
ok("bare hour with suffix", parseTimeOfDay("11am"), { hour: 11, minute: 0 });
ok("afternoon", parseTimeOfDay("1:30 pm"), { hour: 13, minute: 30 });
ok("13:30 means the same thing", parseTimeOfDay("13:30"), { hour: 13, minute: 30 });
ok("noon", parseTimeOfDay("12:00 pm"), { hour: 12, minute: 0 });
ok("midnight is hour zero, not twelve", parseTimeOfDay("12:00 am"), { hour: 0, minute: 0 });
ok("empty is null", parseTimeOfDay(""), null);
ok("nonsense is null", parseTimeOfDay("whenever"), null);
ok("an impossible hour is null", parseTimeOfDay("29:00"), null);

console.log("\n  THE WINDOW A CHARTER OCCUPIES\n");
// Oscar's real charter: 6 Sep 2026, 11:00, four hours.
const oscar = { bookingId: "NY-20260906-01", date: "2026-09-06", startTime: "11:00", hours: 4, status: "booked" };
const w = charterWindow(oscar);
ok("starts at 11", new Date(w.startMs).getHours(), 11);
ok("ends at 3", new Date(w.endMs).getHours(), 15);
ok("carries the hours", w.hours, 4);
// Guessing a start time invents a deadline nobody agreed to.
ok("no start time means no window", charterWindow({ date: "2026-09-06", hours: 4 }), null);
ok("no date means no window", charterWindow({ startTime: "11:00", hours: 4 }), null);
ok("no hours still places the start", charterWindow({ date: "2026-09-06", startTime: "11:00" }).endMs, null);

console.log("\n  WHICH CHARTER IS ON THE WATER\n");
const noon = new Date(2026, 8, 6, 12, 0).getTime();
const nine = new Date(2026, 8, 6, 9, 0).getTime();
const late = new Date(2026, 8, 6, 22, 0).getTime();

ok("midway through, it is running", charterNow([oscar], noon).running.booking.bookingId, "NY-20260906-01");
ok("and nothing is queued behind it", charterNow([oscar], noon).next, null);
ok("before it starts, it is next", charterNow([oscar], nine).next.booking.bookingId, "NY-20260906-01");
ok("and nothing is running yet", charterNow([oscar], nine).running, null);
ok("long after, neither", charterNow([oscar], late).running, null);

// The card has to survive the tie-up: hours and fuel get logged after the
// guests step off, and a screen that has already gone blank is no use then.
const justAfter = new Date(2026, 8, 6, 15, 20).getTime();
ok("still showing 20 minutes after the end", charterNow([oscar], justAfter).running != null, true);
const wellAfter = new Date(2026, 8, 6, 16, 30).getTime();
ok("gone once the grace period passes", charterNow([oscar], wellAfter).running, null);

console.log("\n  CANCELLED CHARTERS ARE NOT ON THE WATER\n");
ok("a cancelled booking never runs",
  charterNow([{ ...oscar, status: "cancelled" }], noon).running, null);
ok("nor does an enquiry", charterNow([{ ...oscar, status: "inquiry" }], noon).running, null);
ok("nor an owed one — it has no date to be on", charterNow([{ ...oscar, status: "owed" }], noon).running, null);
ok("completed still counts, so the card survives the tie-up",
  charterNow([{ ...oscar, status: "completed" }], noon).running != null, true);

console.log("\n  TWO BOATS OUT AT ONCE\n");
const second = { bookingId: "NY-20260906-02", date: "2026-09-06", startTime: "11:30", hours: 3, status: "booked" };
ok("the one that started most recently is the one you are on",
  charterNow([oscar, second], noon).running.booking.bookingId, "NY-20260906-02");
ok("order in the array does not decide it",
  charterNow([second, oscar], noon).running.booking.bookingId, "NY-20260906-02");
const evening = { bookingId: "NY-20260906-03", date: "2026-09-06", startTime: "18:00", hours: 3, status: "booked" };
ok("the soonest upcoming is next", charterNow([evening, oscar], nine).next.booking.bookingId, "NY-20260906-01");

console.log("\n  HOW LONG IS LEFT\n");
ok("three hours in, one to go", minutesLeft(w, new Date(2026, 8, 6, 14, 0).getTime()), 60);
ok("running over reads negative", minutesLeft(w, new Date(2026, 8, 6, 15, 20).getTime()), -20);
ok("no end time is null, not zero", minutesLeft({ startMs: 0, endMs: null }), null);
ok("an hour and twenty", humanLeft(80), "1h 20m");
ok("under an hour drops the hours", humanLeft(35), "35m");
ok("over is labelled as over", humanLeft(-20), "20m over");
ok("exactly on time", humanLeft(0), "0m");
ok("nothing to say", humanLeft(null), null);

console.log("\n  WHAT THEY PAID FOR\n");
const ADDONS = [{ id: "a1", name: "Balloons" }, { id: "a2", name: "Champagne" }, { id: "a3", name: "Tubing" }];
const INQ = [{ bookingId: "NY-20260906-01", addOnIds: '["a1","a3"]' }];
ok("joined through bookingId", addOnsFor(oscar, INQ, ADDONS).map((a) => a.name), ["Balloons", "Tubing"]);
ok("no matching inquiry is empty", addOnsFor({ bookingId: "NY-NOPE" }, INQ, ADDONS), []);
ok("no bookingId is empty", addOnsFor({}, INQ, ADDONS), []);
ok("malformed JSON does not throw",
  addOnsFor(oscar, [{ bookingId: "NY-20260906-01", addOnIds: "{{" }], ADDONS), []);
ok("an id with no matching add-on is dropped, not rendered blank",
  addOnsFor(oscar, [{ bookingId: "NY-20260906-01", addOnIds: '["a1","gone"]' }], ADDONS).length, 1);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
