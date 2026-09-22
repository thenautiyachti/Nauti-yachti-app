const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { requireAdmin, bad } = require("../_guard");
const { validPeriod, periodReport } = require("../../../../lib/agency/store");

async function GET(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const period = validPeriod(new URL(req.url).searchParams.get("period"));
  const [partners, draws] = await Promise.all([
    prisma.agencyPartner.findMany({ orderBy: { key: "asc" } }),
    prisma.agencyPartnerDraw.findMany({
      where: period ? { period } : undefined,
      orderBy: [{ period: "desc" }, { partner: "asc" }],
    }),
  ]);
  return NextResponse.json({ partners, draws });
}

// Set who the partners are and how the residual divides.
//
// The set must total 100%. Rejected rather than normalised: a split quietly
// rescaled from 60/30 to 67/33 is not the agreement either partner made, and
// the error would only ever be noticed by whoever came out short.
async function PUT(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!Array.isArray(body.partners) || !body.partners.length) return bad("partners must be a non-empty array.");

  const active = body.partners.filter((p) => p.active !== false);
  const total = active.reduce((sum, p) => sum + Number(p.shareBp || 0), 0);
  if (total !== 10000) {
    return bad(`Active partner shares total ${total / 100}%. They must total exactly 100%.`);
  }
  for (const partner of body.partners) {
    if (!partner.key || !partner.name) return bad("Every partner needs a key and a name.");
  }

  const saved = [];
  for (const partner of body.partners) {
    saved.push(
      await prisma.agencyPartner.upsert({
        where: { key: partner.key },
        create: {
          key: partner.key,
          name: partner.name,
          email: partner.email || null,
          shareBp: Number(partner.shareBp),
          active: partner.active !== false,
        },
        update: {
          name: partner.name,
          email: partner.email || null,
          shareBp: Number(partner.shareBp),
          active: partner.active !== false,
        },
      })
    );
  }
  return NextResponse.json(saved);
}

// Record the draws for a month.
//
// The amount is frozen at the figure computed under the split in force at the
// time. A partner split that changes in June must not retroactively rewrite
// March's draw, and storing the result rather than recomputing it is the only
// thing that guarantees it does not.
async function POST(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  const period = validPeriod(body.period);
  if (!period) return bad("period must be YYYY-MM.");

  const report = await periodReport(period, new Date());

  // Creators and InnerWifi come before the partners in the waterfall, and a
  // draw taken while a creator is still owed is the partners paying themselves
  // with somebody else's money.
  if (report.payoutPlan.heldCount > 0 && !body.acknowledgeHolds) {
    return bad(
      `${report.payoutPlan.heldCount} creator payout(s) are on hold for this period. ` +
        `Clear them first, or repeat with acknowledgeHolds: true.`
    );
  }

  const saved = [];
  for (const draw of report.settlement.partnerDraws) {
    saved.push(
      await prisma.agencyPartnerDraw.upsert({
        where: { period_partner: { period, partner: draw.partner } },
        create: { period, partner: draw.partner, amountCents: draw.amountCents },
        update: { amountCents: draw.amountCents },
      })
    );
  }
  return NextResponse.json({ period, draws: saved });
}

async function PATCH(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.id) return bad("id is required.");
  if (body.status === "sent" && !body.reference) {
    return bad("Marking a draw sent requires a transfer reference.");
  }

  const data = {};
  for (const field of ["status", "reference", "note"]) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (body.status === "sent") data.sentAt = new Date();

  const draw = await prisma.agencyPartnerDraw.update({ where: { id: body.id }, data });
  return NextResponse.json(draw);
}

module.exports = { GET, PUT, POST, PATCH };
