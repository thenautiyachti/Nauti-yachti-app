// The add-on rules, asserted.
//
//   node scripts/test-addons.js
//
// These are the owner's own pricing rules, and they decide what a guest is
// charged. Two of them were wrong in ways that only showed up when somebody sat
// down and worked an example: the decoration bundle was billing $125 for a $60
// package, and an add-on called "Complimentary Champagne" cost $25.
//
// Lives in scripts/ rather than a scratchpad because it is the only thing that
// will notice when a future edit quietly changes what somebody pays.
const path = require("path");
const {
  addOnTotal, isIncluded, includedIds, chargeableIds, coveredIds, isCovered,
  addOnLabel, DEFAULT_PACKAGE_ID, INCLUDED_WITH, CONTAINS,
} = require(path.join(__dirname, "..", "lib", "addOns"));

// The real rows, as priced in the database.
const ADDONS = [
  { id: "balloon-package", price: 40, active: true },
  { id: "champagne-bottle", price: 25, active: true },
  { id: "decoration-package", price: 60, active: true },
  { id: "dinner-grill", price: 25, active: true },
];
const ALL = ADDONS.map((a) => a.id);
const PACKAGES = ["tubing", "birthday", "bachelor", "night", "partycove", "glowz", "corporate", "wakesurf"];

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log("   " + (ok ? "ok  " : "FAIL") + "  " + label.padEnd(54) +
    (ok ? String(got) : "got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want)));
};

console.log("\n  THE DEFAULT PACKAGE");
is("no occasion stated -> tubing", DEFAULT_PACKAGE_ID, "tubing");

console.log("\n  WHAT COMES FREE WITH WHAT");
is("birthday -> balloons", includedIds("birthday"), ["balloon-package"]);
is("bachelor -> champagne", includedIds("bachelor"), ["champagne-bottle"]);
is("night cruise -> the grill", includedIds("night"), ["dinner-grill"]);
for (const p of ["tubing", "partycove", "glowz", "corporate", "wakesurf"]) {
  is(p + " -> nothing", includedIds(p), []);
}

console.log("\n  THE DECORATION PACKAGE CONTAINS THE OTHER TWO");
// $40 + $25 = $65 bought separately, $60 as the bundle. Before this rule
// existed, ticking all three billed $125 for a $60 package.
is("it covers balloons and champagne",
  CONTAINS["decoration-package"], ["balloon-package", "champagne-bottle"]);
is("bundle alone = 60", addOnTotal(ADDONS, "tubing", ["decoration-package"]), 60);
is("bundle + balloons = 60, not 100",
  addOnTotal(ADDONS, "tubing", ["decoration-package", "balloon-package"]), 60);
is("bundle + champagne = 60, not 85",
  addOnTotal(ADDONS, "tubing", ["decoration-package", "champagne-bottle"]), 60);
is("bundle + both = 60, not 125",
  addOnTotal(ADDONS, "tubing", ["decoration-package", "balloon-package", "champagne-bottle"]), 60);
is("buying the two separately still costs 65",
  addOnTotal(ADDONS, "tubing", ["balloon-package", "champagne-bottle"]), 65);
is("so the bundle saves exactly $5",
  addOnTotal(ADDONS, "tubing", ["balloon-package", "champagne-bottle"]) -
  addOnTotal(ADDONS, "tubing", ["decoration-package"]), 5);
is("covered ids reported", coveredIds(["decoration-package"]),
  ["balloon-package", "champagne-bottle"]);
is("nothing covered without the bundle", coveredIds(["balloon-package"]), []);

console.log("\n  EVERYTHING TICKED, PER PACKAGE");
// decoration 60 + grill 25 = 85 wherever nothing is included.
is("tubing: 85", addOnTotal(ADDONS, "tubing", ALL), 85);
is("partycove: 85", addOnTotal(ADDONS, "partycove", ALL), 85);
is("corporate: 85", addOnTotal(ADDONS, "corporate", ALL), 85);
is("wakesurf: 85", addOnTotal(ADDONS, "wakesurf", ALL), 85);
is("glowz: 85", addOnTotal(ADDONS, "glowz", ALL), 85);
is("birthday: 85 (balloons already free, bundle still 60)",
  addOnTotal(ADDONS, "birthday", ALL), 85);
is("bachelor: 85 (champagne already free)", addOnTotal(ADDONS, "bachelor", ALL), 85);
is("night: 60 (grill free, bundle 60)", addOnTotal(ADDONS, "night", ALL), 60);

console.log("\n  THE GRILL IS SELLABLE ON EVERY CHARTER");
// It needs the boat at anchor, but they anchor off mid-trip — so that is a
// note about timing, never a reason to withhold it from a package.
for (const p of PACKAGES.filter((p) => p !== "night")) {
  is(p + ": grill costs $25", addOnTotal(ADDONS, p, ["dinner-grill"]), 25);
}

console.log("\n  LABELS THE GUEST SEES");
is("free reads Included", addOnLabel(ADDONS[0], "birthday", []), "Included");
is("otherwise the price", addOnLabel(ADDONS[0], "tubing", []), "$40");
is("covered by the bundle says so",
  addOnLabel(ADDONS[0], "tubing", ["decoration-package"]), "In the decoration package");
is("included beats covered",
  addOnLabel(ADDONS[0], "birthday", ["decoration-package"]), "Included");

console.log("\n  EDGE CASES");
is("nothing selected = 0", addOnTotal(ADDONS, "tubing", []), 0);
is("null selection safe", addOnTotal(ADDONS, "tubing", null), 0);
is("unknown add-on ignored", addOnTotal(ADDONS, "tubing", ["nonsense"]), 0);
is("unknown package charges list price", addOnTotal(ADDONS, "no-such-package", ALL), 85);
is("inactive not charged", addOnTotal([{ id: "x", price: 99, active: false }], "tubing", ["x"]), 0);
is("archived not charged",
  addOnTotal([{ id: "y", price: 99, active: true, archived: true }], "tubing", ["y"]), 0);
is("included never billable", chargeableIds("birthday", ["balloon-package"]), []);
is("covered never billable", chargeableIds("tubing", ["decoration-package", "balloon-package"]),
  ["decoration-package"]);
is("isCovered agrees", isCovered(["decoration-package"], "champagne-bottle"), true);

console.log("\n  NO PACKAGE INCLUDES SOMETHING THAT DOES NOT EXIST");
const realIds = new Set(ALL);
for (const [pkg, ids] of Object.entries(INCLUDED_WITH)) {
  is(pkg + " includes only real add-ons", ids.every((i) => realIds.has(i)), true);
}
for (const [outer, inner] of Object.entries(CONTAINS)) {
  is(outer + " contains only real add-ons", inner.every((i) => realIds.has(i)), true);
  is(outer + " does not contain itself", inner.includes(outer), false);
}

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
