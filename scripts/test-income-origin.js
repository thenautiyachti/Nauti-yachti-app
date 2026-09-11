// Does a completed charter land in the ledger under the right origin?
//
// Rewritten 11 Sep 2026 when the origin stopped being inferred. The old rule
// read platform "Other" as Cash, which was a guess — and it filed the first
// card-paid text booking into the cash column. The owner's rule now: "The only
// way to capture cash payments would be me telling u they paid in cash, no
// other way to confirm it really."
//
// So the cases below are mostly about what must NOT be assumed.
const APP = require("path").join(__dirname, "..");
const { recordCompletedBookingIncome } = require(APP + "/lib/bookingLedger.js");

// Records what would have been written instead of writing it.
const fakePrisma = {
  ledgerEntry: { findFirst: async () => null, create: async ({ data }) => data },
};

const CASES = [
  // The asserted method always wins, whatever channel took the booking.
  ["direct booking, owner says Stripe",
   { platform: "Direct", paymentMethod: "Stripe (card)" }, "Website"],
  ["direct booking, owner says Cash",
   { platform: "Direct", paymentMethod: "Cash" }, "Cash"],
  ["direct booking, owner says Zelle",
   { platform: "Direct", paymentMethod: "Zelle" }, "Zelle"],

  // THE ONE THAT STARTED ALL THIS. Nothing asserted, taken directly — the old
  // code called this Cash. It is simply not known, and must say so.
  ["direct booking, nothing asserted",
   { platform: "Direct", paymentMethod: null }, null],

  // A platform payout IS how that money arrived, so the channel can answer.
  ["Boatsetter, nothing asserted",
   { platform: "Boatsetter", paymentMethod: null }, "Boatsetter"],
  ["GetMyBoat payout, asserted",
   { platform: "GetMyBoat", paymentMethod: "GetMyBoat payout" }, "GetMyBoat"],
  ["website booking, nothing asserted",
   { platform: "Website", paymentMethod: null }, "Website"],

  // Legacy spellings must still resolve rather than splitting a channel in two.
  ["legacy GetmyBoat spelling",
   { platform: "GetmyBoat", paymentMethod: null }, "GetMyBoat"],
  ["legacy Other channel, nothing asserted",
   { platform: "Other", paymentMethod: null }, null],
];

(async () => {
  let bad = 0;
  for (const [label, extra, expected] of CASES) {
    const booking = {
      id: "b", status: "completed", pricePaid: 50, date: "2026-09-19",
      vesselName: "Nauti Yachti", guestName: "Test", hours: 4,
      bookingId: "NY-20260919-99", ...extra,
    };
    const row = await recordCompletedBookingIncome(fakePrisma, booking);
    const got = row ? row.origin : "(no row)";
    const ok = got === expected;
    if (!ok) bad++;
    console.log("  " + (ok ? "ok  " : "BAD ") + label.padEnd(40)
      + "origin=" + String(got).padEnd(12) + (ok ? "" : "expected " + String(expected)));
  }

  // The guard that matters more than any origin: nothing is recognised until
  // the charter has actually happened.
  const notDone = await recordCompletedBookingIncome(fakePrisma, {
    id: "x", status: "booked", pricePaid: 50, platform: "Direct",
    paymentMethod: "Stripe (card)",
  });
  let ok = notDone === null;
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "BAD ") + "paid but not yet sailed".padEnd(40)
    + (ok ? "no income row, correct" : "WROTE A ROW"));

  // And no price means no row, rather than a fabricated number in the books.
  const noPrice = await recordCompletedBookingIncome(fakePrisma, {
    id: "y", status: "completed", pricePaid: null, platform: "Direct",
    paymentMethod: "Cash",
  });
  ok = noPrice === null;
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "BAD ") + "completed with no price".padEnd(40)
    + (ok ? "no income row, correct" : "WROTE A ROW"));

  console.log("\n  " + (bad ? bad + " FAILING" : "all cases correct"));
  process.exit(bad ? 1 : 0);
})();
