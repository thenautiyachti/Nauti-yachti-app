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

// A NULL amount means nobody has found out what it costs. ZERO means free.
//
// Those were one value until 13 Sep 2026, when the platform accounts were
// actually checked: Supabase is on the free plan and Vercel on a personal
// account, both genuinely $0, while ElevenLabs, Blotato and the rest simply have
// no figure yet. Treating a confirmed nothing and an unanswered question as the
// same number would hide both — the free ones would look like gaps, and the gaps
// would look like they had been priced at nothing.
function needsAmount(sub) {
  return !sub || sub.amount == null;
}

/** Confirmed to cost nothing, as opposed to not yet known. */
function isFree(sub) {
  return !!sub && sub.amount != null && Number(sub.amount) === 0;
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
/**
 * PERSONAL SUBSCRIPTIONS ARE NOT THE BUSINESS'S, AND ARE NOT A 0% SHARE.
 *
 * The owner wanted one place to see everything he pays for monthly, Netflix
 * included, so duplicates and waste can be found across the lot. The danger is
 * the one his own bookkeeping rule names: personal spending drifting into
 * business deductions.
 *
 * A percentage is the wrong instrument for saying this. 0% would put Netflix in
 * the business's monthly cost and merely exclude it from the deductible half,
 * which is worse than useless — the headline figure on the tab would stop being
 * what the business spends. So the split happens BEFORE any arithmetic: every
 * business total below is computed from business rows only, and the personal
 * ones are summed separately and never mixed in.
 */
const isPersonal = (s) => !!(s && s.personal);
const businessOnly = (subs) => (subs || []).filter((s) => !isPersonal(s));
const personalOnly = (subs) => (subs || []).filter(isPersonal);

function summarise(subs, today = new Date().toISOString().slice(0, 10)) {
  const running = businessOnly(subs).filter((s) => isRunning(s, today));
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
    ended: businessOnly(subs).filter((s) => !isRunning(s, today)),
    monthlyCost: cost,
    monthlyDeductible: deductible,
    annualCost: cost * 12,
    annualDeductible: deductible * 12,
    unsetShare,
    unknownAmount,
    // Its own tally, deliberately outside every figure above.
    personal: summarisePersonal(subs, today),
  };
}

/**
 * The personal side: what it costs, and nothing about tax.
 *
 * There is no deductible figure here and there is not meant to be one. The
 * question this answers is "what am I paying every month for things I chose",
 * which is a spending question, not an accounting one.
 */
function summarisePersonal(subs, today = new Date().toISOString().slice(0, 10)) {
  const rows = personalOnly(subs);
  const running = rows.filter((s) => isRunning(s, today));
  let cost = 0;
  const unknownAmount = [];
  for (const s of running) {
    cost += monthlyAmount(s);
    if (needsAmount(s)) unknownAmount.push(s);
  }
  return {
    running,
    ended: rows.filter((s) => !isRunning(s, today)),
    monthlyCost: cost,
    annualCost: cost * 12,
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
    // Keyed by SIDE as well as vendor. A business Microsoft account and a
    // personal one are two accounts with the same supplier and nothing more —
    // pairing them would invent a duplicate that does not exist, and the point
    // of this check is the pair that is genuinely paying twice for one thing.
    const sideKey = (isPersonal(s) ? "p:" : "b:") + key;
    if (!byVendor.has(sideKey)) byVendor.set(sideKey, []);
    byVendor.get(sideKey).push(s);
  }
  return [...byVendor.values()].filter((g) => g.length > 1);
}

// MONEY THAT ALWAYS SHOWS CENTS.
//
// The console's shared currency() formats with toLocaleString and no fraction
// options, so it prints between zero and THREE decimals depending on the
// number. Package prices are round, so nobody ever saw it — until a tab full of
// apportioned bills started rendering group totals as $364.635 and $131.998.
//
// currency() is deliberately NOT changed: lib/pricing is shared with the public
// site, and turning every $850 package into $850.00 is a visible change to the
// storefront that nobody asked for. Bills get their own formatter instead.
// These are accounting figures and they should always carry cents.
function money(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = {
  PREMISES, SUBSCRIPTION_CATEGORIES, BILLING_CYCLES, money,
  monthlyAmount, needsAmount, isFree, isRunning, businessShare, deductibleMonthly,
  summarise, summarisePersonal, overlappingDuplicates, isPersonal,
};
