const { prisma } = require("./db");

// Looks up a coupon code case-insensitively and checks whether it can
// currently be applied: exists, is active, isn't expired, is under its
// max-use cap (if any), and — for a requiresReturningGuest coupon — that the
// submitted email actually matches a prior PAID booking. Shared by the
// public /api/coupons/validate route and the checkout route, so a coupon is
// judged the same way in both places.
// Returns { valid: true, coupon } or { valid: false, reason }.
async function checkCoupon(code, email) {
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
  if (coupon.requiresReturningGuest) {
    // Only checks the site's own Inquiry table — a prior booking placed
    // directly through thenautiyachti.com with a completed payment. This
    // can't see past Boatsetter/GetMyBoat guests since those platforms
    // don't hand the business a usable email address for them; a genuine
    // past third-party-platform guest has to be verified by the owner
    // manually (Bookings tab, search by name) rather than automatically.
    if (!email || !String(email).trim()) {
      return { valid: false, reason: "This code is for returning guests — enter the email you booked with before." };
    }
    const priorBooking = await prisma.inquiry.findFirst({
      where: {
        email: { equals: String(email).trim(), mode: "insensitive" },
        paymentStatus: "paid",
      },
    });
    if (!priorBooking) {
      return {
        valid: false,
        reason: "We couldn't find a previous paid booking under that email. If you booked with us through Boatsetter or GetMyBoat before, contact us directly and we'll get you set up.",
      };
    }
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
