// The agency modules against a real database.
//
// Everything in scripts/test-agency-split.js and test-agency-compliance.js runs
// on hand-built objects, which proves the arithmetic and proves nothing about
// whether Prisma returns the shapes that arithmetic expects. This seeds an
// actual schema, runs a month through lib/agency/store.js, and checks the
// figures that come back — including the carry-forward across two months, which
// is the only part that cannot be tested without persistence.
//
// Point DATABASE_URL at a THROWAWAY database. It deletes every Agency* row it
// finds before it starts.

// Bare node does not read .env the way `next dev` and the Prisma CLI do, so
// the connection string is loaded here. The environment wins over the file,
// which is how a one-off run points somewhere else without editing anything.
const fs = require("fs");
try {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

if (!process.env.DATABASE_URL) {
  console.error("\n  DATABASE_URL is not set. Point it at a THROWAWAY database.\n");
  process.exit(1);
}

const { prisma } = require("../lib/db");
const { periodReport, previousPeriod, validPeriod, currentPeriod } = require("../lib/agency/store");
const { parseStatement } = require("../lib/agency/statements");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(58) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

async function wipe() {
  await prisma.agencyEarning.deleteMany({});
  await prisma.agencyContentRequest.deleteMany({});
  await prisma.agencyComplianceRecord.deleteMany({});
  await prisma.agencyPayout.deleteMany({});
  await prisma.agencyAccount.deleteMany({});
  await prisma.agencyCreator.deleteMany({});
  await prisma.agencyExpense.deleteMany({});
  await prisma.agencyPartnerDraw.deleteMany({});
  await prisma.agencyRoyaltyRemittance.deleteMany({});
  await prisma.agencyPartner.deleteMany({});
  await prisma.agencySettings.deleteMany({});
}

async function main() {
  console.log("\n  PERIOD KEYS\n");
  ok("a good period passes", validPeriod("2026-09"), "2026-09");
  ok("month 13 does not", validPeriod("2026-13"), null);
  ok("an injection attempt does not", validPeriod("2026-09'; DROP TABLE"), null);
  ok("january's previous month is last december", previousPeriod("2026-01"), "2025-12");
  ok("october's is september", previousPeriod("2026-10"), "2026-09");
  ok("the current period is a valid one", validPeriod(currentPeriod()) !== null, true);

  await wipe();

  console.log("\n  SEEDING\n");
  await prisma.agencySettings.create({
    data: { id: "default", royaltyBasis: "net_profit", royaltyRateBp: 250 },
  });
  await prisma.agencyPartner.createMany({
    data: [
      { key: "owner", name: "Owner", shareBp: 5000 },
      { key: "david", name: "David Rodgers", shareBp: 5000 },
    ],
  });

  const ava = await prisma.agencyCreator.create({
    data: {
      stageName: "Ava", legalName: "A. Example", status: "active",
      dateOfBirth: "1998-03-11", creatorShareBp: 5000, splitBasis: "net",
      payoutMethod: "ach", payoutHandle: "****1234", payoutMinCents: 5000,
    },
  });
  const bea = await prisma.agencyCreator.create({
    data: {
      stageName: "Bea", status: "active", dateOfBirth: "1997-07-04",
      creatorShareBp: 6000, splitBasis: "net",
      payoutMethod: "wise", payoutHandle: "bea@example.com", payoutMinCents: 5000,
    },
  });

  const avaAccount = await prisma.agencyAccount.create({
    data: { creatorId: ava.id, handle: "ava_test", status: "live", platformFeeBp: 2000, postsPerWeek: 5 },
  });
  const beaAccount = await prisma.agencyAccount.create({
    data: { creatorId: bea.id, handle: "bea_test", status: "live", platformFeeBp: 2000, postsPerWeek: 4 },
  });

  const paperwork = (creatorId, kinds) =>
    prisma.agencyComplianceRecord.createMany({
      data: kinds.map((kind) => ({
        creatorId, kind, verifiedBy: "test", verifiedAt: new Date("2026-01-01"),
      })),
    });
  await paperwork(ava.id, ["government_id", "age_verification", "model_release", "content_license", "tax_form"]);
  // Bea is missing her tax form. Her payout should hold.
  await paperwork(bea.id, ["government_id", "age_verification", "model_release", "content_license"]);

  console.log("\n  IMPORTING A STATEMENT\n");
  const csv =
    "Date,Type,Gross,Fee,Net\n" +
    "2026-09-03,Subscription,\"$8,000.00\",\"$1,600.00\",\"$6,400.00\"\n";
  const parsed = parseStatement(csv, { accountId: avaAccount.id, platformFeeBp: 2000, importBatch: "batch1" });
  ok("the statement parsed one row", parsed.entries.length, 1);
  ok("with nothing rejected", parsed.rejected.length, 0);
  ok("into the right period", parsed.entries[0].period, "2026-09");
  await prisma.agencyEarning.createMany({ data: parsed.entries });

  await prisma.agencyEarning.create({
    data: {
      accountId: beaAccount.id, period: "2026-09", kind: "subscription",
      grossCents: 400000, platformFeeCents: 80000, netCents: 320000, earnedOn: "2026-09-05",
    },
  });
  await prisma.agencyExpense.createMany({
    data: [
      { period: "2026-09", category: "chatter", amountCents: 180000, incurredOn: "2026-09-30" },
      { period: "2026-09", category: "advertising", amountCents: 60000, incurredOn: "2026-09-30" },
    ],
  });

  console.log("\n  THE MONTH, END TO END\n");
  const report = await periodReport("2026-09", "2026-09-30");
  const s = report.settlement;

  ok("agency commission is $4,480", s.agencyGrossCents, 448000);
  ok("costs are $2,400", s.agencyExpenseCents, 240000);
  ok("net profit is $2,080", s.agencyNetProfitCents, 208000);
  ok("the royalty is $52", s.royalty.amountCents, 5200);
  ok("the other reading would be $112", s.royalty.alternateAmountCents, 11200);
  ok("$2,028 is left", s.distributableCents, 202800);
  ok("each partner draws $1,014", s.partnerDraws.map((d) => d.amountCents), [101400, 101400]);
  ok("the draws reconcile", s.partnerDraws.reduce((a, d) => a + d.amountCents, 0), s.distributableCents);
  ok("two creators earned", s.perCreator.length, 2);
  ok("nothing to warn about", s.warnings, []);

  console.log("\n  THE PAYOUT RUN\n");
  const rowFor = (name) => report.payoutPlan.rows.find((r) => r.stageName === name);
  ok("Ava is ready for $3,200", [rowFor("Ava").status, rowFor("Ava").dueCents], ["ready", 320000]);
  ok("Bea is held", rowFor("Bea").status, "held");
  ok("because of the tax form", rowFor("Bea").reason.includes("Tax form not on file"), true);
  ok("$3,200 is ready to send", report.payoutPlan.readyCents, 320000);
  ok("$1,920 is held", report.payoutPlan.heldCents, 192000);
  ok("and the blocked creator is counted", report.counts.blockedCreators, 1);

  console.log("\n  WRITING THE RUN, THEN CARRYING IT FORWARD\n");
  for (const row of report.payoutPlan.rows) {
    await prisma.agencyPayout.create({
      data: {
        creatorId: row.creatorId, period: "2026-09", amountCents: row.dueCents,
        status: row.status === "ready" ? "sent" : "held", holdReason: row.reason,
        sentAt: row.status === "ready" ? new Date() : null,
      },
    });
  }
  await prisma.agencyEarning.create({
    data: {
      accountId: beaAccount.id, period: "2026-10", kind: "subscription",
      grossCents: 100000, platformFeeCents: 20000, netCents: 80000, earnedOn: "2026-10-04",
    },
  });

  const october = await periodReport("2026-10", "2026-10-31");
  const beaOct = october.payoutPlan.rows.find((r) => r.stageName === "Bea");
  ok("September's held $1,920 carries into October", beaOct.carriedCents, 192000);
  ok("on top of October's $480", beaOct.earnedCents, 48000);
  ok("so $2,400 is now due", beaOct.dueCents, 240000);
  ok("and it is still held, because the form is still missing", beaOct.status, "held");
  ok("Ava's paid September does not carry",
    (october.payoutPlan.rows.find((r) => r.stageName === "Ava") || { carriedCents: 0 }).carriedCents, 0);

  console.log("\n  CLEARING THE HOLD\n");
  await prisma.agencyComplianceRecord.create({
    data: { creatorId: bea.id, kind: "tax_form", verifiedBy: "test", verifiedAt: new Date("2026-10-15") },
  });
  const cleared = await periodReport("2026-10", "2026-10-31");
  const beaCleared = cleared.payoutPlan.rows.find((r) => r.stageName === "Bea");
  ok("the hold lifts once the form is on file", beaCleared.status, "ready");
  ok("and the whole carried balance is payable", beaCleared.dueCents, 240000);
  ok("nobody is blocked now", cleared.counts.blockedCreators, 0);

  console.log("\n  THE MEDIA PIPELINE\n");
  await prisma.agencyContentRequest.createMany({
    data: [
      { creatorId: ava.id, accountId: avaAccount.id, title: "Beach set", mediaType: "photo", quantity: 12, dueOn: "2026-10-01", priority: "urgent" },
      { creatorId: bea.id, accountId: beaAccount.id, title: "Weekly set", mediaType: "photo", quantity: 5, dueOn: "2026-10-30", status: "submitted" },
    ],
  });
  const withMedia = await periodReport("2026-10", "2026-10-31");
  ok("two people are on the chase list", withMedia.chase.length, 2);
  ok("the most overdue is first", withMedia.chase[0].stageName, "Ava");
  ok("thirty days late", withMedia.chase[0].worstDaysLate, 30);
  ok("Bea's is waiting on our review, not hers",
    withMedia.chase.find((c) => c.stageName === "Bea").inReview.length, 1);
  ok("two open requests counted", withMedia.counts.openRequests, 2);

  console.log("\n  A MONTH WITH NOTHING IN IT\n");
  const empty = await periodReport("2026-01", "2026-01-31");
  ok("no revenue", empty.settlement.agencyGrossCents, 0);
  ok("no royalty owed", empty.settlement.royalty.amountCents, 0);
  ok("no division by zero in the expense apportionment", empty.settlement.royalty.coveredExpenseCents, 0);
  ok("no partner draws to make", empty.settlement.partnerDraws.map((d) => d.amountCents), [0, 0]);
  ok("and it does not throw", true, true);

  await wipe();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error("\n  THREW:", e.message, "\n");
  await prisma.$disconnect();
  process.exit(1);
});
