const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: any subset of { active, discountType, discountValue, maxUses, expiresAt, note, requiresReturningGuest, archived }
// Only the fields present in the body are updated. Archiving also forces
// active:false (an archived coupon shouldn't be usable regardless of its
// own active flag); un-archiving does NOT auto-restore active — same
// restore-hidden-by-default pattern as AddOn archiving.
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
  if ("requiresReturningGuest" in body) data.requiresReturningGuest = !!body.requiresReturningGuest;
  if ("archived" in body) {
    data.archived = !!body.archived;
    if (data.archived) data.active = false;
  }

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
