// Hazards are drawn over water someone steers a boat across, so the rules about
// what counts as a hazard and how far it reaches are pinned.
const {
  KINDS, PLACE_KINDS, HAZARD_KINDS, KIND_LABEL,
  isKind, isHazard, nearest, byKind, validate,
} = require("../lib/waterPoints");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(56) +
    (good ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

const DOCK = { lat: 30.3935, lon: -95.5836 };

console.log("\n  PLACES AND HAZARDS ARE DIFFERENT THINGS\n");
ok("four places", PLACE_KINDS, ["fuel", "shelter", "ramp", "spot"]);
ok("three hazards", HAZARD_KINDS, ["stumps", "shallow", "nowake"]);
ok("stumps is a hazard", isHazard("stumps"), true);
ok("fuel is not", isHazard("fuel"), false);
ok("every kind is valid", KINDS.every(isKind), true);
ok("something invented is not", isKind("kraken"), false);
ok("every kind has a label", KINDS.every((k) => !!KIND_LABEL[k]), true);

console.log("\n  A HAZARD IS NEVER SOMEWHERE TO GO\n");
const points = [
  { id: "1", kind: "fuel", name: "Marina", lat: 30.40, lon: -95.58 },
  { id: "2", kind: "stumps", name: "North end", lat: 30.41, lon: -95.58, radiusYards: 900 },
  { id: "3", kind: "shelter", name: "Covered slip", lat: 30.42, lon: -95.60 },
];
// The stump field is the closest thing to the dock. Asking for "nearest"
// without naming a kind must never answer with it.
ok("an unfiltered nearest excludes hazards",
  nearest(points, DOCK).map((p) => p.name), ["Marina", "Covered slip"]);
ok("but asking for stumps by name still finds them",
  nearest(points, DOCK, "stumps").map((p) => p.name), ["North end"]);
ok("the grouped list only covers places", Object.keys(byKind(points, DOCK)), PLACE_KINDS);
ok("and never has a hazard bucket", byKind(points, DOCK).stumps, undefined);

console.log("\n  HOW FAR IT REACHES\n");
const base = { name: "North end", kind: "stumps", lat: 30.5, lon: -95.6 };
ok("a radius is kept", validate({ ...base, radiusYards: 800 }).value.radiusYards, 800);
ok("a decimal is rounded", validate({ ...base, radiusYards: 249.6 }).value.radiusYards, 250);
ok("a string from a form input works", validate({ ...base, radiusYards: "500" }).value.radiusYards, 500);
ok("blank means no radius, not zero", validate({ ...base, radiusYards: "" }).value.radiusYards, null);
ok("absent means no radius", validate(base).value.radiusYards, null);
// Zero would draw nothing at all, which is worse than a pin.
ok("zero is refused", validate({ ...base, radiusYards: 0 }).ok, false);
ok("negative is refused", validate({ ...base, radiusYards: -50 }).ok, false);
// Most of the lake marked as one circle is not a usable hazard.
ok("bigger than the lake is refused", validate({ ...base, radiusYards: 9000 }).ok, false);
ok("and says to break it up",
  validate({ ...base, radiusYards: 9000 }).errors.some((e) => /pieces/.test(e)), true);
ok("nonsense is refused", validate({ ...base, radiusYards: "big" }).ok, false);

console.log("\n  A MARK STILL NEEDS TO BE RECOGNISABLE LATER\n");
ok("no name is refused", validate({ kind: "stumps", lat: 30.5, lon: -95.6 }).ok, false);
ok("an unknown kind is refused", validate({ ...base, kind: "kraken" }).ok, false);
ok("null island is refused as a position", validate({ ...base, lat: 200 }).ok, false);
ok("a good place needs no radius", validate({ name: "Marina", kind: "fuel", lat: 30.4, lon: -95.6 }).ok, true);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
