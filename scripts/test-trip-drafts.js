// Pearl's drafts for trip page messages. Nothing sends; these only pre-fill
// the owner's reply box. What matters is that a draft only ever quotes the
// booking, and that anything about money, another date, or trouble is left to
// him. No database.
process.env.DOCK_ADDRESS = "1 Test Dock Ct";
const { tripView } = require("../lib/tripInfo");
const { draftTripReply } = require("../lib/tripDrafts");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(62) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "  want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

const NOW = new Date("2026-10-02T15:00:00Z");
const v = tripView({
  ref: "NY-20261010-01", status: "booked", paymentStatus: "paid", platform: "Direct",
  name: "Pat Example", date: "2026-10-10", startTime: "10:00", hours: 4,
  vesselId: "explorer", vesselName: "Nauti Explorer", packageName: "Tubing",
}, { now: NOW });

console.log("\n  drafted from the booking");
const t = draftTripReply("What time should we get there?", v);
ok("a time question is drafted", t.action, "draft");
ok("it quotes the start time", /10:00 AM/.test(t.suggestion), true);
ok("and when to arrive", /9:45 AM/.test(t.suggestion), true);
ok("it greets them by first name", t.suggestion.startsWith("Hi Pat!"), true);
const w = draftTripReply("What's the address?", v);
ok("a where question is drafted", w.action, "draft");
ok("it quotes this boat's dock", /1 Test Dock Ct/.test(w.suggestion), true);
ok("it promises the code by text, never the code", /text you the gate code/.test(w.suggestion), true);

console.log("\n  held for the owner");
ok("a price question is held", draftTripReply("How much is it to add an hour?", v).action, "hold");
ok("another date is held", draftTripReply("Any room on the 12th too?", v).action, "hold");
ok("a complaint is held", draftTripReply("I want a refund, this was awful", v).action, "hold");
ok("small talk nobody can answer from the row is held", draftTripReply("We're so excited!!", v).action, "hold");
const noTime = tripView({ ref: "NY-20261010-02", status: "booked", date: "2026-10-10", vesselId: "explorer", vesselName: "Nauti Explorer" }, { now: NOW });
ok("no start time on the booking: held, not guessed", draftTripReply("What time do we leave?", noTime).action, "hold");
const yachti = tripView({ ref: "NY-20261010-03", status: "booked", date: "2026-10-10", startTime: "10:00", vesselId: "yachti", vesselName: "Nauti Yachti" }, { now: NOW });
ok("no address for that boat: held, not the other dock", draftTripReply("Where do we meet?", yachti).action, "hold");

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
