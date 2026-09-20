// The overview tab must survive an owed charter that has a real date.
//
//     node scripts/test-owed-charters-date.js
//
// THE OUTAGE THIS COMES FROM. On the morning of 20 Sep 2026 the owner could not
// open the console at all. Chrome answered "This page couldn't load" on his
// phone and again on his desktop, which reads as a network or login fault and
// was neither -- every API call returned 200 and the passcode had not changed
// since August. The renderer was being killed: OverviewTab threw
// "TypeError: r.getFullYear is not a function" on every attempt, React retried,
// and Chrome gave up on the tab.
//
// THE SHAPE OF IT. lib/owedCharters.js needs `today` as a "YYYY-MM-DD" string
// for its own `d < today` comparison. lib/reviews.js daysSince needed it as a
// Date so it could call .getFullYear(). OverviewTab passes the string. The two
// halves had disagreed since the module was written.
//
// WHY IT WAITED THREE WEEKS TO FIRE. owedCharters only calls daysSince for an
// owed charter whose date actually parses:
//
//     daysOwed: /^\d{4}-\d{2}-\d{2}$/.test(...) ? daysSince(b.date, today) : null
//
// The only owed charter on the books was Christian Gehring's, and his date is
// the literal string "TBD" -- so the regex failed, daysOwed came back null, and
// the broken call was never reached. Then Saturday's paid glow charters slipped
// into the past still unmarked, qualified as owed WITH real dates, and took the
// console down on the first render of the next morning.
//
// The lesson worth keeping: a dormant type error is still shipped code. This
// one was three weeks old and one qualifying row away from a total outage.
const { owedCharters, isOwedCharter } = require("../lib/owedCharters");
const { daysSince, reviewMessage, TEMPLATES } = require("../lib/reviews");

let pass = 0;
const fails = [];
function ok(label, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (good) { pass++; } else { fails.push(label + "  got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want)); }
}
function survives(label, fn) {
  try { fn(); pass++; return true; }
  catch (e) { fails.push(label + "  threw " + e.message); return false; }
}

// Exactly what OverviewTab builds and hands down: localDateKey(new Date()).
const TODAY_STRING = "2026-09-20";
const TODAY_DATE = new Date(2026, 8, 20);

// Saturday's glow night: paid, in the past, never marked completed. This is the
// row that fired it.
const GLOW = { id: "b1", name: "Kathleen Dail", date: "2026-09-19", pricePaid: 40, status: "booked", phone: "+18325550111" };
// Gehring: the row that had been the ONLY owed charter, and the reason the
// fault stayed hidden. No parseable date, so daysSince was never called.
const GEHRING = { id: "b2", name: "Christian Gehring", date: "TBD", pricePaid: 520, status: "cancelled", email: "c@example.com" };

console.log("");

// --- the crash itself --------------------------------------------------------

survives("owedCharters with a STRING today does not throw", () => owedCharters([GLOW], TODAY_STRING));
survives("owedCharters with a DATE today does not throw", () => owedCharters([GLOW], TODAY_DATE));
survives("both kinds of owed charter together", () => owedCharters([GLOW, GEHRING], TODAY_STRING));

// --- and that it still gets the answer right ---------------------------------

const owed = owedCharters([GLOW], TODAY_STRING);
ok("the glow charter is picked up as owed", owed.length, 1);
ok("one day owed, counted from the string", owed[0] && owed[0].daysOwed, 1);
ok("reachable by phone", owed[0] && owed[0].reachable, true);

// A string and a Date for the same day must agree. If they ever diverge the
// console and the emails would quietly disagree about how late we are.
ok("string and Date today give the same answer",
  owedCharters([GLOW], TODAY_STRING)[0].daysOwed,
  owedCharters([GLOW], TODAY_DATE)[0].daysOwed);

// Gehring must still qualify, and must still carry no day count.
const both = owedCharters([GLOW, GEHRING], TODAY_STRING);
ok("an undated owed charter still qualifies", both.length, 2);
ok("an undated owed charter has no day count", both.find((b) => b.id === "b2").daysOwed, null);

// --- daysSince directly ------------------------------------------------------

ok("daysSince accepts a string today", daysSince("2026-09-19", TODAY_STRING), 1);
ok("daysSince accepts a Date today", daysSince("2026-09-19", TODAY_DATE), 1);
ok("daysSince with no today still works", typeof daysSince("2026-09-19"), "number");
ok("daysSince keeps returning null for an unparseable charter date", daysSince("TBD", TODAY_STRING), null);

// --- the same hazard in the review flow --------------------------------------

// fmtLooseDate is internal, so it is exercised through reviewMessage — which is
// the only way it is ever reached in production anyway. Every template gets the
// string form, because that is what the console passes.
const GUEST = { name: "Kathleen", date: "2026-07-04", vesselName: "Nauti Explorer", phone: "+18325550111" };
for (const t of TEMPLATES) {
  survives("reviewMessage '" + t.id + "' accepts a string today",
    () => reviewMessage(t.id, GUEST, TODAY_STRING));
  ok("reviewMessage '" + t.id + "' reads the same either way",
    reviewMessage(t.id, GUEST, TODAY_STRING), reviewMessage(t.id, GUEST, TODAY_DATE));
}
// The month name is the bit fmtLooseDate produces: prove it actually rendered
// rather than silently falling back to "your trip with us".
ok("a July charter is described as July",
  /July/.test(TEMPLATES.map((t) => reviewMessage(t.id, GUEST, TODAY_STRING)).join(" ")), true);

// --- the qualifying rule has not moved ---------------------------------------

ok("a completed charter is never owed", isOwedCharter({ ...GLOW, status: "completed" }, TODAY_STRING), false);
ok("an unpaid past booking is not owed", isOwedCharter({ ...GLOW, pricePaid: 0 }, TODAY_STRING), false);
ok("a future paid booking is not owed", isOwedCharter({ ...GLOW, date: "2026-12-01" }, TODAY_STRING), false);

console.log("  " + pass + " passed, " + fails.length + " failed");
for (const f of fails) console.log("   FAIL  " + f);
console.log("");
process.exitCode = fails.length ? 1 : 0;
