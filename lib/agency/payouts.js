// What each creator is owed for a month, and whether it can actually be sent.
//
// The settlement in lib/agency/split.js answers "how much". This answers the
// two questions that come after it and are the ones that cause arguments:
// whether it is clear to go, and whether anything is left over from last month.
//
// THREE OUTCOMES, NOT TWO. A payout is ready, held, or below the threshold —
// and the last two are different in a way that matters to the person waiting:
//   held      — we are not sending it, and here is the document to send us
//   deferred  — we are not sending it YET, it is $18, it rolls into next month
// Collapsing those into "unpaid" is how a creator concludes they are being
// stalled, which is the accusation that ends the relationship.

const { creatorCompliance } = require("./compliance");

// Build the payout run for a period.
//
// `alreadyPaid` carries forward: amounts settled in earlier periods that were
// never sent, keyed by creator. A creator under the minimum for three months
// running should be paid in the fourth, and nothing computes that unless the
// carry is an input.
function planPayouts({
  period,
  settlement,
  creators = [],
  complianceRecords = {},
  existingPayouts = [],
  carryForward = {},
  today,
}) {
  const creatorById = new Map((creators || []).map((c) => [c.id, c]));
  const paidById = new Map();
  for (const payout of existingPayouts || []) {
    if (payout.period === period) paidById.set(payout.creatorId, payout);
  }

  const rows = ((settlement && settlement.perCreator) || []).map((line) => {
    const creator = creatorById.get(line.creatorId) || {};
    const records = complianceRecords[line.creatorId] || [];
    const compliance = creatorCompliance(creator, records, today);

    const carriedCents = Math.trunc(carryForward[line.creatorId] || 0);
    const earnedCents = line.creatorCents;
    const dueCents = earnedCents + carriedCents;

    const minimum = Number.isFinite(creator.payoutMinCents) ? creator.payoutMinCents : 5000;
    const existing = paidById.get(line.creatorId) || null;

    let status;
    let reason = null;

    if (existing && existing.status === "sent") {
      status = "sent";
    } else if (!compliance.payable) {
      status = "held";
      reason = compliance.payBlockers.join(" ");
    } else if (dueCents <= 0) {
      // A negative balance is a real thing — refunds and chargebacks claw back
      // money already split. It carries rather than being sent as a zero, and
      // it is visible, because a creator whose next payout is short deserves to
      // be told why before they notice.
      status = "deferred";
      reason =
        dueCents < 0
          ? `Balance is negative after refunds. Carries into the next period.`
          : `Nothing earned this period.`;
    } else if (dueCents < minimum) {
      status = "deferred";
      reason = `Below the ${minimum / 100} minimum. Carries into the next period.`;
    } else {
      status = "ready";
    }

    return {
      creatorId: line.creatorId,
      stageName: line.stageName || creator.stageName || line.creatorId,
      period,
      earnedCents,
      carriedCents,
      dueCents,
      minimumCents: minimum,
      status,
      reason,
      method: creator.payoutMethod || null,
      handle: creator.payoutHandle || null,
      compliance: {
        payable: compliance.payable,
        blockers: compliance.payBlockers,
        expiringSoon: compliance.expiringSoon,
      },
      existingPayoutId: existing ? existing.id : null,
    };
  });

  const total = (status) =>
    rows.filter((r) => r.status === status).reduce((sum, r) => sum + r.dueCents, 0);

  return {
    period,
    rows: rows.sort((a, b) => {
      // Held first. It is the only status with an action attached, and burying
      // it under fifteen ready rows is how a hold survives three months.
      const rank = { held: 0, ready: 1, deferred: 2, sent: 3 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.dueCents - a.dueCents;
    }),
    readyCents: total("ready"),
    heldCents: total("held"),
    deferredCents: total("deferred"),
    sentCents: total("sent"),
    heldCount: rows.filter((r) => r.status === "held").length,
  };
}

// What rolls into the next period, keyed by creator.
//
// Anything not sent carries — held and deferred alike. A held payout that
// vanished because the month closed would be a creator working for free, and
// the paperwork problem that caused the hold is usually resolved a week later.
function carryFrom(plan) {
  const carry = {};
  for (const row of (plan && plan.rows) || []) {
    if (row.status === "held" || row.status === "deferred") carry[row.creatorId] = row.dueCents;
  }
  return carry;
}

module.exports = { planPayouts, carryFrom };
