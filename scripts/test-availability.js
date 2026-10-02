// Can two guests take the same boat? The server's answer, pinned.
//
// Owner, 1 Oct 2026: "We need to check for availability when a guest books or
// pays." lib/availability.js is the rule; these are the cases it must get
// right in both directions — refusing a taken boat, and NOT refusing a free one
// (a check that turns away honest bookings costs charters).
const { slotProblem, seatProblem, HOLD_MINUTES } = require("../lib/availability");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(62) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "  want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}
const reason = (p) => (p ? p.reason : null);

const DAY = "2027-06-12";
const ask = (extra) => ({ vesselId: "explorer", vesselName: "Nauti Explorer", date: DAY, hours: 4, ...extra });
const booked = (hours, extra) => ({ id: "b" + Math.random(), vesselId: "explorer", date: DAY, hours, ...extra });

console.log("\n  A BOAT'S DAY\n");
ok("an empty day is free", reason(slotProblem(ask())), null);
ok("a blocked day is refused", reason(slotProblem(ask({ blockedDates: [DAY] }))), "blocked");
ok("a day already holding 8 hours is full", reason(slotProblem(ask({ occupying: [booked(8)] }))), "full");
ok("4 booked + 4 asked fits exactly", reason(slotProblem(ask({ occupying: [booked(4)] }))), null);
ok("5 booked + 4 asked does not fit", reason(slotProblem(ask({ occupying: [booked(5)] }))), "not-enough-hours");
ok("  and says how many hours are left", slotProblem(ask({ occupying: [booked(5)] })).hoursLeft, 3);
ok("another boat's booking is not this boat's",
  reason(slotProblem(ask({ occupying: [booked(8, { vesselId: "yachti" })] }))), null);
ok("another day's booking is not this day's",
  reason(slotProblem(ask({ occupying: [booked(8, { date: "2027-06-13" })] }))), null);
ok("a booking with no hours counts as none, as on the calendar",
  reason(slotProblem(ask({ occupying: [booked(null)] }))), null);
ok("no hours asked: only a blocked or full day refuses",
  reason(slotProblem(ask({ hours: null, occupying: [booked(7)] }))), null);

console.log("\n  HOLDS AND THE BOOKING ITSELF\n");
ok("an open checkout holds its hours",
  reason(slotProblem(ask({ holds: [booked(6)] }))), "not-enough-hours");
ok("a booking never conflicts with itself (re-check at payment)",
  reason(slotProblem(ask({ occupying: [booked(6, { id: "me" })], exclude: { ids: ["me"] } }))), null);
ok("  nor with its own twin under the same booking number",
  reason(slotProblem(ask({ occupying: [booked(6, { bookingId: "NY-1" })], exclude: { bookingId: "NY-1" } }))), null);
ok("a held checkout that was then paid counts once, not twice",
  reason(slotProblem(ask({ occupying: [booked(4, { bookingId: "NY-2" })], holds: [booked(4, { bookingId: "NY-2" })] }))), null);
ok("two real charters in one day both count",
  reason(slotProblem(ask({ occupying: [booked(3, { bookingId: "A" }), booked(3, { bookingId: "B" })] }))), "not-enough-hours");
ok("holds last longer than a Stripe checkout session (30 min)", HOLD_MINUTES > 30, true);

console.log("\n  SEATS ON A SEAT-SALE NIGHT\n");
const seats = (available) => ({ capacity: 31, confirmed: 31 - available, tentative: 0, available });
ok("room for the party", reason(seatProblem({ seats: seats(10), partySize: "4" })), null);
ok("exactly the last seats", reason(seatProblem({ seats: seats(4), partySize: 4 })), null);
ok("one too many", reason(seatProblem({ seats: seats(3), partySize: "4" })), "not-enough-seats");
ok("sold out", reason(seatProblem({ seats: seats(0), partySize: "1" })), "sold-out");
ok("no count means no refusal", reason(seatProblem({ seats: null, partySize: "40" })), null);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
