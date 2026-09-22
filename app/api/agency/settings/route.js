const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { requireAdmin, bad } = require("../_guard");
const { ROYALTY_BASES } = require("../../../../lib/agency/split");

async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const settings = await prisma.agencySettings.findUnique({ where: { id: "default" } });
  return NextResponse.json(
    settings || { id: "default", royaltyBasis: "net_profit", royaltyRateBp: 250, royaltyEndsOn: null }
  );
}

// Change how clause 4 is interpreted, or record that it has been settled.
//
// royaltyEndsOn exists for one outcome: an addendum that puts a term on a
// royalty which, as signed, has none. Nothing in the executed agreement
// supports a value here — it is null until there is a signed writing that says
// otherwise, and clause 19 means nothing short of that counts.
async function PUT(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (body.royaltyBasis && !ROYALTY_BASES.includes(body.royaltyBasis)) {
    return bad(`royaltyBasis must be one of ${ROYALTY_BASES.join(", ")}`);
  }
  if (body.royaltyRateBp !== undefined) {
    const bp = Number(body.royaltyRateBp);
    if (!Number.isInteger(bp) || bp < 0 || bp > 10000) return bad("royaltyRateBp out of range.");
  }
  if (body.royaltyEndsOn && !/^\d{4}-\d{2}-\d{2}$/.test(body.royaltyEndsOn)) {
    return bad("royaltyEndsOn must be YYYY-MM-DD.");
  }

  const data = {};
  if (body.royaltyBasis !== undefined) data.royaltyBasis = body.royaltyBasis;
  if (body.royaltyRateBp !== undefined) data.royaltyRateBp = Number(body.royaltyRateBp);
  if (body.royaltyEndsOn !== undefined) data.royaltyEndsOn = body.royaltyEndsOn || null;

  const settings = await prisma.agencySettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  return NextResponse.json(settings);
}

module.exports = { GET, PUT };
