// Recurring bills: what they cost, and how much of that is the business's.
//
// This started as four rows and a monthly total. It is now the household's
// utilities as well, because the office is at home and a share of those is a
// real business cost — and that share is exactly what makes the arithmetic
// different from "add up the subscriptions".
//
// TWO RULES DO THE WORK HERE.
//
// 1. A BILL THAT HAS ENDED IS NOT A COST. The business moved in April 2026, so
//    for most of the tax year there are two of everything: two water accounts,
//    two electricity suppliers, two internet providers, two storage sites. An
//    ended account left counting toward the monthly total would double the bill
//    for every service, forever, and look perfectly plausible doing it.
//
// 2. NOT ALL OF A HOUSEHOLD BILL IS THE BUSINESS'S. Boat storage is 100%
//    business. The water at the house is not, and claiming it in full is a claim
//    the business never had. So the deductible figure is the cost times a share
//    the OWNER sets, and an unset share is counted as a question rather than as
//    a number.

const PREMISES = [
  "Home office — current (Conroe)",
  "Home office — previous (Rayford Road)",
  "Boat storage — current",
  "Boat storage — previous",
  "Not premises-related",
];

const SUBSCRIPTION_CATEGORIES = ["Storage", "Hosting", "Software", "Utilities", "Other"];
const BILLING_CYCLES = ["monthly", "yearly", "weekly"];

/** Any billing cycle as an equivalent monthly figure. */
function monthlyAmount(sub) {
  if (!sub) return 0;
  const amount = Number(sub.amount) || 0;
  if (sub.billingCycle === "yearly") return amount / 12;
  if (sub.billingCycle === "weekly") return amount * 4.33;
  return amount;
}

// An amount of exactly zero means NOBODY HAS FILLED IT IN. Several accounts were
// listed before their cost was known — the list is more useful with a known
// service and an unknown price than without the service at all — but a zero must
// read as a gap, not as "this is free".
function needsAmount(sub) {
  return !sub || !Number(sub.amount);
}

/** True when this is still being billed. `endedOn` is the fact; `active` follows it. */
function isRunning(sub, today = new Date().toISOString().slice(0, 10)) {
  if (!sub) return false;
  if (sub.endedOn && sub.endedOn <= today) return false;
  return sub.active !== false;
}

// The share of this bill the business actually bears, as a fraction, or null
// when it has not been decided. Null is NOT zero: zero is a decision that none
// of it is the business's, and null is nobody having looked yet.
function businessShare(sub) {
  if (!sub || sub.businessUsePct == null) return null;
  const pct = Number(sub.businessUsePct);
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, pct)) / 100;
}

/** Monthly cost attributable to the business, or null when the share is unset. */
function deductibleMonthly(sub) {
  const share = businessShare(sub);
  if (share === null) return null;
  return monthlyAmount(sub) * share;
}

/**
 * What the recurring bills add up to, kept honest about what is not known.
 *
 * `deductibleMonthly` deliberately EXCLUDES anything whose share is unset, and
 * `unsetShare` counts those separately, so the total is never quietly inflated
 * by a household bill nobody has apportioned.
 */
function summarise(subs, today = new Date().toISOString().slice(0, 10)) {
  const running = (subs || []).filter((s) => isRunning(s, today));
  let cost = 0, deductible = 0;
  const unsetShare = [], unknownAmount = [];
  for (const s of running) {
    cost += monthlyAmount(s);
    if (needsAmount(s)) unknownAmount.push(s);
    const d = deductibleMonthly(s);
    if (d === null) unsetShare.push(s);
    else deductible += d;
  }
  return {
    running,
    ended: (subs || []).filter((s) => !isRunning(s, today)),
    monthlyCost: cost,
    monthlyDeductible: deductible,
    annualCost: cost * 12,
    annualDeductible: deductible * 12,
    unsetShare,
    unknownAmount,
  };
}

// Two accounts with the same vendor at different addresses is the normal case
// here, not an error — but two RUNNING at once usually means an old one was
// never closed. That is the specific mistake this catches, since it looks
// exactly like a legitimate pair.
function overlappingDuplicates(subs, today = new Date().toISOString().slice(0, 10)) {
  const byVendor = new Map();
  for (const s of (subs || []).filter((x) => isRunning(x, today))) {
    const key = String(s.vendor || s.name || "").trim().toLowerCase();
    if (!key) continue;
    if (!byVendor.has(key)) byVendor.set(key, []);
    byVendor.get(key).push(s);
  }
  return [...byVendor.values()].filter((g) => g.length > 1);
}

module.exports = {
  PREMISES, SUBSCRIPTION_CATEGORIES, BILLING_CYCLES,
  monthlyAmount, needsAmount, isRunning, businessShare, deductibleMonthly,
  summarise, overlappingDuplicates,
};
