const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: any subset of { active, discountType, discountValue, maxUses, expiresAt, note }
// Only the fields present in the body are updated.
async function PATCH(req, { params }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = params;
  const body = await req.json();
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
  }

  if ("discountType" in body && !["percent", "fixed"].includes(body.discountType)) {
    return NextResponse.json({ error: 'discountType must be "percent" or "fixed"' }, { status: 400 });
  }

  const data = {};
  if ("active" in body) data.active = !!body.active;
  if ("discountType" in body) data.discountType = body.discountType;
  if ("discountValue" in body) data.discountValue = Number(body.discountValue);
  if ("maxUses" in body) data.maxUses = body.maxUses === "" || body.maxUses == null ? null : Number(body.maxUses);
  if ("expiresAt" in body) data.expiresAt = body.expiresAt || null;
  if ("note" in body) data.note = body.note || null;

  const updated = await prisma.coupon.update({ where: { id }, data });
  return NextResponse.json(updated);
}

async function DELETE(req, { params }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = params;
  await prisma.coupon.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
