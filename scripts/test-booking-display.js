// The status column has to tell a settled charter from one that still owes.
//
//     node scripts/test-booking-display.js
//
// Owner, 18 Sep 2026: "we have a list of those who are booked and paid, and
// those who are booked and also unpaid". That morning his glow night showed
// five BOOKED rows in the same blue and exactly one had been paid.
const { bookingDisplay } = require("../lib/bookingStatus");

let pass = 0;
const fails = [];
function ok(label, got, want) {
  if (got === want) pass++;
  else fails.push(label + "  expected " + JSON.stringify(want) + ", got " + JSON.stringify(got));
}

const GREEN = "#7FE0B8", BLUE = "#4FA8E8", RED = "#E2685F";

// --- the three the owner asked for -----------------------------------------
const paid = bookingDisplay({ statusBucket: "booked", paymentStatus: "paid", pricePaid: 100 });
ok("paid is green", paid.color, GREEN);
ok("paid says so", paid.label, "Booked / paid");

const unpaid = bookingDisplay({ statusBucket: "booked", paymentStatus: "unpaid", priceQuoted: 60 });
ok("unpaid stays blue", unpaid.color, BLUE);
ok("unpaid says so", unpaid.label, "Booked / unpaid");

const failed = bookingDisplay({ statusBucket: "booked", paymentStatus: "unpaid", paymentFailedAt: new Date() });
ok("a failed card is red", failed.color, RED);
ok("a failed card says so", failed.label, "Booked / payment failed");

// --- the orders that matter -------------------------------------------------
// A decline followed by a successful payment must not keep showing red. The
// webhook clears the columns, but the display must not depend on that having
// happened.
ok("paying after a decline clears the red",
  bookingDisplay({ statusBucket: "booked", paymentStatus: "paid", pricePaid: 100, paymentFailedAt: new Date() }).tone,
  "paid");

// The crew ride free. Settled, but not a sale, and calling it paid puts them in
// the same sentence as a guest who handed over money.
ok("a no-charge booking is not called paid",
  bookingDisplay({ statusBucket: "booked", paymentStatus: "paid", priceQuoted: 0 }).label,
  "Booked / no charge");
ok("but it is still green", 
  bookingDisplay({ statusBucket: "booked", paymentStatus: "paid", priceQuoted: 0 }).color, GREEN);

// --- everything else is untouched -------------------------------------------
// An inquiry is unpaid by definition, so colouring it by payment says nothing.
ok("an inquiry keeps its own label",
  bookingDisplay({ statusBucket: "inquiry", paymentStatus: "unpaid" }).label, "Inquiry");
ok("an inquiry has no payment tone",
  bookingDisplay({ statusBucket: "inquiry", paymentStatus: "paid" }).tone, null);
ok("owed keeps its amber", bookingDisplay({ statusBucket: "owed" }).color, "#E8934A");
ok("completed is unchanged", bookingDisplay({ statusBucket: "completed" }).label, "Completed");
ok("cancelled is unchanged", bookingDisplay({ statusBucket: "cancelled" }).label, "Cancelled");

// --- it must never throw on a half-built row --------------------------------
// A null row gets an EMPTY label, not a guessed one. The table falls back to
// the raw status, and inventing "Inquiry" here would put a status on a row
// that has none — which is the same class of lie as the rest of tonight.
ok("no row at all does not invent a status", bookingDisplay(null).label, "");
ok("and does not throw", typeof bookingDisplay(null).color, "string");
ok("no status", typeof bookingDisplay({ paymentStatus: "paid" }).color, "string");

if (fails.length) {
  console.log("  " + pass + " passed, " + fails.length + " FAILED\n");
  for (const f of fails) console.log("  FAIL  " + f);
  process.exitCode = 1;
} else {
  console.log("  " + pass + "/" + pass + " passed — green paid, blue owing, red refused.");
}
