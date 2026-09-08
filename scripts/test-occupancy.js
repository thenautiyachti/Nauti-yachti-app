// Does the public calendar block the right days, and only those?
//
// Two failures are possible here and they point in opposite directions, which
// is why both are pinned:
//
//   under-blocking - a confirmed booking whose day stays on sale, so it gets
//                    sold twice. This is what the change fixes.
//   over-blocking  - a day taken off sale that was actually free, because a
//                    card booking exists in both tables and its hours got
//                    counted twice. This is what the change could easily
//                    have caused.
const { occupyingRows, inquiryHoldsTheDay } = require("../lib/occupancy");
const { groupExternalBookingState, FULL_DAY_HOURS } = require("../lib/serialize");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(60) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "  want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

console.log("\n  (a full day is " + FULL_DAY_HOURS + " hours)\n");
console.log("  WHICH INQUIRIES OCCUPY A BOAT\n");
ok("a booked inquiry with a date and a vessel does",
  inquiryHoldsTheDay({ status: "booked", date: "2026-09-20", vesselId: "explorer" }), true);
ok("a pending inquiry does not",
  inquiryHoldsTheDay({ status: "pending", date: "2026-09-20", vesselId: "explorer" }), false);
ok("a new inquiry does not",
  inquiryHoldsTheDay({ status: "new", date: "2026-09-20", vesselId: "explorer" }), false);
ok("a lapsed inquiry does not",
  inquiryHoldsTheDay({ status: "lapsed", date: "2026-09-20", vesselId: "explorer" }), false);
ok("a cancelled one does not",
  inquiryHoldsTheDay({ status: "cancelled", date: "2026-09-20", vesselId: "explorer" }), false);
// The status added on 5 Sep 2026. An owed charter has no date to hold.
ok("an OWED charter does not occupy anything",
  inquiryHoldsTheDay({ status: "owed", date: "TBD", vesselId: "explorer" }), false);
ok("a booked inquiry with no date does not",
  inquiryHoldsTheDay({ status: "booked", date: null, vesselId: "explorer" }), false);
ok("a booked inquiry with no vessel does not",
  inquiryHoldsTheDay({ status: "booked", date: "2026-09-20", vesselId: null }), false);

console.log("\n  THE HOLE THIS CLOSES\n");
const textBooking = { id: "i1", bookingId: "NY-20260920-01", status: "booked", date: "2026-09-20", vesselId: "explorer", hours: 4 };
ok("a booking taken by text now occupies its day",
  occupyingRows([], [textBooking]).map((r) => r.date + "|" + r.vesselId), ["2026-09-20|explorer"]);
ok("and the calendar shades it",
  groupExternalBookingState(occupyingRows([], [textBooking])), { explorer: { "2026-09-20": "partial" } });
ok("an 8-hour text booking reads as a full day",
  groupExternalBookingState(occupyingRows([], [{ ...textBooking, hours: 8 }])),
  { explorer: { "2026-09-20": "full" } });

console.log("\n  THE TRAP IT MUST NOT FALL INTO\n");
// Oscar: paid by card, so he exists in BOTH tables under one booking id.
const oscarDiary   = { id: "e1", bookingId: "NY-20260906-01", status: "booked", date: "2026-09-06", vesselId: "explorer", hours: 4 };
const oscarInquiry = { id: "i2", bookingId: "NY-20260906-01", status: "booked", date: "2026-09-06", vesselId: "explorer", hours: 4 };
const merged = occupyingRows([oscarDiary], [oscarInquiry]);
ok("the same charter is counted once, not twice", merged.length, 1);
ok("and the diary row is the one kept", merged[0].id, "e1");
ok("so a 4-hour charter does not read as a full day",
  groupExternalBookingState(merged), { explorer: { "2026-09-06": "partial" } });

console.log("\n  WHAT MUST STILL BE COUNTED TWICE\n");
// Two genuine charters on one boat in one day. Deduping by date+vessel would
// merge these and undercount the day, overselling the boat.
const morning = { id: "e2", bookingId: "NY-20260912-01", status: "booked", date: "2026-09-12", vesselId: "explorer", hours: 4 };
const evening = { id: "e3", bookingId: "NY-20260912-02", status: "booked", date: "2026-09-12", vesselId: "explorer", hours: 4 };
ok("a morning and an evening trip are two bookings",
  occupyingRows([morning, evening], []).length, 2);
ok("and together they fill the day",
  groupExternalBookingState(occupyingRows([morning, evening], [])),
  { explorer: { "2026-09-12": "full" } });
// A twin with no booking id cannot be recognised as a twin. Website bookings
// always get one, so this documents the limit rather than excusing it.
const noId = { id: "i3", bookingId: null, status: "booked", date: "2026-09-12", vesselId: "yachti", hours: 3 };
ok("an inquiry with no booking id is still counted",
  occupyingRows([], [noId]).length, 1);

console.log("\n  A CHARTER ON SOMEBODY ELSE'S BOAT OCCUPIES NONE OF OURS\n");
// Wake Surfing Lessons is a coaching session run on a partner's boat, which is
// why its vessel list is empty. The booking form seeds vesselId with the first
// vessel and hid the picker rather than clearing it, so the booking was filed
// against the Nauti Explorer — and a booked inquiry with a date and a vesselId
// occupies that boat. Every lesson would have taken the Explorer off sale for a
// day it was never needed.
const wakesurf = { id: "i9", bookingId: "NY-20261003-01", status: "booked", date: "2026-10-03", vesselId: null, hours: 3 };
ok("a booked lesson with no vessel occupies nothing",
  occupyingRows([], [wakesurf]), []);
ok("and the calendar stays clear that day",
  groupExternalBookingState(occupyingRows([], [wakesurf])), {});
// The bug, preserved so the fix cannot be quietly undone: the SAME booking with
// a vesselId does take the boat off sale, which is correct behaviour for a real
// charter and exactly why the id must be null for one that is not.
ok("but with a vesselId it WOULD block the Explorer — hence the null",
  groupExternalBookingState(occupyingRows([], [{ ...wakesurf, vesselId: "explorer" }])),
  { explorer: { "2026-10-03": "partial" } });

console.log("\n  INQUIRIES STILL OCCUPY NOTHING\n");
const noise = [
  { id: "i4", status: "pending", date: "2026-09-21", vesselId: "explorer", hours: 4 },
  { id: "i5", status: "lapsed", date: "2026-09-22", vesselId: "explorer", hours: 4 },
  { id: "i6", status: "cancelled", date: "2026-09-23", vesselId: "explorer", hours: 4 },
];
ok("33 inquiries do not become 33 booked days", occupyingRows([], noise), []);
ok("a cancelled DIARY row occupies nothing either",
  occupyingRows([{ id: "e4", status: "cancelled", date: "2026-09-24", vesselId: "explorer", hours: 4 }], []), []);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
