const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { redeem } = require("../../../../lib/giftCertificates");

// PATCH { action: "redeem", amount, bookingId?, note? }
//        { action: "void" } | { action: "reactivate" }
//        { note?, expiresAt?, recipientName? }  -- plain field edits
//
// Redemption goes through lib/giftCertificates.redeem() rather than writing the
// balance directly, so every draw-down leaves an audit row and the balance can
// always be reconciled against its history.
async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body.action === "redeem") {
    try {
      const result = await redeem(id, body.amount, {
        bookingId: body.bookingId || null,
        note: body.note || null,
      });
      return NextResponse.json(result.certificate);
    } catch (err) {
      return NextResponse.json({ error: String(err.message || err) }, { status: 400 });
    }
  }

  const data = {};
  if (body.action === "void") data.status = "void";
  // Reactivating only makes sense while money remains on the card.
  if (body.action === "reactivate") {
    const cert = await prisma.giftCertificate.findUnique({ where: { id } });
    if (!cert) return NextResponse.json({ error: "Not found" }, { status: 404 });
    data.status = cert.balance > 0 ? "active" : "redeemed";
  }
  if ("note" in body) data.note = body.note || null;
  if ("expiresAt" in body) data.expiresAt = body.expiresAt || null;
  if ("recipientName" in body) data.recipientName = body.recipientName || null;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const updated = await prisma.giftCertificate.update({ where: { id }, data });
  return NextResponse.json(updated);
}

module.exports = { PATCH };
