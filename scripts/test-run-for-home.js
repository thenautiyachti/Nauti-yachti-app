// Someone decides whether to run twelve people home through weather based on
// what this returns, so every branch is pinned and the pessimistic direction is
// asserted explicitly.
const { milesBetween, bearingTo, compass, sampleLine, minutesUntilWet, minutesHome, assess,
  parseCoord, withinReach } = require("../lib/runForHome");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(56) +
    (good ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}
function near(what, got, want, tol) {
  const good = got != null && Math.abs(got - want) <= tol;
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(56) +
    (good ? "" : `\n         got ${got}  want ~${want} (±${tol})`));
  good ? pass++ : fail++;
}

// Pearl Bay end of Lake Conroe, and a point out toward the middle of the lake.
const DOCK = { lat: 30.3935, lon: -95.5836 };
const OUT = { lat: 30.4400, lon: -95.6100 };

console.log("\n  DISTANCE AND BEARING\n");
near("about three and a half miles up the lake", milesBetween(OUT, DOCK), 3.5, 0.6);
ok("a point to itself is zero", Math.round(milesBetween(DOCK, DOCK)), 0);
ok("no position is null, never zero", milesBetween(null, DOCK), null);
ok("a missing dock is null", milesBetween(OUT, {}), null);
near("dock lies south-southeast of the lake point", bearingTo(OUT, DOCK), 148, 12);
ok("due north", compass(0), "N");
ok("due west", compass(270), "W");
ok("rounds to the nearest point", compass(105), "ESE");
ok("and 101 is still nearer due east", compass(101), "E");

console.log("\n  SAMPLING THE WATER IN BETWEEN\n");
const line = sampleLine(OUT, DOCK, 5);
ok("includes both ends", [line[0].lat, line[4].lat], [OUT.lat, DOCK.lat]);
ok("five points", line.length, 5);
ok("the middle is halfway", Math.round(line[2].lat * 1e4) / 1e4,
  Math.round(((OUT.lat + DOCK.lat) / 2) * 1e4) / 1e4);
ok("never fewer than two", sampleLine(OUT, DOCK, 1).length, 2);
ok("capped so we do not hammer the forecast API", sampleLine(OUT, DOCK, 500).length, 10);

console.log("\n  WHEN DOES IT START RAINING\n");
const T0 = Date.parse("2026-09-06T17:00:00Z");
const at = (min, mm) => ({ time: new Date(T0 + min * 60000).toISOString(), precipitation: mm });
ok("first wet sample wins", minutesUntilWet([at(0, 0), at(15, 0), at(30, 1.4), at(45, 2)], T0), 30);
ok("already raining is zero minutes", minutesUntilWet([at(0, 3)], T0), 0);
ok("a dry window is null", minutesUntilWet([at(0, 0), at(15, 0), at(30, 0)], T0), null);
// A model trace of 0.1mm is not rain you would turn a boat around for.
ok("a trace below the threshold does not count", minutesUntilWet([at(15, 0.1)], T0), null);
ok("0.2mm does count", minutesUntilWet([at(15, 0.2)], T0), 15);
ok("past samples are ignored", minutesUntilWet([at(-30, 9), at(60, 1)], T0), 60);
ok("no series is null", minutesUntilWet(null, T0), null);
ok("null precipitation entries are skipped", minutesUntilWet([at(15, null), at(30, 1)], T0), 30);

console.log("\n  THE RUN HOME IS COSTED PESSIMISTICALLY\n");
ok("3.5 mi at the default 20mph", minutesHome(3.5), 11);
ok("rounds UP — arriving early costs nothing", minutesHome(3.4), 11);
ok("a faster cruise if given one", minutesHome(10, 30), 20);
ok("a nonsense cruise falls back to 20", minutesHome(10, 0), 30);
ok("no distance is null", minutesHome(null), null);

console.log("\n  THE VERDICT\n");
const base = { here: OUT, dock: DOCK, nowMs: T0, cruiseMph: 20 };
const dry = [at(0, 0), at(60, 0), at(120, 0)];

let r = assess({ ...base, atHere: dry, atDock: dry, alongPath: [dry] });
ok("nothing coming reads as clear", r.verdict, "clear");
ok("and says so without inventing a deadline", r.deadlineMinutes, null);

r = assess({ ...base, atHere: [at(90, 2)], atDock: dry, alongPath: [dry] });
ok("plenty of time is 'go'", r.verdict, "go");
near("margin is deadline minus the run", r.marginMinutes, 90 - 11, 1);

r = assess({ ...base, atHere: [at(20, 2)], atDock: dry, alongPath: [dry] });
ok("just enough is 'tight'", r.verdict, "tight");

