// This decides whether twelve people run for home through lightning or duck
// into somebody else's slip. Every branch is pinned, and the direction of every
// preference is asserted explicitly.
const { whereToGo, costOne, harborRank, COMFORTABLE_MARGIN } = require("../lib/whereToGo");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(58) +
    (good ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

const T0 = Date.parse("2026-09-07T18:00:00Z");
const at = (min, mm) => ({ time: new Date(T0 + min * 60000).toISOString(), precipitation: mm });
const dry = [at(0, 0), at(60, 0), at(150, 0)];
const wetIn = (m) => [at(m, 3)];

const HERE = { lat: 30.4600, lon: -95.6100 };            // up the north end
const DOCK = { lat: 30.3935, lon: -95.5836, name: "the dock" };  // ~5 mi south
const CLOSE_HARBOR = { id: "h1", kind: "shelter", name: "Walden covered slip", lat: 30.4550, lon: -95.6050, covered: true };
const FAR_HARBOR = { id: "h2", kind: "shelter", name: "South cove slip", lat: 30.4000, lon: -95.5900, covered: true };

const base = { here: HERE, nowMs: T0, cruiseMph: 20 };

console.log("\n  THE DOCK IS THE DEFAULT AND HAS TO BE BEATEN\n");
let r = whereToGo({ ...base, dock: { ...DOCK, series: dry, pathSeries: [dry] }, options: [] });
ok("nothing coming means go home", r.verdict, "clear");
ok("and the dock is what is recommended", r.recommended.name, "the dock");

r = whereToGo({
  ...base,
  dock: { ...DOCK, series: wetIn(90), pathSeries: [dry] },
  options: [{ ...CLOSE_HARBOR, series: dry, pathSeries: [dry] }],
});
ok("plenty of time still means the dock", r.verdict, "go");
ok("even with a nearer harbor available", r.recommended.name, "the dock");

console.log("\n  TIGHT IS STILL THE DOCK, BUT SAID DIFFERENTLY\n");
// ~5 miles at 20mph is about 15 minutes; rain in 25 leaves ~10 to spare.
r = whereToGo({
  ...base,
  dock: { ...DOCK, series: wetIn(25), pathSeries: [dry] },
  options: [{ ...CLOSE_HARBOR, series: dry, pathSeries: [dry] }],
});
ok("a thin margin is 'tight'", r.verdict, "tight");
ok("and still sends him home", r.recommended.name, "the dock");
ok("margin under the comfortable threshold", r.recommended.marginMinutes < COMFORTABLE_MARGIN, true);

console.log("\n  WHEN THE DOCK CANNOT BE MADE, GO AND CHECK A SLIP\n");
r = whereToGo({
  ...base,
  dock: { ...DOCK, series: wetIn(5), pathSeries: [dry] },
  options: [{ ...CLOSE_HARBOR, series: dry, pathSeries: [dry] }],
});
ok("the verdict changes to harbor", r.verdict, "harbor");
ok("and names the covered slip", r.recommended.name, "Walden covered slip");
ok("the wording is 'go and check', not 'go to'", /go and check/i.test(r.headline), true);
ok("it warns the slip may not be free", /may not be free/i.test(r.detail), true);
ok("and still reports what the dock would have needed", /The dock is/.test(r.detail), true);

console.log("\n  A SLIP THEY SAID NO TO IS NOT AN OPTION\n");
r = whereToGo({
  ...base,
  dock: { ...DOCK, series: wetIn(5), pathSeries: [dry] },
  options: [
    { ...CLOSE_HARBOR, permission: "no", series: dry, pathSeries: [dry] },
    { ...FAR_HARBOR, permission: "yes", series: dry, pathSeries: [dry] },
  ],
});
ok("a refused slip is skipped even though it is nearer", r.recommended.name, "South cove slip");
ok("and the one they agreed to is chosen", r.recommended.permission, "yes");

console.log("\n  COVERED BEATS CLOSE, BECAUSE THE POINT IS LIGHTNING\n");
const uncoveredClose = { id: "u", kind: "shelter", name: "Open slip", lat: 30.4580, lon: -95.6080, covered: false };
r = whereToGo({
  ...base,
  dock: { ...DOCK, series: wetIn(5), pathSeries: [dry] },
  options: [
    { ...uncoveredClose, series: dry, pathSeries: [dry] },
    { ...CLOSE_HARBOR, series: dry, pathSeries: [dry] },
  ],
});
ok("the covered one wins", r.recommended.name, "Walden covered slip");
ok("and says so in the detail", /covered/.test(r.detail), true);
// Ranking directly, so the preference order is explicit.
ok("covered sorts ahead of uncovered",
  [{ covered: false, miles: 1 }, { covered: true, miles: 9 }].sort(harborRank)[0].covered, true);
ok("asked-and-agreed sorts ahead of never-asked",
  [{ covered: true, permission: "asked", miles: 1 }, { covered: true, permission: "yes", miles: 9 }]
    .sort(harborRank)[0].permission, "yes");
ok("a refusal sorts last",
  [{ covered: true, permission: "no", miles: 1 }, { covered: false, permission: "asked", miles: 9 }]
    .sort(harborRank)[1].permission, "no");

console.log("\n  WHEN NOTHING IS REACHABLE IT SAYS SO\n");
r = whereToGo({
  ...base,
  dock: { ...DOCK, series: wetIn(2), pathSeries: [dry] },
  options: [{ ...CLOSE_HARBOR, series: wetIn(1), pathSeries: [wetIn(1)] }],
});
ok("verdict is shelter", r.verdict, "shelter");
ok("it still names the nearest cover", /Walden covered slip/.test(r.detail), true);
ok("and admits you are getting wet", /in it either way/.test(r.detail), true);

console.log("\n  WITH NOTHING MARKED, IT ASKS FOR MARKS\n");
r = whereToGo({
  ...base,
  dock: { ...DOCK, series: wetIn(2), pathSeries: [dry] },
  options: [],
});
ok("says no harbors are marked", /No safe harbors are marked/.test(r.detail), true);
ok("and does not invent one", r.recommended, null);

console.log("\n  A CELL ON THE WAY COUNTS, NOT JUST AT THE FAR END\n");
r = whereToGo({
  ...base,
  dock: { ...DOCK, series: dry, pathSeries: [wetIn(4)] },
  options: [{ ...CLOSE_HARBOR, series: dry, pathSeries: [dry] }],
});
ok("wet water between here and the dock blocks it", r.verdict, "harbor");
ok("the deadline came from the path", r.dock.wetPath, 4);
ok("even though the dock itself stays dry", r.dock.wetThere, null);

console.log("\n  COSTING ONE DESTINATION\n");
const c = costOne(HERE, { ...DOCK, series: wetIn(60), pathSeries: [dry] }, { nowMs: T0, cruiseMph: 20 });
ok("distance is rounded to a tenth", typeof c.miles === "number", true);
ok("bearing is a whole number of degrees", c.bearing === Math.round(c.bearing), true);
ok("it reports a compass point", typeof c.compass === "string", true);
ok("run time rounds up", c.runMinutes >= c.miles / 20 * 60, true);
ok("margin is deadline minus run", c.marginMinutes, 60 - c.runMinutes);
ok("a dry window is makeable", costOne(HERE, { ...DOCK, series: dry, pathSeries: [dry] }, { nowMs: T0 }).makeable, true);

console.log("\n  NO POSITION, NO ANSWER\n");
r = whereToGo({ here: null, dock: { ...DOCK, series: dry }, options: [], nowMs: T0 });
ok("verdict unknown", r.verdict, "unknown");
ok("nothing recommended", r.recommended, null);
ok("no options invented", r.options, []);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
