const { prisma } = require("./db");

// Gift certificates: prepaid money with a depleting balance.
//
// Kept separate from coupons on purpose. A coupon is a discount rule the
// business grants; a gift certificate is cash a customer already handed over
// for a service not yet delivered. That difference matters on the books — an
// unredeemed balance is a LIABILITY, not income, and it only becomes revenue
// as it is redeemed. See redeem() below, which is why every draw-down is
// written to its own row rather than just decrementing a number.

// Ambiguous characters are excluded (no O/0, I/1, S/5) because these get read
// aloud over the phone and copied off a printed card.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
const CODE_PREFIX = "NY-GIFT-";

function generateCodeCandidate(length = 6) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `${CODE_PREFIX}${out}`;
}

/** A code that isn't already taken. Collisions are vanishingly rare but cheap to rule out. */
async function generateUniqueCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCodeCandidate();
    const clash = await prisma.giftCertificate.findUnique({ where: { code } });
    if (!clash) return code;
  }
  // 30^6 is ~729 million; ten collisions means something is very wrong.
  throw new Error("Could not generate an unused gift certificate code");
}

function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

function isExpired(cert, today) {
  if (!cert.expiresAt) return false;
  const day = today || new Date().toISOString().slice(0, 10);
  return cert.expiresAt < day;
}

/**
 * Judge a code without changing anything. Mirrors checkCoupon()'s shape so the
 * checkout route can treat both the same way.
 * Returns { ok: true, certificate } or { ok: false, reason }.
 */
async function checkGiftCertificate(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, reason: "No code supplied" };

  const cert = await prisma.giftCertificate.findUnique({ where: { code } });
  if (!cert) return { ok: false, reason: "That gift certificate code was not found" };
  if (cert.status === "void") return { ok: false, reason: "That gift certificate has been voided" };
  if (isExpired(cert)) return { ok: false, reason: "That gift certificate has expired" };
  if (cert.balance <= 0) return { ok: false, reason: "That gift certificate has already been fully redeemed" };

  return { ok: true, certificate: cert };
}

/** How much of `amount` this certificate can actually cover. */
function applicableAmount(certificate, amount) {
  const owed = Number(amount) || 0;
  const available = Number(certificate.balance) || 0;
  return Math.max(0, Math.min(owed, available));
}

/**
 * Draw down a certificate, writing both the new balance and an audit row in a
 * single transaction so a balance can never drift from its redemption history.
 * Re-reads the certificate inside the transaction so two simultaneous
 * redemptions cannot both spend the same balance.
 */
async function redeem(certificateId, amount, { bookingId = null, note = null } = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Redemption amount must be a positive number");
  }

  return prisma.$transaction(async (tx) => {
    const cert = await tx.giftCertificate.findUnique({ where: { id: certificateId } });
    if (!cert) throw new Error("Gift certificate not found");
    if (cert.status === "void") throw new Error("Gift certificate has been voided");
    if (isExpired(cert)) throw new Error("Gift certificate has expired");

    const take = applicableAmount(cert, value);
    if (take <= 0) throw new Error("Gift certificate has no balance left");

    // Round to cents so repeated partial redemptions cannot accumulate
    // floating-point drift into a balance that never quite reaches zero.
    const newBalance = Math.round((cert.balance - take) * 100) / 100;

    await tx.giftCertificateRedemption.create({
      data: { certificateId: cert.id, amount: take, bookingId, note },
    });

    const updated = await tx.giftCertificate.update({
      where: { id: cert.id },
      data: {
        balance: newBalance,
        status: newBalance <= 0 ? "redeemed" : cert.status,
      },
    });

    return { certificate: updated, redeemed: take };
  });
}

/**
 * Total money owed in unredeemed certificates. This is the liability figure —
 * cash already received for charters not yet run — and it should not be counted
 * as income until redeemed.
 */
async function outstandingLiability() {
  const rows = await prisma.giftCertificate.findMany({
    where: { status: "active" },
    select: { balance: true, expiresAt: true },
  });
  const today = new Date().toISOString().slice(0, 10);
  const live = rows.filter((r) => !r.expiresAt || r.expiresAt >= today);
  const total = live.reduce((sum, r) => sum + Number(r.balance || 0), 0);
  return { count: live.length, total: Math.round(total * 100) / 100 };
}

module.exports = {
  CODE_PREFIX,
  generateUniqueCode,
  normalizeCode,
  isExpired,
  checkGiftCertificate,
  applicableAmount,
  redeem,
  outstandingLiability,
};
