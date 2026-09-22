const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { requireAdmin, bad } = require("../_guard");
const { validPeriod, periodReport } = require("../../../../lib/agency/store");

async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const remittances = await prisma.agencyRoyaltyRemittance.findMany({ orderBy: { period: "desc" } });
  const owed = remittances
    .filter((r) => r.status === "pending")
    .reduce((sum, r) => sum + r.amountCents, 0);

  return NextResponse.json({
    remittances,
    owedCents: owed,
    // Every month's gap between the two readings of clause 4, added up. This is
    // the number to put in front of a lawyer: it is what the wording is worth
    // so far, and it only grows.
    ambiguityToDateCents: remittances.reduce(
      (sum, r) => sum + Math.abs(r.alternateAmountCents - r.amountCents), 0
    ),
  });
}

// Close a month and record what is owed to InnerWifi under clause 4.
//
// It stores the INPUTS, not just the total. The clause reads "2.5% Net Profit
// Share Of Agency Revenue", which names two different numbers, and if that
// wording is ever settled — by an addendum or by an argument — every closed
// month has to be recomputable on the settled reading. A stored total alone
// could not be, and reconstructing a year of revenue and costs after the fact
// is exactly the position nobody wants to be in during an audit.
async function POST(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  const period = validPeriod(body.period);
  if (!period) return bad("period must be YYYY-MM.");

  const report = await periodReport(period, new Date());
  const { royalty } = report.settlement;

  const record = await prisma.agencyRoyaltyRemittance.upsert({
    where: { period },
    create: {
      period,
      basis: royalty.basis,
      coveredRevenueCents: royalty.coveredRevenueCents,
      coveredExpenseCents: royalty.coveredExpenseCents,
      coveredProfitCents: royalty.coveredProfitCents,
      rateBp: royalty.rateBp,
      amountCents: royalty.amountCents,
      alternateAmountCents: royalty.alternateAmountCents,
    },
    update: {
      basis: royalty.basis,
      coveredRevenueCents: royalty.coveredRevenueCents,
      coveredExpenseCents: royalty.coveredExpenseCents,
      coveredProfitCents: royalty.coveredProfitCents,
      rateBp: royalty.rateBp,
      amountCents: royalty.amountCents,
      alternateAmountCents: royalty.alternateAmountCents,
    },
  });

  return NextResponse.json(record);
}

async function PATCH(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.id) return bad("id is required.");
  if (body.status === "sent" && !body.reference) {
    return bad("Marking a royalty payment sent requires a transfer reference.");
  }

  const data = {};
  for (const field of ["status", "reference", "note"]) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (body.status === "sent") data.sentAt = new Date();

  const record = await prisma.agencyRoyaltyRemittance.update({ where: { id: body.id }, data });
  return NextResponse.json(record);
}

module.exports = { GET, POST, PATCH };
