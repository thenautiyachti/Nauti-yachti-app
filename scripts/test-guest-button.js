// Which text button a row offers, by the owner's rule of 18 September 2026:
//
//   "Text reminder would be for those who have paid. Otherwise all inquiries
//    and unpaid booking need a payment link. If booking and failed we need a
//    text about declined card option. If inquiry and failed, need a text about
//    declined card option as well."
//
// The rule that was wrong: the button was chosen by LIFECYCLE, so every booked
// row offered a reminder — the day, the time and the meeting point — including
// the five of six glow bookings where nobody had paid. The only way to send
// somebody their checkout link was to put the booking back to inquiry first.
//
// This tests the decision, not the rendering: payLink and the branch order are
// what decide it, and both are pure.
const { payLink } = require("../lib/guestTexts");

let pass = 0;
const fails = [];
function ok(label, got, want) {
  if (got === want) pass++;
  else fails.push(label + "  expected " + want + ", got " + got);
}

// Mirrors the branch order in AdminView's guestText(): a declined card is
// checked before lifecycle, then inquiry, then booked.
function whichButton(row) {
  const link = payLink(row);
  if (row.paymentFailedAt && row.paymentStatus !== "paid") return "declined";
  if (row.statusBucket === "inquiry") return link ? "payment link" : "confirm";
  if (row.statusBucket === "booked") {
    return (row.paymentStatus !== "paid" && link) ? "payment link" : "reminder";
  }
  return "other";
}

const P = (o) => ({ id: "row", priceQuoted: 100, ...o });

// --- paid gets a reminder ---------------------------------------------------
ok("booked and paid -> reminder",
  whichButton(P({ statusBucket: "booked", paymentStatus: "paid" })), "reminder");
ok("the crew riding free -> reminder, not a link for $0",
  whichButton(P({ statusBucket: "booked", paymentStatus: "paid", priceQuoted: 0 })), "reminder");

// --- everything unpaid gets the link ----------------------------------------
ok("booked and unpaid -> payment link",
  whichButton(P({ statusBucket: "booked", paymentStatus: "unpaid" })), "payment link");
ok("inquiry and unpaid -> payment link",
  whichButton(P({ statusBucket: "inquiry", paymentStatus: "unpaid" })), "payment link");

// A row with no price has nothing to charge, so there is no honest link to send.
ok("booked, unpaid, no price -> reminder rather than a broken link",
  whichButton(P({ statusBucket: "booked", paymentStatus: "unpaid", priceQuoted: null })), "reminder");
ok("inquiry, unpaid, no price -> ask them to confirm",
  whichButton(P({ statusBucket: "inquiry", paymentStatus: "unpaid", priceQuoted: null })), "confirm");

// --- a declined card wins over both, on either lifecycle --------------------
ok("inquiry and declined -> declined",
  whichButton(P({ statusBucket: "inquiry", paymentStatus: "unpaid", paymentFailedAt: new Date() })), "declined");
ok("booked and declined -> declined",
  whichButton(P({ statusBucket: "booked", paymentStatus: "unpaid", paymentFailedAt: new Date() })), "declined");
ok("declined but since paid -> reminder, not a stale decline",
  whichButton(P({ statusBucket: "booked", paymentStatus: "paid", paymentFailedAt: new Date() })), "reminder");

if (fails.length) {
  console.log("  " + pass + " passed, " + fails.length + " FAILED\n");
  for (const f of fails) console.log("  FAIL  " + f);
  process.exitCode = 1;
} else {
  console.log("  " + pass + "/" + pass + " passed — paid gets a reminder, everyone who owes gets a link, a declined card beats both.");
}
