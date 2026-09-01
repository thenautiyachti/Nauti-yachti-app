const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");

// GET ?session_id=cs_... -> the certificate minted for that Stripe session.
//
// Public by necessity: the buyer lands here straight from Stripe and this is
// the reliable delivery path for the code (email may not reach a customer until
// the sending domain is verified). A Stripe session id is long, random and
// known only to the buyer, so it acts as the capability to view this one
// certificate — the same reasoning the booking-success page already relies on.
// Only the code, value and message are returned; never the purchaser's details.
async function GET(req) {
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }
  const cert = await prisma.giftCertificate.findFirst({
    where: { stripeSessionId: sessionId },
    select: { code: true, initialAmount: true, balance: true, recipientName: true, message: true, expiresAt: true },
  });
  if (!cert) {
    // The webhook may not have landed yet — the page polls rather than
    // treating this as a failure.
    return NextResponse.json({ ready: false }, { status: 200 });
  }
  return NextResponse.json({ ready: true, certificate: cert });
}

module.exports = { GET };
