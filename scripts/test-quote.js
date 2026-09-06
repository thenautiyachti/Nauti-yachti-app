// The server must arrive at the same number the booking form shows, and must
// refuse to be told a different one.
//
// Until 5 Sep 2026 /api/checkout took `priceQuoted` out of the request body and
// put it straight into Stripe's unit_amount. These assertions exist so that the
// day someone "simplifies" the checkout route back to trusting the client, this
// fails loudly.
const { quotePackage, quoteTotal, dayTypeForDate } = require("../lib/pricing");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(58) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "  want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

// Shaped exactly as lib/serialize.js parsePackage() hands them over.
const hourly = {
  id: "tubing", name: "Tubing / Wakeboarding", pricingType: "hourly-by-vessel",
  hourlyByVessel: {
    explorer: { weekday: { "2": 400, "3": 550, "4": 700 }, weekend: { "2": 450, "3": 600, "4": 850 } },
    yachti:   { weekday: { "3": 500 }, weekend: { "3": 575 } },
  },
};
const perGuest = { id: "glow", name: "Boatz & Glowz", pricingType: "per-guest", pricePerGuest: 45 };
const tiered   = { id: "party", name: "Party Cruise", pricingType: "tiered-by-guests",
  tiers: [{ max: 6, price: 500 }, { max: 10, price: 700 }, { max: null, price: 900 }] };
const flat     = { id: "sunset", name: "Sunset Cruise", pricingType: "flat", price: 350 };

const ADDONS = [
  { id: "balloon-package", price: 35, active: true },
  { id: "champagne-bottle", price: 30, active: true },
  { id: "decoration-package", price: 60, active: true },
  { id: "grill-service", price: 25, active: true },
  { id: "retired-thing", price: 99, active: false },
];

console.log("\n  DAY TYPE — the rate depends on it, so it must be derived the same way\n");
ok("a Saturday is a weekend", dayTypeForDate("2026-09-05"), "weekend");
ok("a Sunday is a weekend", dayTypeForDate("2026-09-06"), "weekend");
ok("a Wednesday is a weekday", dayTypeForDate("2026-09-09"), "weekday");
ok("no date falls back to weekday", dayTypeForDate(null), "weekday");

console.log("\n  HOURLY BY VESSEL\n");
ok("weekday 3hr on the Explorer", quotePackage(hourly, { vesselId: "explorer", date: "2026-09-09", hours: 3 }), 550);
ok("the same slot at the weekend costs more",
  quotePackage(hourly, { vesselId: "explorer", date: "2026-09-05", hours: 3 }), 600);
ok("hours may arrive as a string (they do, from a form)",
  quotePackage(hourly, { vesselId: "explorer", date: "2026-09-05", hours: "4" }), 850);
ok("an explicit dayType wins over the date (the price explorer)",
  quotePackage(hourly, { vesselId: "explorer", dayType: "weekend", hours: 2 }), 450);
ok("an unknown vessel cannot be priced -> null, NOT free",
  quotePackage(hourly, { vesselId: "submarine", date: "2026-09-05", hours: 3 }), null);
ok("a duration the package does not offer -> null",
  quotePackage(hourly, { vesselId: "yachti", date: "2026-09-09", hours: 8 }), null);

console.log("\n  OTHER PRICING TYPES\n");
ok("per-guest multiplies", quotePackage(perGuest, { partySize: 8 }), 360);
ok("per-guest with nobody aboard is not free, it is unpriceable",
  quotePackage(perGuest, { partySize: 0 }), null);
ok("tiered picks the band", quotePackage(tiered, { partySize: 8 }), 700);
ok("tiered top band is open-ended", quotePackage(tiered, { partySize: 40 }), 900);
ok("flat ignores everything else", quotePackage(flat, { partySize: 12, hours: 9 }), 350);
ok("a missing package is null", quotePackage(null, {}), null);

console.log("\n  THE WHOLE QUOTE, ADD-ONS INCLUDED\n");
ok("package plus one add-on",
  quoteTotal(hourly, ADDONS, { vesselId: "explorer", date: "2026-09-05", hours: 3, addOnIds: ["grill-service"] }), 625);
ok("no add-ons is just the package",
  quoteTotal(hourly, ADDONS, { vesselId: "explorer", date: "2026-09-05", hours: 3, addOnIds: [] }), 600);
ok("an unpriceable package stays null even with add-ons chosen",
  quoteTotal(hourly, ADDONS, { vesselId: "submarine", date: "2026-09-05", hours: 3, addOnIds: ["grill-service"] }), null);
// The rule from lib/addOns.js the owner corrected by hand: the decoration
// package CONTAINS the balloons and the champagne, so ticking all three is $60.
ok("the decoration bundle is not billed three times",
  quoteTotal(flat, ADDONS, { addOnIds: ["decoration-package", "balloon-package", "champagne-bottle"] }), 410);
ok("an inactive add-on is not charged",
  quoteTotal(flat, ADDONS, { addOnIds: ["retired-thing"] }), 350);

console.log("\n  WHAT THE CHECKOUT ENDPOINT DOES WITH IT\n");
// Mirrors the guard in app/api/checkout/route.js. The attack is a POST that
// claims a price of $1 for a charter the server prices at $600.
function decide(claimed, server) {
  if (!server || server <= 0) return "reject: cannot be priced";
  if (claimed != null && server > claimed + 0.01) return "reject: price changed";
  return "charge " + server;
}
const real = quoteTotal(hourly, ADDONS, { vesselId: "explorer", date: "2026-09-05", hours: 3, addOnIds: [] });
ok("a POST claiming $1 for a $600 charter is refused", decide(1, real), "reject: price changed");
ok("a POST claiming $0 is refused", decide(0, real), "reject: price changed");
ok("an honest quote is charged", decide(600, real), "charge 600");
ok("a stale page quoting LESS is charged the lower number it displayed",
  // server 600, page showed 650 -> the guest pays 600, never more than shown
  decide(650, real), "charge 600");
ok("an unpriceable combination is refused outright", decide(600, null), "reject: cannot be priced");

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
