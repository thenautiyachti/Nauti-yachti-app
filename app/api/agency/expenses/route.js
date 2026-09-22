const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { requireAdmin, bad } = require("../_guard");
const { validPeriod } = require("../../../../lib/agency/store");
const { parseMoneyToCents } = require("../../../../lib/agency/money");

const CATEGORIES = ["chatter", "va", "advertising", "software", "processing", "content", "legal", "other"];

async function GET(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const period = validPeriod(new URL(req.url).searchParams.get("period"));
  const expenses = await prisma.agencyExpense.findMany({
    where: period ? { period } : undefined,
    orderBy: { incurredOn: "desc" },
  });
  return NextResponse.json(expenses);
}

// Every expense recorded here reduces what the agency owes InnerWifi under the
// net-profit reading of clause 4, and increases it by omission. Which makes
// this the one table where sloppy bookkeeping has a counterparty.
async function POST(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.category || !CATEGORIES.includes(body.category)) {
    return bad(`category must be one of ${CATEGORIES.join(", ")}`);
  }
  if (!body.incurredOn) return bad("incurredOn is required.");

  const amountCents =
    body.amountCents !== undefined ? Number(body.amountCents) : parseMoneyToCents(body.amount);
  if (!Number.isFinite(amountCents) || amountCents === 0) {
    return bad("A readable, non-zero amount is required.");
  }

  const period = validPeriod(body.period) || String(body.incurredOn).slice(0, 7);
  if (!validPeriod(period)) return bad("period must be YYYY-MM.");

  const expense = await prisma.agencyExpense.create({
    data: {
      period,
      category: body.category,
      vendor: body.vendor || null,
      amountCents: Math.trunc(amountCents),
      note: body.note || null,
      incurredOn: body.incurredOn,
      agencyAttributable: body.agencyAttributable !== false,
    },
  });
  return NextResponse.json(expense);
}

module.exports = { GET, POST };
