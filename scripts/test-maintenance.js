// Service intervals decide when an engine gets opened up, so the arithmetic and
// especially the "we do not know" case are pinned.
const { statusFor, hoursForItem, judgeAll, byVessel, summarise, monthsSinceDate } =
  require("../lib/maintenance");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(56) +
    (good ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

const explorer = { id: "explorer", name: "Nauti Explorer", hasHourMeter: false, sortOrder: 0 };
const islander = { id: "islander", name: "Nauti Islander", hasHourMeter: false, sortOrder: 1 };
const yachti = { id: "yachti", name: "Nauti Yachti", hasHourMeter: true, sortOrder: 2 };
const FLEET = [explorer, islander, yachti];

// Explorer has run 120 hours (four charters, summed). Islander 5. Yachti's dial
// reads 240.
const LOGS = [
  { vesselId: "explorer", date: "2026-06-01", hours: 40 },
  { vesselId: "explorer", date: "2026-07-01", hours: 40 },
  { vesselId: "explorer", date: "2026-08-01", hours: 40 },
  { vesselId: "islander", date: "2026-08-01", hours: 5 },
  { vesselId: "yachti", date: "2026-08-01", hours: 240 },
];
const NOW = new Date(2026, 8, 6, 12, 0).getTime();

console.log("\n  WHICH ENGINE'S HOURS COUNT\n");
ok("an item on the Explorer uses the Explorer's hours",
  hoursForItem({ vesselId: "explorer" }, FLEET, LOGS), 120);
ok("an item on the Islander uses the Islander's",
  hoursForItem({ vesselId: "islander" }, FLEET, LOGS), 5);
ok("a metered boat uses its reading", hoursForItem({ vesselId: "yachti" }, FLEET, LOGS), 240);
// This is the whole point of the change.
ok("the Islander is NOT judged against the Explorer's hours",
  hoursForItem({ vesselId: "islander" }, FLEET, LOGS) === 120, false);
ok("a fleet-wide item still uses the hardest-worked engine",
  hoursForItem({ vesselId: null }, FLEET, LOGS), 240);
ok("an item pointing at a boat that no longer exists is unknown, not zero",
  hoursForItem({ vesselId: "sold-it" }, FLEET, LOGS), null);

console.log("\n  DUE, OR NOT\n");
const oil = { label: "Engine Oil", intervalHours: 100, intervalMonths: 12, sortOrder: 0 };
ok("50 hours into a 100-hour interval is fine",
  statusFor({ ...oil, lastDoneHours: 70, lastDoneDate: "2026-08-01" }, 120, NOW).status, "ok");
ok("95 of 100 is due soon",
  statusFor({ ...oil, lastDoneHours: 25, lastDoneDate: "2026-08-01" }, 120, NOW).status, "due-soon");
ok("100 of 100 is overdue",
  statusFor({ ...oil, lastDoneHours: 20, lastDoneDate: "2026-08-01" }, 120, NOW).status, "overdue");
ok("hours since is reported",
  statusFor({ ...oil, lastDoneHours: 20, lastDoneDate: "2026-08-01" }, 120, NOW).hoursSince, 100);

console.log("\n  MONTHS COUNT TOO, AND EITHER ONE CAN TRIP IT\n");
const bilge = { label: "Bilge Pump", intervalHours: 50, intervalMonths: 3, sortOrder: 0 };
ok("recent hours but a stale date is still overdue",
  statusFor({ ...bilge, lastDoneHours: 119, lastDoneDate: "2026-01-01" }, 120, NOW).status, "overdue");
ok("fresh date but too many hours is overdue",
  statusFor({ ...bilge, lastDoneHours: 10, lastDoneDate: "2026-09-01" }, 120, NOW).status, "overdue");
ok("both fresh is ok",
  statusFor({ ...bilge, lastDoneHours: 115, lastDoneDate: "2026-09-01" }, 120, NOW).status, "ok");
ok("months are counted", monthsSinceDate("2026-06-06", NOW), 3);
ok("no date is null months", monthsSinceDate(null, NOW), null);
ok("an unparseable date is null, not zero", monthsSinceDate("soon", NOW), null);

console.log("\n  \"UNKNOWN\" IS NOT A CLEAN BILL OF HEALTH\n");
// Thirteen items sat reading OK while meaning "nobody has told me anything".
ok("never done, hours interval only", statusFor(oil, 120, NOW).status, "unknown");
ok("a date but no hours, and only an hours interval",
  statusFor({ label: "x", intervalHours: 100, lastDoneDate: "2026-08-01" }, 120, NOW).status, "unknown");
ok("no hours reading at all cannot judge an hours interval",
  statusFor({ ...oil, lastDoneHours: 20 }, null, NOW).status, "unknown");
ok("but a months interval with a date still judges",
  statusFor({ label: "x", intervalMonths: 3, lastDoneDate: "2026-01-01" }, null, NOW).status, "overdue");
ok("and it is never silently 'ok'", statusFor(oil, 120, NOW).label, "Never recorded");

console.log("\n  GROUPED BY BOAT\n");
const ITEMS = [
  { id: "1", label: "Oil", vesselId: "explorer", intervalHours: 100, lastDoneHours: 10, lastDoneDate: "2026-08-01", intervalMonths: 12, sortOrder: 0 },
  { id: "2", label: "Plugs", vesselId: "explorer", intervalHours: 100, sortOrder: 1 },
  { id: "3", label: "Oil", vesselId: "islander", intervalHours: 100, lastDoneHours: 1, lastDoneDate: "2026-08-01", intervalMonths: 12, sortOrder: 0 },
  { id: "4", label: "Trailer bearings", vesselId: null, intervalMonths: 12, lastDoneDate: "2020-01-01", sortOrder: 0 },
];
const groups = byVessel(ITEMS, FLEET, LOGS, NOW);
ok("a group per boat, in fleet order, then fleet-wide",
  groups.map((g) => g.name), ["Nauti Explorer", "Nauti Islander", "Nauti Yachti", "Whole fleet"]);
ok("the Explorer's two items", groups[0].items.map((i) => i.item.label), ["Oil", "Plugs"]);
// Same item, same interval, different engine -> different answer. The point.
ok("the Explorer's oil is overdue at 120 hrs", groups[0].items[0].status, "overdue");
ok("the Islander's identical oil item is fine at 5 hrs", groups[1].items[0].status, "ok");
ok("a boat with no items still gets a group", groups[2].items, []);
ok("and says so rather than looking healthy", summarise(groups[2]), "no schedule set up");

console.log("\n  WORST FIRST\n");
const mixed = byVessel([
  { id: "a", label: "Fine", vesselId: "explorer", intervalHours: 500, lastDoneHours: 10, sortOrder: 0 },
  { id: "b", label: "Never", vesselId: "explorer", intervalHours: 100, sortOrder: 1 },
  { id: "c", label: "Overdue", vesselId: "explorer", intervalHours: 10, lastDoneHours: 10, sortOrder: 2 },
], FLEET, LOGS, NOW);
ok("overdue, then never recorded, then ok",
  mixed[0].items.map((i) => i.item.label), ["Overdue", "Never", "Fine"]);

console.log("\n  THE HEADER LINE\n");
ok("counts what matters", summarise(groups[0]), "1 overdue · 1 never recorded");
ok("all clear says so", summarise(groups[1]), "all up to date");
ok("fleet-wide group summarised too", summarise(groups[3]), "1 overdue");

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
