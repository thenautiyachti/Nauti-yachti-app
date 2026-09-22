const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { requireAdmin, bad } = require("../_guard");

const STATUSES = ["building", "live", "paused", "closed"];

async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const accounts = await prisma.agencyAccount.findMany({
    orderBy: [{ status: "asc" }, { handle: "asc" }],
    include: { creator: { select: { id: true, stageName: true, status: true } } },
  });
  return NextResponse.json(accounts);
}

async function POST(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.creatorId) return bad("creatorId is required.");
  if (!body.handle) return bad("A handle is required.");
  if (body.status && !STATUSES.includes(body.status)) return bad(`status must be one of ${STATUSES.join(", ")}`);

  // Turning royalty coverage OFF is a position on clause 4 that somebody may
  // have to defend in an audit years from now. It requires a written reason at
  // the moment the decision is made, while the facts are still known.
  if (body.royaltyCovered === false && !body.royaltyNote) {
    return bad("Excluding an account from the InnerWifi royalty requires a written reason (royaltyNote).");
  }

  const account = await prisma.agencyAccount.create({
    data: {
      creatorId: body.creatorId,
      platform: body.platform || "onlyfans",
      handle: body.handle,
      status: body.status || "building",
      launchedOn: body.launchedOn || null,
      platformFeeBp: Number.isFinite(Number(body.platformFeeBp)) ? Number(body.platformFeeBp) : 2000,
      postsPerWeek: Number.isFinite(Number(body.postsPerWeek)) ? Number(body.postsPerWeek) : 5,
      royaltyCovered: body.royaltyCovered !== false,
      royaltyNote: body.royaltyNote || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(account);
}

async function PATCH(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.id) return bad("id is required.");
  if (body.status && !STATUSES.includes(body.status)) return bad(`status must be one of ${STATUSES.join(", ")}`);

  const existing = await prisma.agencyAccount.findUnique({ where: { id: body.id } });
  if (!existing) return bad("No such account.");
  if (body.royaltyCovered === false && !(body.royaltyNote || existing.royaltyNote)) {
    return bad("Excluding an account from the InnerWifi royalty requires a written reason (royaltyNote).");
  }

  const data = {};
  for (const field of ["platform", "handle", "status", "launchedOn", "royaltyNote", "notes"]) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  for (const field of ["platformFeeBp", "postsPerWeek"]) {
    if (body[field] !== undefined) data[field] = Number(body[field]);
  }
  if (body.royaltyCovered !== undefined) data.royaltyCovered = Boolean(body.royaltyCovered);

  const account = await prisma.agencyAccount.update({ where: { id: body.id }, data });
  return NextResponse.json(account);
}

module.exports = { GET, POST, PATCH };
