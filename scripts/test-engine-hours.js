// Two of the three boats have no hour meter, so a row in EngineHoursLog means
// two different things depending on which boat it is on. This is the arithmetic
// that decides when an engine gets serviced, so it is worth pinning.
const { isMetered, currentHours, hoursByVessel, fleetHours, hoursLabel } = require("../lib/engineHours");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(58) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "  want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

// The real fleet, as the owner described it on 6 Sep 2026.
const explorer = { id: "explorer", name: "Nauti Explorer", hasHourMeter: false };
const islander = { id: "islander", name: "Nauti Islander", hasHourMeter: false };
const yachti   = { id: "yachti",   name: "Nauti Yachti",   hasHourMeter: true };
const FLEET = [explorer, islander, yachti];

console.log("\n  WHICH BOATS HAVE A METER\n");
ok("the Yachti does", isMetered(yachti), true);
ok("the Explorer does not", isMetered(explorer), false);
ok("the Islander does not", isMetered(islander), false);
ok("an unknown vessel is treated as unmetered", isMetered(undefined), false);

console.log("\n  A BOAT WITHOUT A METER: DURATIONS, SO ADD THEM UP\n");
const runs = [
  { vesselId: "explorer", date: "2026-09-06", hours: 4, createdAt: "2026-09-06T16:00:00Z" },
  { vesselId: "explorer", date: "2026-09-12", hours: 3, createdAt: "2026-09-12T18:00:00Z" },
  { vesselId: "explorer", date: "2026-09-19", hours: 5, createdAt: "2026-09-19T18:00:00Z" },
];
ok("one charter", currentHours(explorer, [runs[0]]), 4);
// THE BUG THIS REPLACES: the old code took the latest row, so after a 3-hour
// charter the Explorer's engine appeared to go BACKWARDS from 4 hours to 3.
ok("a shorter second charter ADDS, it does not replace", currentHours(explorer, runs.slice(0, 2)), 7);
ok("three charters", currentHours(explorer, runs), 12);
ok("half-hours do not leave a float tail",
  currentHours(explorer, [{ vesselId: "explorer", hours: 3.5 }, { vesselId: "explorer", hours: 3.5 },
                          { vesselId: "explorer", hours: 3.5 }]), 10.5);

console.log("\n  A BOAT WITH A METER: READINGS, SO TAKE THE LATEST\n");
const dial = [
  { vesselId: "yachti", date: "2026-09-06", hours: 1, createdAt: "2026-09-06T16:01:00Z" },
  { vesselId: "yachti", date: "2026-09-20", hours: 240.5, createdAt: "2026-09-20T19:00:00Z" },
];
ok("the latest reading wins", currentHours(yachti, dial), 240.5);
// Summing a metered boat would count the same engine time over and over: this
// one would read 241.5 hours after two readings of a dial showing 240.5.
ok("readings are NOT added together", currentHours(yachti, dial) === 241.5, false);
ok("out-of-order rows still resolve to the newest date",
  currentHours(yachti, [dial[1], dial[0]]), 240.5);
ok("same date, later entry wins", currentHours(yachti, [
  { vesselId: "yachti", date: "2026-09-20", hours: 240.5, createdAt: "2026-09-20T09:00:00Z" },
  { vesselId: "yachti", date: "2026-09-20", hours: 244.0, createdAt: "2026-09-20T19:00:00Z" },
]), 244);

console.log("\n  NOTHING LOGGED IS NULL, NOT ZERO\n");
// Zero would read as "this engine has never run", which is a claim. Null is the
// truth: nobody has told us. maintenanceStatus renders that as "cannot be
// judged" rather than as a clean bill of health.
ok("no rows at all", currentHours(explorer, []), null);
ok("rows, but none for this boat", currentHours(islander, runs), null);
ok("a row with a null reading is ignored",
  currentHours(explorer, [{ vesselId: "explorer", hours: null }]), null);

console.log("\n  THE FLEET FIGURE MAINTENANCE IS JUDGED AGAINST\n");
const all = [...runs, ...dial, { vesselId: "islander", date: "2026-09-06", hours: 1 }];
ok("every boat, read its own way",
  hoursByVessel(FLEET, all), { explorer: 12, islander: 1, yachti: 240.5 });
ok("the fleet figure is the hardest-worked engine", fleetHours(FLEET, all), 240.5);
// The old code took the max of raw ROWS, which on an unmetered boat is its
// longest single charter. With only the Explorer logged that reported 5 — the
// longest trip — instead of 12, the hours actually run.
ok("not the longest single charter", fleetHours([explorer], runs), 12);
ok("an empty fleet figure is null, not 0", fleetHours(FLEET, []), null);

console.log("\n  THE LABEL SAYS WHICH KIND OF NUMBER IT IS\n");
ok("metered", hoursLabel(yachti), "hour-meter reading");
ok("unmetered", hoursLabel(explorer), "hours run (totalled from each charter)");

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
