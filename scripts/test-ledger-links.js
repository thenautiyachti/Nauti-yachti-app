// Does lib/ledgerLinks.js actually catch the thing it was written for?
//
// It cannot be proved against live data, because the fault it detects has just
// been fixed -- a check that reports nothing is indistinguishable from a check
// that does nothing. So this rebuilds each case from scratch, including the two
// that produced wrong answers on the way to writing it.
const {
  isLinked, unlinkedIncome, ledgerFor, moneyShouldBeOnTheBooks,
  chartersMissingTheirMoney, diagnose,
} = require("../lib/ledgerLinks");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(56) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

// --- the shapes that actually occur in this ledger ---------------------------
const gehring = { id: "cuid-geh", bookingId: "NY-20260711-03", guestName: "Christian Gehring", status: "owed", pricePaid: 520, date: "TBD" };
const oscar   = { id: "cuid-osc", bookingId: "NY-20260906-01", guestName: "Oscar RoblesGil R", status: "booked", pricePaid: 850, date: "2026-09-06" };
const hunter  = { id: "cuid-hun", bookingId: "NY-20260919-01", guestName: "Hunter", status: "booked", pricePaid: 400, date: "2026-09-19" };
const drew    = { id: "cuid-drw", bookingId: "NY-20260629-01", guestName: "Drew Morgan", status: "completed", pricePaid: 362, date: "2026-06-29" };
const ghost   = { id: "cuid-gho", bookingId: "NY-20260101-01", guestName: "Nobody Atall", status: "completed", pricePaid: 300, date: "2026-01-01" };

const geldRow  = { id: "l1", type: "income", amount: 520, note: "Christian Gehring $520 via Zelle for 11 Jul 2026", origin: "Zelle" };
const glowRow  = { id: "l2", type: "income", amount: 225, subcategory: "Glow Party", note: "Richard A Cruz $225 via Zelle — seats at the May 2026 Glow Party", origin: "Zelle" };
const drewRow  = { id: "l3", type: "income", amount: 362, externalBookingId: "cuid-drw", note: "Drew Morgan payout" };
const strOnly  = { id: "l4", type: "income", amount: 200, bookingId: "NY-20260815-02", note: "linked by the string only" };
const expense  = { id: "l5", type: "expense", amount: 90, note: "fuel" };

console.log("\n  LINKS\n");
ok("a row with the real FK is linked", isLinked(drewRow), true);
ok("a row with only the bookingId string is linked", isLinked(strOnly), true);
ok("a row with neither is not linked", isLinked(geldRow), false);
ok("null is not linked", isLinked(null), false);

console.log("\n  UNLINKED INCOME\n");
const ledger = [geldRow, glowRow, drewRow, strOnly, expense];
ok("finds exactly the two unlinked income rows",
  unlinkedIncome(ledger).map((l) => l.id), ["l1", "l2"]);
ok("an unlinked EXPENSE is not income and is ignored",
  unlinkedIncome([expense]).length, 0);

console.log("\n  LEDGER FOR A BOOKING\n");
ok("matches on the real FK", ledgerFor(drew, ledger).map((l) => l.id), ["l3"]);
ok("matches on the bookingId string too",
  ledgerFor({ id: "x", bookingId: "NY-20260815-02" }, ledger).map((l) => l.id), ["l4"]);
ok("a booking with no rows gets none", ledgerFor(ghost, ledger), []);
// The bug this guards: a booking whose bookingId is null must not match every
// ledger row whose bookingId is also null.
ok("null bookingId does not match null-bookingId rows",
  ledgerFor({ id: "no-id", bookingId: null }, ledger), []);

console.log("\n  WHEN MONEY IS DUE ON THE BOOKS\n");
ok("completed  -> yes", moneyShouldBeOnTheBooks("completed"), true);
ok("owed       -> yes", moneyShouldBeOnTheBooks("owed"), true);
ok("booked     -> NO (income posts on completion)", moneyShouldBeOnTheBooks("booked"), false);
ok("inquiry    -> no", moneyShouldBeOnTheBooks("inquiry"), false);
ok("lapsed     -> no", moneyShouldBeOnTheBooks("lapsed"), false);
ok("cancelled  -> no", moneyShouldBeOnTheBooks("cancelled"), false);

console.log("\n  THE CHECK ITSELF\n");
// Gehring BEFORE the link: owed, paid, no row pointing at him.
ok("flags an owed charter whose money is not tied to it",
  chartersMissingTheirMoney([gehring], ledger).map((b) => b.bookingId), ["NY-20260711-03"]);
// Gehring AFTER the link.
const linkedLedger = [{ ...geldRow, externalBookingId: "cuid-geh", bookingId: "NY-20260711-03" }, ...ledger.slice(1)];
ok("stops flagging him once the row is linked",
  chartersMissingTheirMoney([gehring], linkedLedger), []);
// The false positives that a naive `pricePaid > 0` test produced.
ok("does NOT flag a future booked charter (Oscar)",
  chartersMissingTheirMoney([oscar], ledger), []);
ok("does NOT flag a future booked charter (Hunter)",
  chartersMissingTheirMoney([hunter], ledger), []);
ok("does not flag a completed charter that IS linked",
  chartersMissingTheirMoney([drew], ledger), []);
ok("a settled charter with no price is not a money fault",
  chartersMissingTheirMoney([{ ...ghost, pricePaid: 0 }], ledger), []);

console.log("\n  DIAGNOSIS — unlinked vs genuinely missing\n");
const dGeh = diagnose(gehring, ledger);
ok("Gehring reads as UNLINKED, not missing", dGeh.kind, "unlinked");
ok("and it points at the right row", dGeh.candidates.map((c) => c.id), ["l1"]);
const dGhost = diagnose(ghost, ledger);
ok("a booking with nothing matching reads as MISSING", dGhost.kind, "missing");
ok("and offers no candidates", dGhost.candidates, []);

// The bug that made this necessary: "Oscar RoblesGil R" has surname "R", and a
// substring match on one letter hit almost every note in the ledger.
const dOscar = diagnose({ ...oscar, status: "completed" }, ledger);
ok("a one-letter surname does not match everything", dOscar.kind, "missing");
// The Glow Party row is unlinked but belongs to no charter. It must not be
// offered as the answer to some unrelated booking of the same amount.
ok("an unrelated unlinked row is not attributed by name alone",
  diagnose({ ...ghost, guestName: "Someone Else", pricePaid: 999 }, ledger).candidates, []);
ok("but the same AMOUNT is a real signal and is offered",
  diagnose({ ...ghost, guestName: "Someone Else", pricePaid: 225 }, ledger).candidates.map((c) => c.id), ["l2"]);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
