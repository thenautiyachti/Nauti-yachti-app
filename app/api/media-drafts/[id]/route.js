const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: { status?, reviewNote? }
// Setting status updates it; reviewedAt is stamped whenever status moves
// away from "pending". reviewNote is optional owner commentary either way.
async function PATCH(req, { params }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = params;
  const body = await req.json();
  const existing = await prisma.mediaDraft.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Media draft not found" }, { status: 404 });
  }

  if ("status" in body && !["pending", "approved", "rejected", "posted", "discussing"].includes(body.status)) {
    return NextResponse.json({ error: 'status must be "pending", "approved", "rejected", "posted", or "discussing"' }, { status: 400 });
  }

  const data = {};
  if ("status" in body) {
    data.status = body.status;
    if (body.status !== "pending" && existing.status === "pending") data.reviewedAt = new Date();
  }
  if ("reviewNote" in body) data.reviewNote = body.reviewNote || null;

  const updated = await prisma.mediaDraft.update({ where: { id }, data });
  return NextResponse.json(updated);
}

async function DELETE(req, { params }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = params;
  await prisma.mediaDraft.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
