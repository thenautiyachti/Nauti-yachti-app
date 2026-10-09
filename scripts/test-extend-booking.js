// "Add time" (lib/extendBooking.js): the difference is priced on the website's
// own table, platform bookings are refused, and the text is right.
//
//   node scripts/test-extend-booking.js
const path = require("path");
const X = require(path.join(__dirname, "..", "lib", "extendBooking.js"));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log("  FAIL " + n); } };

// The real Bachelor / Bachelorette table for the Explorer (catalogue, 7 Oct 2026).
const pkg = {
  id: "bachelor", name: "Bachelor / Bachelorette", pricingType: "hourly-by-vessel",
  hourlyByVessel: { explorer: {
    weekday: { 1: 200, 2: 400, 3: 570, 4: 760, 5: 900, 6: 1080, 7: 1225, 8: 1400 },
    weekend: { 1: 220, 2: 440, 3: 625, 4: 830, 5: 1000, 6: 1200, 7: 1350, 8: 1540 },
  } },
};

const erika = X.extensionQuote(pkg, { vesselId: "explorer", date: "2026-10-09", hours: 2, extraHours: 1, platform: "Website" });
ok("Erika's Friday extra hour is $170", erika.amount === 170 && erika.before === 400 && erika.after === 570);
const sat = X.extensionQuote(pkg, { vesselId: "explorer", date: "2026-10-10", hours: 2, extraHours: 2, platform: "Direct" });
ok("Saturday uses the weekend table: 4 h $830 less 2 h $440 = $390", sat.amount === 390);
ok("Boatsetter is extended on Boatsetter", /Boatsetter/.test(X.extensionQuote(pkg, { vesselId: "explorer", date: "2026-10-09", hours: 2, extraHours: 1, platform: "Boatsetter" }).error || ""));
ok("GetMyBoat is extended on GetMyBoat", !!X.extensionQuote(pkg, { vesselId: "explorer", date: "2026-10-09", hours: 2, extraHours: 1, platform: "GetMyBoat" }).error);
ok("no more than 8 hours", !!X.extensionQuote(pkg, { vesselId: "explorer", date: "2026-10-09", hours: 7, extraHours: 2 }).error);
ok("whole hours only", !!X.extensionQuote(pkg, { vesselId: "explorer", date: "2026-10-09", hours: 2, extraHours: 0.5 }).error);
ok("unknown boat is refused, never free", !!X.extensionQuote(pkg, { vesselId: "nope", date: "2026-10-09", hours: 2, extraHours: 1 }).error);
ok("non-hourly package is priced by hand", !!X.extensionQuote({ pricingType: "per-guest", name: "Glow" }, { vesselId: "explorer", date: "2026-10-09", hours: 2, extraHours: 1 }).error);
ok("no length on record is refused", !!X.extensionQuote(pkg, { vesselId: "explorer", date: "2026-10-09", hours: null, extraHours: 1 }).error);

ok("1pm + 3 h ends at 4pm", X.endLabel("13:00", 3) === "4pm");
ok("10:30 + 2 h ends at 12:30pm", X.endLabel("10:30", 2) === "12:30pm");
ok("no start time, no end", X.endLabel(null, 3) === null);

const t = X.extensionText({ guestName: "Erika Lopez", extra: 1, amount: 170, end: "4pm", url: "https://www.thenautiyachti.com/pay/abc" });
ok("text: first name, price, end time, /pay link", t.includes("Hi Erika,") && t.includes("$170") && t.includes("4pm") && t.includes("/pay/abc"));
ok("text never carries a raw Stripe link", !/checkout\.stripe\.com/.test(t));

// ONE RESERVATION (lib/extensionRef.js, lib/extensionPayment.js): the charge is
// numbered under its parent and, once paid, folded into it.
const R = require(path.join(__dirname, "..", "lib", "extensionRef.js"));
ok("first extension of NY-20261009-01 is -X1", R.extensionRef("NY-20261009-01", 1) === "NY-20261009-01-X1");
ok("an extension knows its parent", R.parentRefOf("NY-20261009-01-X2") === "NY-20261009-01");
ok("an ordinary booking is not an extension", !R.isExtensionRef("NY-20261009-01") && !R.isExtensionRef(null));
ok("a parent with no number uses its row id", R.parentRefOf("cmuoc2apc0000x2prge863lhv-X1") === "cmuoc2apc0000x2prge863lhv");

const { foldedParent } = require(path.join(__dirname, "..", "lib", "extensionPayment.js"));
const parent = { hours: 2, priceQuoted: 460, pricePaid: 460, note: "Booked by text." };
const ext = { bookingId: "NY-20261009-01-X1", hours: 2, priceQuoted: 360 };
const f = foldedParent(parent, ext, { paid: 360, today: "2026-10-09" });
ok("paid extension: 2 + 2 = 4 hours on the parent", f.hours === 4);
ok("paid extension: $460 + $360 = $820 paid and quoted", f.pricePaid === 820 && f.priceQuoted === 820);
ok("the parent's note records the payment", f.note.startsWith("Booked by text.\n") && f.note.includes("NY-20261009-01-X1 paid"));
ok("a webhook retry changes nothing", foldedParent({ ...parent, ...f }, ext, { paid: 360, today: "2026-10-09" }) === null);
ok("what Stripe charged wins over the quote", foldedParent(parent, ext, { paid: 300, today: "x" }).pricePaid === 760);

const { occupyingRows } = require(path.join(__dirname, "..", "lib", "occupancy.js"));
const diary = [{ id: "p", bookingId: "NY-20261009-01", vesselId: "explorer", date: "2026-10-09", hours: 4, status: "booked" }];
const charge = { id: "c", bookingId: "NY-20261009-01-X1", vesselId: "explorer", date: "2026-10-09", hours: 2, status: "booked" };
ok("the boat is not counted twice for the extra hours", occupyingRows(diary, [charge]).length === 1);

const { tripsSharingPhone } = require(path.join(__dirname, "..", "lib", "guestTrips.js"));
const trips = tripsSharingPhone([], [{ ...charge, phone: "9365550100" }], "9365550100");
ok("an extension is not a trip of its own", trips.length === 0);

const { feedEvents } = require(path.join(__dirname, "..", "lib", "calendarFeed.js"));
const ev = feedEvents({ externalBookings: [], inquiries: [{ ...charge, name: "Erika" }], today: "2026-10-01" });
ok("an extension is not a calendar event of its own", ev.length === 0);

console.log(`  extend booking: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
