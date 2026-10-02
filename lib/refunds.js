// WHAT A REFUND DOES TO A BOOKING. Pure, so it can be tested.
//
// Owner, 1 Oct 2026: "We need to have a refunded status if that ever happens."
// When Stripe reports a refund, the Stripe webhook asks this what to write.
//
// Stripe's charge carries the CUMULATIVE amount refunded, not the latest slice,
// so every figure here is worked out from the total. That makes it safe to
// apply twice: Stripe retries webhooks, and a second partial refund arrives as
// a fresh event with the new running total.
//
//   full refund     status "refunded", paymentStatus "refunded"
//   partial refund  status left alone; the amount is recorded
//
// pricePaid on a booking row is what the guest actually paid, so it becomes the
// net: charged minus refunded. The original figure is kept in the note, so the
// record of what happened is never lost to the arithmetic.

function money(n) {
  return "$" + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
}

/** Is this refund the whole charge? */
function isFullRefund({ charged, refunded, stripeSaysFull }) {
  if (stripeSaysFull === true) return true;
  return Number(refunded) > 0 && Number(refunded) >= Number(charged) - 0.005;
}

/**
 * The fields to write on one row.
 *   row      the Inquiry or ExternalBooking as it is now
 *   kind     "inquiry" | "external"
 *   charged, refunded   dollars, refunded being Stripe's running total
 *   full     isFullRefund(...)
 *   day      "YYYY-MM-DD", for the note
 */
function refundUpdate({ row, kind, charged, refunded, full, day }) {
  const data = {};
  if (full) {
    data.status = "refunded";
    data.paymentStatus = "refunded";
  }
  if (kind === "inquiry") {
    data.refundType = full ? "full" : "partial";
    data.refundAmount = Math.round(Number(refunded) * 100) / 100;
    return data;
  }
  const net = Math.max(0, Math.round((Number(charged) - Number(refunded)) * 100) / 100);
  data.pricePaid = net;
  const line = "Refunded " + money(refunded) + " of " + money(charged)
    + (full ? " in full" : "") + " through Stripe" + (day ? " on " + day : "") + ".";
  const note = String((row && row.note) || "");
  if (!note.includes(line)) data.note = (note ? note + "\n" : "") + line;
  return data;
}

/** Has this row already recorded this running total? Then a retry changes nothing. */
function alreadyRecorded({ row, kind, refunded, full }) {
  if (!row) return false;
  const total = Math.round(Number(refunded) * 100) / 100;
  if (kind === "inquiry") {
    return Number(row.refundAmount) === total && (!full || row.status === "refunded");
  }
  return String(row.note || "").includes("Refunded " + money(refunded) + " of") && (!full || row.status === "refunded");
}

module.exports = { isFullRefund, refundUpdate, alreadyRecorded };
