const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { requireAdmin, bad } = require("../_guard");
const { validPeriod, currentPeriod, periodReport } = require("../../../../lib/agency/store");

async function GET(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const period = validPeriod(new URL(req.url).searchParams.get("period")) || currentPeriod();
  const report = await periodReport(period, new Date());
  return NextResponse.json(report.payoutPlan);
}

// Write the payout run for a period into rows that can be marked sent.
//
// THE HOLD IS RE-CHECKED HERE, not trusted from the client. The plan the
// console displayed may be minutes old, and the gap between a page load and a
// click is exactly long enough for a document to expire. A creator whose
// paperwork lapsed between the two gets a held row with a reason rather than a
// transfer, and a payout that was already sent is never overwritten.
async function POST(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  const period = validPeriod(body.period);
  if (!period) return bad("period must be YYYY-MM.");

  const report = await periodReport(period, new Date());
  const rows = report.payoutPlan.rows.filter((r) => r.status !== "sent");

  const written = [];
  for (const row of rows) {
    const record = await prisma.agencyPayout.upsert({
      where: { creatorId_period: { creatorId: row.creatorId, period } },
      create: {
        creatorId: row.creatorId,
        period,
        amountCents: row.dueCents,
        status: row.status === "ready" ? "pending" : "held",
        holdReason: row.reason,
        method: row.method,
      },
      update: {
        amountCents: row.dueCents,
        status: row.status === "ready" ? "pending" : "held",
        holdReason: row.reason,
        method: row.method,
      },
    });
    written.push(record);
  }

  return NextResponse.json({ period, written: written.length, payouts: written });
}

// Mark one payout actually sent.
//
// A reference is required. "Sent" without a transfer id cannot be reconciled
// against a bank statement, which makes it an assertion rather than a record —
// and the first time it matters is the first time a creator says they never
// got it.
async function PATCH(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.id) return bad("id is required.");

  const existing = await prisma.agencyPayout.findUnique({
    where: { id: body.id },
    include: { creator: true },
  });
  if (!existing) return bad("No such payout.");

  if (body.status === "sent") {
    if (existing.status === "held") {
      return bad(`This payout is on hold: ${existing.holdReason || "reason not recorded"}. Clear the hold first.`);
    }
    if (!body.reference) return bad("Marking a payout sent requires a transfer reference.");
  }

  const data = {};
  for (const field of ["status", "reference", "method", "note", "holdReason"]) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (body.status === "sent" && !existing.sentAt) data.sentAt = new Date();

  const payout = await prisma.agencyPayout.update({ where: { id: body.id }, data });
  return NextResponse.json(payout);
}

module.exports = { GET, POST, PATCH };
