// What a guest's trip page says, for each kind of booking.
//
// The rules worth pinning: the meeting point comes from the same place the
// confirmation email reads it (and a glow seat never gets the Pearl Bay dock);
// platform bookings show no amounts, because the platform's numbers are the
// true ones; a balance links to /pay/<id>, never Stripe; photos open on the day;
// the review ask waits until after. No database.
process.env.DOCK_ADDRESS = "1 Test Dock Ct";
delete process.env.DOCK_ADDRESS_YACHTI;
const { tripView, clockOf } = require("../lib/tripInfo");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(62) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "  want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

const NOW = new Date("2026-10-02T15:00:00Z"); // 10am at the lake
const base = {
  ref: "NY-20261010-01", status: "booked", paymentStatus: "paid", platform: "Direct",
  name: "Pat Example", date: "2026-10-10", startTime: "10:00", hours: 4,
  vesselId: "explorer", vesselName: "Nauti Explorer", packageId: "tubing", packageName: "Tubing",
  partySize: 10, priceQuoted: 600, payId: "cuid123",
};
const view = (patch) => tripView({ ...base, ...patch }, { now: NOW });

console.log("\n  when it is");
ok("ten days out is upcoming", view({}).phase, "upcoming");
ok("the day itself, in lake time", view({ date: "2026-10-02" }).phase, "today");
ok("yesterday is past", view({ date: "2026-10-01" }).phase, "past");
ok("completed is past whatever the date", view({ status: "completed" }).phase, "past");
ok("cancelled", view({ status: "cancelled" }).phase, "cancelled");
ok("refunded reads as cancelled", view({ status: "refunded" }).phase, "cancelled");
ok("an inquiry is not confirmed", view({ status: "inquiry" }).phase, "unconfirmed");

console.log("\n  getting there");
const d = view({}).directions;
ok("Explorer gets DOCK_ADDRESS", d.address, "1 Test Dock Ct");
ok("start time", d.startTime, "10:00 AM");
ok("be there 15 minutes before", d.arriveBy, "9:45 AM");
ok("back after the booked hours", d.backAt, "2:00 PM");
ok("Pearl Bay is gated, so the code comes by text", d.gateByText, true);
ok("no address set for the Yachti: none, never the Explorer's", view({ vesselId: "yachti", vesselName: "Nauti Yachti" }).directions.address, null);
const g = view({ packageId: "glowz", packageName: "Boatz & Glowz", startTime: null }).directions;
ok("a glow seat meets at Scott's Ridge", g.meetingPoint, "Scott's Ridge boat ramp, Lake Conroe");
ok("a glow seat is never sent to the dock", g.address, null);
ok("no gate code promised for the ramp", g.gateByText, false);
ok("clock wraps past midnight", clockOf(23 * 60 + 90), "12:30 AM");

console.log("\n  money");
const paid = view({}).money;
ok("paid direct booking shows what was paid", paid.lines.map((l) => l.label + " " + l.value), ["Charter $600.00", "Paid $600.00"]);
ok("logged pricePaid wins over the computed figure", view({ pricePaid: 550 }).money.lines.slice(-1)[0].value, "$550.00");
const owes = view({ paymentStatus: "unpaid", discountAmount: 60, couponCode: "FALL10" }).money;
ok("unpaid: balance after the discount", owes.balance, "$540.00");
ok("unpaid: pay link is /pay/<id>, never Stripe", owes.payPath, "/pay/cuid123");
const bs = view({ platform: "Boatsetter", pricePaid: 420 }).money;
ok("Boatsetter: no amounts at all", bs.lines.length + (bs.balance ? 1 : 0), 0);
ok("Boatsetter: named as who took the money", bs.platform, "Boatsetter");
ok("GetMyBoat, however it is spelled", view({ platform: "GetmyBoat" }).money.platform, "GetMyBoat");
ok("refunded says refunded, offers no pay link", view({ paymentStatus: "refunded" }).money.payPath, null);

console.log("\n  photos and the review");
ok("photo box open before the day (owner, 2 Oct 2026)", view({}).canUpload, true);
ok("photo box open on the day", view({ date: "2026-10-02" }).canUpload, true);
ok("photo box open afterwards", view({ date: "2026-09-20" }).canUpload, true);
ok("no photo box on a cancelled booking", view({ status: "cancelled" }).canUpload, false);
ok("no photo box before a booking is confirmed", view({ status: "inquiry" }).canUpload, false);
ok("no review ask before the trip", view({}).review, null);
ok("review ask afterwards goes to Google", /writereview/.test(view({ date: "2026-09-20" }).review.google), true);

console.log("\n  what to bring");
ok("glow seats get the glow list", Array.isArray(view({ packageId: "glowz", packageName: "Boatz & Glowz" }).bring.list), true);
ok("charters get the FAQ answer", /swimsuit/i.test(view({}).bring.text), true);
ok("the FAQ's generic meeting point is not repeated", view({}).goodToKnow.some((f) => /Where do we meet/.test(f.q)), false);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
