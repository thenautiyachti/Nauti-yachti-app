const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

const INQUIRY_STATUSES = ["new", "lapsed", "pending", "booked", "completed", "cancelled"];
const REFUND_TYPES = ["full", "partial", "none"];

// Body: { status?, refundType?, refundAmount? }. refundType/refundAmount are
// only meaningful when status is "cancelled" — they're cleared automatically
// if status moves away from "cancelled" so a stale refund record can't
// linger on a booking that's no longer cancelled.
async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  const existing = await prisma.inquiry.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
  }

  const data = {};
  if ("status" in body) {
    if (!INQUIRY_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
    if (body.status !== "cancelled") {
      data.refundType = null;
      data.refundAmount = null;
    }
  }
  if ("refundType" in body) {
    if (body.refundType != null && !REFUND_TYPES.includes(body.refundType)) {
      return NextResponse.json({ error: "Invalid refundType" }, { status: 400 });
    }
    data.refundType = body.refundType || null;
  }
  // When a Google review was asked for. null clears the mark ("undo ask").
  // Stored server-side so the tick survives a cleared browser and follows the
  // owner between the phone and the desktop.
  if ("reviewRequestedAt" in body) {
    data.reviewRequestedAt = body.reviewRequestedAt ? new Date(body.reviewRequestedAt) : null;
  }
  if ("marketingOptOut" in body) {
    // "Never ask this one." Kept as a field rather than a deletion so the guest
    // stays on the record and the decision is visible, not just absent.
    data.marketingOptOut = Boolean(body.marketingOptOut);
  }
  if ("refundAmount" in body) {
    data.refundAmount = body.refundAmount === "" || body.refundAmount == null ? null : Number(body.refundAmount);
  }

  const updated = await prisma.inquiry.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

module.exports = { PATCH };
