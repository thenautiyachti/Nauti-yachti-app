// Where every dollar goes, in order.
//
// THE WATERFALL. A fan pays $100 for a subscription. Four parties take a slice
// and the order is not negotiable, because each one's share is computed from
// what is left after the one before it:
//
//   $100.00  fan pays                                    (grossCents)
//   -$20.00  OnlyFans takes 20%                          (platformFeeCents)
//   = $80.00 reaches the account                         (netCents)
//   -$40.00  creator's 50%                               (creatorCents)
//   = $40.00 agency commission                           (agencyCents)
//   -$12.00  agency costs — chatters, ads, software      (expenses)
//   = $28.00 agency net profit
//   -$0.70   InnerWifi, 2.5% — Sales Agreement clause 4  (royalty)
//   = $27.30 divides between the partners                (distributable)
//
// TWO PLACES THIS GOES WRONG IN REAL AGENCIES, both handled here:
//
// 1. splitBasis. The creator's percentage can attach to the gross or to the
//    net, and the contracts people sign rarely say which. A "50/50 deal" on
//    gross pays the creator $50 of the $80 that arrived — 62.5% — and the
//    agency clears $30, not $40. Signed by accident often enough that this
//    module computes the basis explicitly and warns when the result inverts.
//
// 2. The royalty basis. Clause 4 of the Inner Wifi Sales Agreement reads
//    "2.5% Net Profit Share Of Agency Revenue", which names two different
//    numbers. Rather than picking one quietly, this computes BOTH every month
//    and reports the gap, so the cost of the ambiguity is a figure on a screen
//    while the wording is still open to being fixed. See
//    docs/inner-wifi-agreement-review.md, item 1.

const { applyBp, allocate } = require("./money");

const ROYALTY_BASES = ["net_profit", "gross_revenue"];

const DEFAULT_SETTINGS = {
  royaltyBasis: "net_profit",
  royaltyRateBp: 250,
  royaltyEndsOn: null,
};

// --- one earning row ---------------------------------------------------------

// Divide a single statement line between the creator and the agency.
//
// netCents is taken from the row rather than recomputed from the fee rate. The
// statement is the authority on what actually arrived; the configured
// platformFeeBp is only a fallback for rows imported without it, and a
// disagreement between the two is surfaced as a warning rather than silently
// resolved in either direction.
function splitEarning(earning, creator, account) {
  const warnings = [];

  const grossCents = Math.trunc(earning.grossCents || 0);
  const feeBp = account && Number.isFinite(account.platformFeeBp) ? account.platformFeeBp : 2000;

  let platformFeeCents = Number.isFinite(earning.platformFeeCents)
    ? Math.trunc(earning.platformFeeCents)
    : applyBp(grossCents, feeBp);

  let netCents = Number.isFinite(earning.netCents)
    ? Math.trunc(earning.netCents)
    : grossCents - platformFeeCents;

  if (grossCents - platformFeeCents !== netCents) {
    warnings.push(
      `Statement line does not balance: gross ${grossCents} - fee ${platformFeeCents} != net ${netCents}`
    );
  }

  const shareBp = creator && Number.isFinite(creator.creatorShareBp) ? creator.creatorShareBp : 5000;
  const basis = creator && creator.splitBasis === "gross" ? "gross" : "net";
  const basisCents = basis === "gross" ? grossCents : netCents;

  const creatorCents = applyBp(basisCents, shareBp);
  const agencyCents = netCents - creatorCents;

  // A gross-basis split can pay out more than arrived. It is not an error — it
  // is a deal somebody signed — but it is never intentional, so it is named.
  if (agencyCents < 0) {
    warnings.push(
      `Creator share exceeds what the platform paid out: a ${shareBp / 100}% split on ` +
        `GROSS leaves the agency ${agencyCents} cents on this line. Check splitBasis.`
    );
  }

  return { grossCents, platformFeeCents, netCents, basisCents, creatorCents, agencyCents, warnings };
}

// --- a whole month -----------------------------------------------------------

function indexBy(rows, key) {
  const map = new Map();
  for (const row of rows || []) map.set(row[key], row);
  return map;
}