r = assess({ ...base, atHere: [at(5, 3)], atDock: dry, alongPath: [dry] });
ok("not enough time says shelter", r.verdict, "shelter");
ok("and the margin is negative, not clamped", r.marginMinutes < 0, true);

console.log("\n  THE EARLIEST WEATHER ANYWHERE SETS THE DEADLINE\n");
// A cell over the middle of the run matters even when both ends look dry.
r = assess({ ...base, atHere: dry, atDock: dry, alongPath: [dry, [at(10, 4)], dry] });
ok("a cell on the path counts", r.deadlineMinutes, 10);
ok("and it drives the verdict", r.verdict, "shelter");
// Rain at the dock is what you are running INTO, so it binds too.
r = assess({ ...base, atHere: dry, atDock: [at(12, 3)], alongPath: [dry] });
ok("rain at the dock binds", r.deadlineMinutes, 12);
r = assess({ ...base, atHere: [at(40, 3)], atDock: [at(12, 3)], alongPath: [[at(25, 3)]] });
ok("the soonest of the three wins", r.deadlineMinutes, 12);

console.log("\n  WITHOUT A POSITION IT REFUSES TO GUESS\n");
r = assess({ here: null, dock: DOCK, nowMs: T0, atHere: dry, atDock: dry });
ok("verdict is unknown", r.verdict, "unknown");
ok("no distance invented", r.miles, null);
ok("no run time invented", r.runMinutes, null);
r = assess({ here: OUT, dock: null, nowMs: T0, atHere: dry });
ok("a missing dock is equally unknown", r.verdict, "unknown");

console.log("\n  WHAT IT REPORTS BACK\n");
r = assess({ ...base, atHere: [at(90, 2)], atDock: dry, alongPath: [dry], windMph: 12.6, gustMph: 24.4 });
near("distance rounded to a tenth", r.miles, 3.5, 0.6);
ok("compass point for the helm", r.compass, "SSE");
ok("wind rounded", [r.windMph, r.gustMph], [13, 24]);
ok("headline is a sentence, not a number", typeof r.headline === "string" && r.headline.length > 10, true);

console.log("\n  NULL ISLAND — ABSENT IS NOT ZERO\n");
// The live bug, 6 Sep 2026. searchParams.get() returns null when a parameter is
// missing, Number(null) is 0, and 0 is finite — so a phone that could not get a
// fix was read as sitting at 0N 0E, and the page reported "Dock is 6551.1 mi
// WNW, about 19654 min at cruise" over a forecast fetched for the Gulf of
// Guinea and presented as this lake.
ok("a missing parameter is null, NOT zero", parseCoord(null), null);
ok("undefined is null", parseCoord(undefined), null);
ok("an empty parameter is null — Number('') is 0 too", parseCoord(""), null);
ok("a real coordinate survives", parseCoord("30.39350"), 30.3935);
ok("a negative longitude survives", parseCoord("-95.58360"), -95.5836);
ok("a genuine zero is still zero", parseCoord("0"), 0);
ok("nonsense is null", parseCoord("north-ish"), null);
ok("infinity is null", parseCoord("Infinity"), null);

console.log("\n  AND A SECOND LAYER, BECAUSE THE FIRST ONE FAILED\n");
ok("null island is rejected outright", withinReach({ lat: 0, lon: 0 }, DOCK), false);
ok("and it really is 6551 miles away",
  Math.round(milesBetween({ lat: 0, lon: 0 }, DOCK)), 6551);
ok("the lake itself is fine", withinReach(DOCK, DOCK), true);
ok("out on the water is fine", withinReach(OUT, DOCK), true);
ok("Houston, 40 miles off, is believed", withinReach({ lat: 29.7604, lon: -95.3698 }, DOCK), true);
ok("Dallas, 200 miles off, is believed", withinReach({ lat: 32.7767, lon: -96.797 }, DOCK), true);
ok("Denver is not", withinReach({ lat: 39.7392, lon: -104.9903 }, DOCK), false);
ok("a sign-flipped longitude is not", withinReach({ lat: 30.3935, lon: 95.5836 }, DOCK), false);
ok("swapped lat/lon is not", withinReach({ lat: -95.5836, lon: 30.3935 }, DOCK), false);
ok("NaN is not", withinReach({ lat: NaN, lon: NaN }, DOCK), false);
ok("nothing is not", withinReach(null, DOCK), false);

// End to end: a rejected position must produce "unknown", never a confident
// distance next to a cheerful forecast.
const nullIsland = assess({ here: null, dock: DOCK, nowMs: T0, atHere: dry, atDock: dry });
ok("a rejected position gives no distance", nullIsland.miles, null);
ok("and no run time", nullIsland.runMinutes, null);
ok("and refuses to call it clear", nullIsland.verdict, "unknown");


console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
