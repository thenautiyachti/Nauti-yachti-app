const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { requireAdmin, bad } = require("../_guard");

const STATUSES = ["prospect", "onboarding", "active", "paused", "offboarded"];
const BASES = ["net", "gross"];

async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const creators = await prisma.agencyCreator.findMany({
    orderBy: [{ status: "asc" }, { stageName: "asc" }],
    include: { accounts: true, complianceDocs: true },
  });
  return NextResponse.json(creators);
}

async function POST(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.stageName) return bad("A stage name is required.");
  if (body.status && !STATUSES.includes(body.status)) return bad(`status must be one of ${STATUSES.join(", ")}`);
  if (body.splitBasis && !BASES.includes(body.splitBasis)) return bad("splitBasis must be 'net' or 'gross'");

  // The split is the term people get wrong, so it is validated rather than
  // clamped. A share silently corrected from 150% to 100% is a deal nobody
  // agreed to, discovered a month later in a payout.
  const shareBp = body.creatorShareBp === undefined ? 5000 : Number(body.creatorShareBp);
  if (!Number.isInteger(shareBp) || shareBp < 0 || shareBp > 10000) {
    return bad("creatorShareBp must be a whole number of basis points between 0 and 10000.");
  }

  const creator = await prisma.agencyCreator.create({
    data: {
      stageName: body.stageName,
      legalName: body.legalName || null,
      email: body.email || null,
      phone: body.phone || null,
      status: body.status || "prospect",
      dateOfBirth: body.dateOfBirth || null,
      creatorShareBp: shareBp,
      splitBasis: body.splitBasis || "net",
      payoutMethod: body.payoutMethod || null,
      payoutHandle: body.payoutHandle || null,
      payoutCurrency: body.payoutCurrency || "USD",
      payoutMinCents: Number.isFinite(Number(body.payoutMinCents)) ? Number(body.payoutMinCents) : 5000,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(creator);
}

async function PATCH(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.id) return bad("id is required.");
  if (body.status && !STATUSES.includes(body.status)) return bad(`status must be one of ${STATUSES.join(", ")}`);
  if (body.splitBasis && !BASES.includes(body.splitBasis)) return bad("splitBasis must be 'net' or 'gross'");
  if (body.creatorShareBp !== undefined) {
    const bp = Number(body.creatorShareBp);
    if (!Number.isInteger(bp) || bp < 0 || bp > 10000) return bad("creatorShareBp out of range.");
  }

  const fields = [
    "stageName", "legalName", "email", "phone", "status", "dateOfBirth",
    "creatorShareBp", "splitBasis", "payoutMethod", "payoutHandle",
    "payoutCurrency", "payoutMinCents", "notes",
  ];
  const data = {};
  for (const field of fields) {
    if (body[field] !== undefined) {
      data[field] = ["creatorShareBp", "payoutMinCents"].includes(field) ? Number(body[field]) : body[field];
    }
  }

  const creator = await prisma.agencyCreator.update({ where: { id: body.id }, data });
  return NextResponse.json(creator);
}

module.exports = { GET, POST, PATCH };
