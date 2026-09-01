const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");
const { generateUniqueCode, outstandingLiability } = require("../../../lib/giftCertificates");

// GET -> every certificate, newest first, plus the outstanding liability total.
async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const [certificates, liability] = await Promise.all([
    prisma.giftCertificate.findMany({
      orderBy: { issuedAt: "desc" },
      include: { redemptions: { orderBy: { redeemedAt: "desc" } } },
    }),
    outstandingLiability(),
  ]);
  return NextResponse.json({ certificates, liability });
}

// POST { initialAmount, purchaserName?, purchaserEmail?, purchaserPhone?,
//        recipientName?, message?, expiresAt?, note? }
// Issues a certificate by hand — the "someone asked us for one" path. Online
// purchases will set stripeSessionId instead.
async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const amount = Number(body.initialAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "initialAmount must be a positive number" }, { status: 400 });
  }

  const code = await generateUniqueCode();
  const cert = await prisma.giftCertificate.create({
    data: {
      code,
      initialAmount: amount,
      // Issued at face value; it only depletes through a recorded redemption.
      balance: amount,
      purchaserName: body.purchaserName || null,
      purchaserEmail: body.purchaserEmail || null,
      purchaserPhone: body.purchaserPhone || null,
      recipientName: body.recipientName || null,
      message: body.message || null,
      expiresAt: body.expiresAt || null,
      note: body.note || null,
    },
  });
  return NextResponse.json(cert, { status: 201 });
}

module.exports = { GET, POST };
