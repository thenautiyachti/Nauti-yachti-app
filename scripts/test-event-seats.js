// Seats on a dated event (the glow night), and whether it is still on sale.
//
// Pins the owner's rule of 1 Oct 2026: confirmed, tentative and available are
// shown separately, tentative seats still count against capacity, and seat
// sales close once the night has passed.
const { countSeats, seatClass, eventSalesOpen, eventBookingRefusal, lakeTodayKey } = require("../lib/eventSeats");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(60) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "  want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

const NIGHT = "2027-05-15";
const VESSELS = [
  { id: "explorer", capacity: 14 },
  { id: "yachti", capacity: 12 },
  { id: "islander", capacity: 8 },
  { id: "rental", capacity: 10 },
];
const FLEET = ["explorer", "yachti", "islander"];
const seats = (bookings, inquiries) =>
  countSeats({ vessels: VESSELS, vesselIds: FLEET, eventDate: NIGHT, bookings, inquiries });

console.log("\n  WHICH STATUSES HOLD WHICH KIND OF SEAT\n");
ok("booked is confirmed", seatClass("booked", "external"), "confirmed");
ok("completed is confirmed", seatClass("completed", "external"), "confirmed");
ok("a platform inquiry is tentative", seatClass("inquiry", "external"), "tentative");
ok("lapsed is tentative (owner's rule)", seatClass("lapsed", "external"), "tentative");
ok("owed is tentative (owner's rule)", seatClass("owed", "external"), "tentative");
ok("a website 'new' inquiry is tentative", seatClass("new", "inquiry"), "tentative");
ok("a lapsed website inquiry is tentative", seatClass("lapsed", "inquiry"), "tentative");
ok("a booked website inquiry is confirmed", seatClass("booked", "inquiry"), "confirmed");
ok("cancelled holds nothing", seatClass("cancelled", "external"), null);
ok("an unknown status is tentative, not free", seatClass("weird", "external"), "tentative");

console.log("\n  THE COUNT\n");
ok("capacity is one less per boat, glow boats only", seats([], []).capacity, 31);
ok("an empty night is all available", seats([], []),
  { capacity: 31, confirmed: 0, tentative: 0, available: 31 });

const mixed = seats(
  [
    { date: NIGHT, status: "booked", partySize: "6", bookingId: "A" },
    { date: NIGHT, status: "completed", partySize: 2, bookingId: "B" },
    { date: NIGHT, status: "inquiry", partySize: "4", bookingId: "C" },
    { date: NIGHT, status: "owed", partySize: "3", bookingId: "D" },
    { date: NIGHT, status: "cancelled", partySize: "9", bookingId: "E" },
    { date: "2027-05-16", status: "booked", partySize: "9", bookingId: "F" },
  ],
  [
    { date: NIGHT, status: "new", partySize: "2", bookingId: "G", packageId: "glowz" },
    { date: NIGHT, status: "lapsed", partySize: "1", bookingId: "H", packageId: "glowz" },
  ]
);
ok("the owner's three numbers", mixed,
  { capacity: 31, confirmed: 8, tentative: 10, available: 13 });

ok("a card booking in both tables counts once",
  seats(
    [{ date: NIGHT, status: "booked", partySize: "2", bookingId: "NY-1" }],
    [{ date: NIGHT, status: "booked", partySize: "2", bookingId: "NY-1", packageId: "glowz" }]
  ).confirmed, 2);
ok("the booking row's status wins over its inquiry twin",
  seats(
    [{ date: NIGHT, status: "cancelled", partySize: "2", bookingId: "NY-2" }],
    [{ date: NIGHT, status: "new", partySize: "2", bookingId: "NY-2", packageId: "glowz" }]
  ), { capacity: 31, confirmed: 0, tentative: 0, available: 31 });
ok("a charter moved to another night takes its twin with it",
  seats(
    [{ date: "2027-06-01", status: "booked", partySize: "4", bookingId: "NY-3" }],
    [{ date: NIGHT, status: "new", partySize: "4", bookingId: "NY-3", packageId: "glowz" }]
  ).tentative, 0);
ok("rows with no booking number are each counted",
  seats([], [
    { date: NIGHT, status: "new", partySize: "2", packageId: "glowz" },
    { date: NIGHT, status: "new", partySize: "2", packageId: "glowz" },
  ]).tentative, 4);
ok("crew-list signups are not seats",
  seats([], [{ date: NIGHT, status: "seen", partySize: "1", packageId: "crewlist" }]).tentative, 0);
ok("never fewer than zero available",
  seats([{ date: NIGHT, status: "booked", partySize: "40" }], []).available, 0);
ok("no capacity means no count, not sold out",
  countSeats({ vessels: VESSELS, vesselIds: [], eventDate: NIGHT }), null);

console.log("\n  ON SALE OR NOT\n");
// 7pm in Conroe on the night is already the next day in UTC.
const nightEvening = new Date("2027-05-16T00:30:00Z");
const dayAfter = new Date("2027-05-16T15:00:00Z");
ok("lake date at 7:30pm CDT is still the night", lakeTodayKey(nightEvening), NIGHT);
ok("on sale through the night itself", eventSalesOpen({ eventDate: NIGHT }, nightEvening), true);
ok("closed the day after", eventSalesOpen({ eventDate: NIGHT }, dayAfter), false);
ok("a charter package with no event date is unaffected", eventSalesOpen({ eventDate: null }, dayAfter), true);
ok("checkout refuses a closed night",
  !!(eventBookingRefusal({ eventDate: NIGHT }, NIGHT, dayAfter) || {}).salesClosed, true);
ok("checkout refuses a date that is not the night's",
  !!(eventBookingRefusal({ eventDate: NIGHT }, "2027-05-20", nightEvening) || {}).wrongDate, true);
ok("checkout takes the night's own date while open",
  eventBookingRefusal({ eventDate: NIGHT }, NIGHT, nightEvening), null);
ok("checkout ignores packages that are not dated events",
  eventBookingRefusal({ eventDate: null }, "2027-05-20", dayAfter), null);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
