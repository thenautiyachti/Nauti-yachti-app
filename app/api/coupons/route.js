const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(coupons);
}

// Body: { code, discountType, discountValue, maxUses?, expiresAt?, note?, requiresReturningGuest? }
async function POST(req) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  const { code, discountType, discountValue, maxUses, expiresAt, note, requiresReturningGuest } = body;

  if (!code || !String(code).trim()) {
    return NextResponse.json({ error: "Code is required" }, { status: 400 });
  }
  if (!["percent", "fixed"].includes(discountType)) {
    return NextResponse.json({ error: 'discountType must be "percent" or "fixed"' }, { status: 400 });
  }
  const value = Number(discountValue);
  if (!value || value <= 0) {
    return NextResponse.json({ error: "discountValue must be a positive number" }, { status: 400 });
  }

  const normalizedCode = String(code).trim().toUpperCase();
  const existing = await prisma.coupon.findUnique({ where: { code: normalizedCode } });
  if (existing) {
    return NextResponse.json({ error: `Coupon code "${normalizedCode}" already exists` }, { status: 409 });
  }

  const coupon = await prisma.coupon.create({
    data: {
      code: normalizedCode,
      discountType,
      discountValue: value,
      maxUses: maxUses ? Number(maxUses) : null,
      expiresAt: expiresAt || null,
      note: note || null,
      requiresReturningGuest: !!requiresReturningGuest,
    },
  });
  return NextResponse.json(coupon);
}

module.exports = { GET, POST };
