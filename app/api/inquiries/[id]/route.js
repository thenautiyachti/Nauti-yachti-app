const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { recordCompletedBookingIncome } = require("../../../../lib/bookingLedger");

const {
  INQUIRY_STATUS_BUCKET,
  statusesAgree,
  inquiryStatusToBooking,
} = require("../../../../lib/bookingStatus");

// Derived, not retyped. This list was a hand-kept copy, and a status the
// console offered but this route rejected would have failed as a silent 400 on
// a dropdown that looked like it worked.
const INQUIRY_STATUSES = Object.keys(INQUIRY_STATUS_BUCKET);
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

  // KEEP THE MIRROR BOOKING IN STEP — the other half of the same problem.
  //
  // A website checkout leaves an Inquiry and a mirror ExternalBooking for one
  // charter. The bookings route now pushes its status here; this pushes the
  // other way, so it does not matter which tab the owner happens to be looking
  // at when he changes a charter's state.
  //
  // See the same block in app/api/external-bookings/[id]/route.js, and
  // lib/bookingStatus.js for why the comparison is on buckets.
  let bookingSynced = null;
  if ("status" in body) {
    const where = updated.bookingId
      ? { bookingId: updated.bookingId }
      : updated.stripeSessionId
        ? { platformRef: updated.stripeSessionId }
        : null;
    if (where) {
      const linked = await prisma.externalBooking.findFirst({ where });
      if (linked && !statusesAgree(updated.status, linked.status)) {
        const next = inquiryStatusToBooking(updated.status);
        if (next) {
          const b = await prisma.externalBooking.update({ where: { id: linked.id }, data: { status: next } });
          // Completing a charter has to recognise its money the same way here
          // as it does in the bookings tab, or the ledger silently misses a
          // website booking depending on which screen it was completed from.
          const ledgerCreated = await recordCompletedBookingIncome(prisma, b);
          bookingSynced = { id: linked.id, from: linked.status, to: next, ledgerCreated };
        }
      }
    }
  }

  return NextResponse.json({ ...updated, bookingSynced });
}

// Remove an inquiry outright. Mirrors the external-bookings route so the two
// halves of the bookings table behave the same -- until 11 Sep 2026 a booking
// taken by text could be deleted and a website inquiry could not, which is an
// asymmetry nothing in the code ever argued for.
//
// WHAT THIS COSTS, because it is not nothing: an inquiry is the only record
// that somebody asked and did not book. Deleting one removes a row from the
// funnel, so "lapsed" remains the right answer for a lead that simply went
// quiet. This is for the ones that should never have been a row at all.
//
// The guard against a mis-click is the confirm dialog in the console, which
// names the guest and the date and says there is no undo. Owner, 11 Sep 2026:
// "it's highly unlikely we will ever use the button and it asks us are we sure
// before just deleting it in case of accidental hit."
//
// Nothing references Inquiry by foreign key -- LedgerEntry hangs off
// ExternalBooking -- so this leaves no dangling rows behind it.
async function DELETE(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await prisma.inquiry.delete({ where: { id } });
  } catch (e) {
    // Already gone is the outcome the caller wanted, not an error to show.
    if (e && e.code === "P2025") return NextResponse.json({ ok: true });
    throw e;
  }
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
