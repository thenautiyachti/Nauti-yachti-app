const { NextResponse } = require("next/server");
const { checkCoupon } = require("../../../../lib/coupons");

// Public — no auth guard. Customers check a coupon code before/while
// checking out. Body: { code, email }. `email` is required for a
// requiresReturningGuest coupon — see lib/coupons.js. A bad code is an
// expected, everyday outcome (typo, expired, already used up, not a
// verified returning guest), never a 4xx/5xx — it always returns 200
// with { valid: false, reason }.
async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const result = await checkCoupon(body.code, body.email);
  if (!result.valid) {
    return NextResponse.json({ valid: false, reason: result.reason });
  }
  return NextResponse.json({
    valid: true,
    discountType: result.coupon.discountType,
    discountValue: result.coupon.discountValue,
  });
}

module.exports = { POST };
