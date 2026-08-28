const { prisma } = require("./db");

// Looks up a coupon code case-insensitively and checks whether it can
// currently be applied: exists, is active, isn't expired, and is under its
// max-use cap (if any). Shared by the public /api/coupons/validate route and
// the checkout route, so a coupon is judged the same way in both places.
// Returns { valid: true, coupon } or { valid: false, reason }.
async function checkCoupon(code) {
  if (!code || !String(code).trim()) {
    return { valid: false, reason: "No code given" };
  }
  const normalized = String(code).trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code: normalized } });
  if (!coupon) return { valid: false, reason: "Coupon not found" };
  if (!coupon.active) return { valid: false, reason: "Coupon is not active" };
  if (coupon.expiresAt) {
    const today = new Date().toISOString().slice(0, 10);
    if (coupon.expiresAt < today) return { valid: false, reason: "Coupon has expired" };
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, reason: "Coupon has reached its usage limit" };
  }
  return { valid: true, coupon };
}

// discountType "percent": discountValue is 0-100. "fixed": a dollar amount.
// Never goes below $0.
function discountedAmount(discountType, discountValue, baseAmount) {
  const result =
    discountType === "percent"
      ? baseAmount * (1 - discountValue / 100)
      : baseAmount - discountValue;
  return Math.max(0, result);
}

module.exports = { checkCoupon, discountedAmount };
