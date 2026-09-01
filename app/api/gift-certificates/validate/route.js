const { NextResponse } = require("next/server");
const { checkGiftCertificate } = require("../../../../lib/giftCertificates");

// POST { code } -> is this certificate usable, and what is left on it?
//
// Public, like /api/coupons/validate: a guest needs to check a code before
// committing to a booking. It reveals only the balance and the masked code, not
// who bought it or their contact details.
async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const result = await checkGiftCertificate(body.code);
  if (!result.ok) {
    return NextResponse.json({ valid: false, reason: result.reason }, { status: 200 });
  }
  const c = result.certificate;
  return NextResponse.json({
    valid: true,
    code: c.code,
    balance: c.balance,
    expiresAt: c.expiresAt,
  });
}

module.exports = { POST };