// Settle one period end to end.
//
// Everything it needs is passed in; it reads no database and holds no state, so
// the same inputs always produce the same statement. That matters because this
// function's output is what somebody gets paid on, and a number that cannot be
// reproduced from stored inputs cannot be defended when it is questioned.
function settlePeriod({
  period,
  earnings = [],
  accounts = [],
  creators = [],
  expenses = [],
  partners = [],
  settings = {},
}) {
  const config = { ...DEFAULT_SETTINGS, ...settings };
  const warnings = [];

  const accountById = indexBy(accounts, "id");
  const creatorById = indexBy(creators, "id");

  // --- per account and per creator ------------------------------------------
  const perCreator = new Map();
  const perAccount = new Map();

  // Revenue the royalty attaches to, tracked separately from total revenue.
  // Clause 4 excludes accounts that do not use InnerWifi's resources, and
  // AgencyAccount.royaltyCovered records that decision per account.
  let agencyGrossCents = 0;
  let coveredRevenueCents = 0;

  for (const earning of earnings) {
    if (period && earning.period && earning.period !== period) continue;

    const account = accountById.get(earning.accountId);
    if (!account) {
      warnings.push(`Earning ${earning.id || "(no id)"} references an unknown account; skipped.`);
      continue;
    }
    const creator = creatorById.get(account.creatorId);
    if (!creator) {
      warnings.push(`Account ${account.handle || account.id} has no creator on file; skipped.`);
      continue;
    }

    const line = splitEarning(earning, creator, account);
    for (const w of line.warnings) {
      warnings.push(`${creator.stageName || creator.id}: ${w}`);
    }

    const creatorRow = perCreator.get(creator.id) || {
      creatorId: creator.id,
      stageName: creator.stageName,
      creatorShareBp: creator.creatorShareBp,
      splitBasis: creator.splitBasis,
      grossCents: 0,
      platformFeeCents: 0,
      netCents: 0,
      creatorCents: 0,
      agencyCents: 0,
      lineCount: 0,
    };
    creatorRow.grossCents += line.grossCents;
    creatorRow.platformFeeCents += line.platformFeeCents;
    creatorRow.netCents += line.netCents;
    creatorRow.creatorCents += line.creatorCents;
    creatorRow.agencyCents += line.agencyCents;
    creatorRow.lineCount += 1;
    perCreator.set(creator.id, creatorRow);

    const accountRow = perAccount.get(account.id) || {
      accountId: account.id,
      handle: account.handle,
      platform: account.platform,
      creatorId: creator.id,
      stageName: creator.stageName,
      royaltyCovered: account.royaltyCovered !== false,
      grossCents: 0,
      netCents: 0,
      creatorCents: 0,
      agencyCents: 0,
    };
    accountRow.grossCents += line.grossCents;
    accountRow.netCents += line.netCents;
    accountRow.creatorCents += line.creatorCents;
    accountRow.agencyCents += line.agencyCents;
    perAccount.set(account.id, accountRow);

    agencyGrossCents += line.agencyCents;
    if (account.royaltyCovered !== false) coveredRevenueCents += line.agencyCents;
  }

  // --- costs ----------------------------------------------------------------
  const agencyExpenseCents = (expenses || [])
    .filter((e) => (!period || !e.period || e.period === period) && e.agencyAttributable !== false)
    .reduce((sum, e) => sum + Math.trunc(e.amountCents || 0), 0);

  const agencyNetProfitCents = agencyGrossCents - agencyExpenseCents;

  // Expenses are recorded for the agency as a whole, not per account, so the
  // share of them belonging to royalty-covered revenue is apportioned by that
  // revenue's share of the total. Crude, and the honest alternative — tagging
  // every chatter hour to an account — is not something anybody sustains. When
  // every account is covered, which is the normal case, the apportionment is
  // the identity and this costs nothing.
  const coveredExpenseCents =
    agencyGrossCents === 0
      ? 0
      : allocate(agencyExpenseCents, [
          Math.max(0, coveredRevenueCents),
          Math.max(0, agencyGrossCents - coveredRevenueCents),
        ])[0];

  const coveredProfitCents = coveredRevenueCents - coveredExpenseCents;

  // --- the royalty ----------------------------------------------------------
  const rateBp = Number.isFinite(config.royaltyRateBp) ? config.royaltyRateBp : 250;
  const basis = ROYALTY_BASES.includes(config.royaltyBasis) ? config.royaltyBasis : "net_profit";

  // An addendum could put an end date on clause 4. Nothing signed has one, so
  // this is null in practice — but a perpetual obligation with no way to record
  // its own end is a system that cannot represent the outcome everyone wants.
  const expired = config.royaltyEndsOn && period && period > String(config.royaltyEndsOn).slice(0, 7);

  // A loss month owes nothing on the net-profit reading, and the revenue
  // reading does not care that there was a loss. That divergence is the clearest
  // illustration of why the wording matters, and it shows up on screen as a
  // month where one figure is zero and the other is not.
  const onNetProfit = expired ? 0 : applyBp(Math.max(0, coveredProfitCents), rateBp);
  const onGrossRevenue = expired ? 0 : applyBp(Math.max(0, coveredRevenueCents), rateBp);

  const royaltyCents = basis === "gross_revenue" ? onGrossRevenue : onNetProfit;
  const alternateCents = basis === "gross_revenue" ? onNetProfit : onGrossRevenue;

  // --- the residual ---------------------------------------------------------
  const distributableCents = agencyNetProfitCents - royaltyCents;

  const activePartners = (partners || []).filter((p) => p.active !== false);
  const shareSum = activePartners.reduce((sum, p) => sum + (p.shareBp || 0), 0);
  if (activePartners.length && shareSum !== 10000) {
    warnings.push(
      `Partner shares total ${shareSum / 100}%, not 100%. The residual has been divided in ` +
        `proportion, but the split needs fixing before anyone is paid on it.`
    );
  }

  const amounts = allocate(
    distributableCents,
    activePartners.map((p) => p.shareBp || 0)
  );
  const partnerDraws = activePartners.map((p, i) => ({
    partner: p.key,
    name: p.name,
    shareBp: p.shareBp,
    amountCents: amounts[i],
  }));

  return {
    period,
    perCreator: [...perCreator.values()].sort((a, b) => b.agencyCents - a.agencyCents),
    perAccount: [...perAccount.values()].sort((a, b) => b.agencyCents - a.agencyCents),

    agencyGrossCents,
    agencyExpenseCents,
    agencyNetProfitCents,

    creatorOwedCents: [...perCreator.values()].reduce((s, c) => s + c.creatorCents, 0),

    royalty: {
      basis,
      rateBp,
      coveredRevenueCents,
      coveredExpenseCents,
      coveredProfitCents,
      amountCents: royaltyCents,
      alternateAmountCents: alternateCents,
      // What the unresolved wording is worth this month, in dollars. Always
      // reported as a magnitude: the point is the size of the disagreement.
      ambiguityCents: Math.abs(onGrossRevenue - onNetProfit),
      expired: Boolean(expired),
    },

    distributableCents,
    partnerDraws,
    warnings,
  };
}

module.exports = { splitEarning, settlePeriod, ROYALTY_BASES, DEFAULT_SETTINGS };
