// Loading a month out of the database and handing it to the pure modules.
//
// Everything in lib/agency/ except this file is pure: given the same rows it
// returns the same figures, reads nothing, writes nothing. That is deliberate —
// the settlement is what somebody gets paid on, so it has to be reproducible
// from stored inputs rather than from whatever the database happened to look
// like at the moment a page loaded.
//
// This is the one place that talks to Prisma. It is also the boundary the
// charter business must never cross: every query below is against an Agency*
// table, and nothing here can see a LedgerEntry. See the note above the agency
// models in prisma/schema.prisma for why that separation is contractual rather
// than cosmetic.

const { prisma } = require("../db");
const { settlePeriod } = require("./split");
const { planPayouts } = require("./payouts");
const { chaseList, cadenceHealth } = require("./pipeline");
const { creatorCompliance } = require("./compliance");

// "YYYY-MM", or null if it is not one. Every period arrives from a query string
// and goes into a database filter, so it gets checked rather than trusted.
function validPeriod(period) {
  return typeof period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : null;
}

function currentPeriod(today) {
  const d = today instanceof Date ? today : new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// The month before a given one. Needed because unsent payouts carry forward,
// and a payout run that cannot see last month's holds would quietly drop them.
function previousPeriod(period) {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

async function loadSettings() {
  const [settings, partners] = await Promise.all([
    prisma.agencySettings.findUnique({ where: { id: "default" } }),
    prisma.agencyPartner.findMany({ orderBy: { key: "asc" } }),
  ]);
  return {
    settings: settings || { id: "default", royaltyBasis: "net_profit", royaltyRateBp: 250, royaltyEndsOn: null },
    partners,
  };
}

// Everything one period needs, in one round trip's worth of queries.
async function loadPeriod(period) {
  const [creators, accounts, earnings, expenses, payouts, complianceRows, requests, config] =
    await Promise.all([
      prisma.agencyCreator.findMany({ orderBy: { stageName: "asc" } }),
      prisma.agencyAccount.findMany(),
      prisma.agencyEarning.findMany({ where: { period } }),
      prisma.agencyExpense.findMany({ where: { period } }),
      prisma.agencyPayout.findMany({ where: { period: { in: [period, previousPeriod(period)] } } }),
      prisma.agencyComplianceRecord.findMany(),
      prisma.agencyContentRequest.findMany(),
      loadSettings(),
    ]);

  const complianceRecords = {};
  for (const row of complianceRows) {
    (complianceRecords[row.creatorId] = complianceRecords[row.creatorId] || []).push(row);
  }

  return { period, creators, accounts, earnings, expenses, payouts, complianceRecords, requests, ...config };
}

// The whole picture for one month: the waterfall, the payout run, the chase
// list, and every compliance blocker outstanding.
async function periodReport(period, today) {
  const data = await loadPeriod(period);

  const settlement = settlePeriod({
    period,
    earnings: data.earnings,
    accounts: data.accounts,
    creators: data.creators,
    expenses: data.expenses,
    partners: data.partners,
    settings: data.settings,
  });

  // What went unsent last month rolls into this one. Read from the stored
  // payout rows rather than recomputed, because a hold that was cleared and
  // paid late must not carry twice.
  const carryForward = {};
  const prior = previousPeriod(period);
  for (const payout of data.payouts) {
    if (payout.period === prior && payout.status !== "sent" && payout.status !== "cancelled") {
      carryForward[payout.creatorId] = (carryForward[payout.creatorId] || 0) + payout.amountCents;
    }
  }

  const payoutPlan = planPayouts({
    period,
    settlement,
    creators: data.creators,
    complianceRecords: data.complianceRecords,
    existingPayouts: data.payouts.filter((p) => p.period === period),
    carryForward,
    today,
  });

  const compliance = data.creators.map((creator) => ({
    creatorId: creator.id,
    stageName: creator.stageName,
    status: creator.status,
    ...creatorCompliance(creator, data.complianceRecords[creator.id] || [], today),
  }));

  const liveAccounts = data.accounts.filter((a) => a.status === "live");

  return {
    period,
    settlement,
    payoutPlan,
    chase: chaseList(data.creators, data.requests, today),
    cadence: liveAccounts.map((a) => cadenceHealth(a, data.requests, { today })),
    compliance,
    counts: {
      creators: data.creators.length,
      activeCreators: data.creators.filter((c) => c.status === "active").length,
      accounts: data.accounts.length,
      liveAccounts: liveAccounts.length,
      blockedCreators: compliance.filter((c) => !c.payable).length,
      openRequests: data.requests.filter((r) => ["requested", "submitted"].includes(r.status)).length,
    },
    settings: data.settings,
    partners: data.partners,
  };
}

module.exports = { validPeriod, currentPeriod, previousPeriod, loadSettings, loadPeriod, periodReport };
