// Does a completed charter land in the ledger under the right origin?
//
// The rule changed on 11 Sep 2026: platform "Other" used to mean Cash by
// definition, which stopped being true the moment a text-taken booking could
// be paid by card. Getting this wrong does not lose money — it files card
// income into the cash column, which is the one channel the owner has said is
// already the hardest to reconcile.
//
// Exercises the real function against the real shapes, with a fake prisma so
// nothing is written.
const APP = require("path").join(__dirname, "..");
const { recordCompletedBookingIncome } = require(APP + "/lib/bookingLedger.js");

// Records what would have been written instead of writing it.
const fakePrisma = {
  ledgerEntry: {
    findFirst: async () => null,
    create: async ({ data }) => data,
  },
};

const CASES = [
  ["text booking, paid by card",
   { platform: "Other", paymentStatus: "paid", stripeSessionId: "cs_live_x" }, "Website"],
  ["text booking, paid in cash",
   { platform: "Other", paymentStatus: "unpaid", stripeSessionId: null }, "Cash"],
  ["text booking, link issued but settled in cash",
   { platform: "Other", paymentStatus: "unpaid", stripeSessionId: "cs_live_y" }, "Cash"],
  ["website booking",
   { platform: "Website", paymentStatus: "paid", stripeSessionId: "cs_live_z" }, "Website"],
  ["Boatsetter payout",
   { platform: "Boatsetter", paymentStatus: "unpaid", stripeSessionId: null }, "Boatsetter"],
  ["GetMyBoat payout",
   { platform: "GetmyBoat", paymentStatus: "unpaid", stripeSessionId: null }, "GetmyBoat"],
];

(async () => {
  let bad = 0;
  for (const [label, extra, expected] of CASES) {
    const booking = {
      id: "b_" + label.replace(/\W+/g, ""), status: "completed", pricePaid: 50,
      date: "2026-09-19", vesselName: "Nauti Yachti", guestName: "Test", hours: 4,
      bookingId: "NY-20260919-99", ...extra,
    };
    const row = await recordCompletedBookingIncome(fakePrisma, booking);
    const got = row ? row.origin : "(no row)";
    const ok = got === expected;
    if (!ok) bad++;
    console.log("  " + (ok ? "ok  " : "BAD ") + label.padEnd(42)
      + "origin=" + String(got).padEnd(12) + (ok ? "" : "expected " + expected));
  }

  // The guard that matters more than any origin: nothing is recognised until
  // the charter has actually happened.
  const notDone = await recordCompletedBookingIncome(fakePrisma, {
    id: "x", status: "booked", pricePaid: 50, platform: "Other",
    paymentStatus: "paid", stripeSessionId: "cs_live_q",
  });
  const ok = notDone === null;
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "BAD ") + "paid but not yet sailed".padEnd(42)
    + (ok ? "no income row, correct" : "WROTE A ROW"));

  console.log("\n  " + (bad ? bad + " FAILING" : "all cases correct"));
  process.exit(bad ? 1 : 0);
})();
