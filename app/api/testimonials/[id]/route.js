const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: { status?, charterDate? }
//
// status — "pending" | "approved" | "rejected". reviewedAt is stamped whenever
// status moves away from "pending" — same convention as MediaDraft's PATCH
// route.
//
// charterDate — "YYYY-MM-DD", or null to clear it. This is the ONLY way it can
// ever be set: the public POST does not accept it (a review form should not ask
// a guest to remember a date, and the business already knows it), so before
// this route took it, every review submitted through the site was permanently
// undated and the site quietly dropped the "· sailed August 2025" line. The
// reviews that did show a month had been written straight into the database.
//
// Both fields are optional, but at least one has to be present — a PATCH that
// changes nothing is a caller bug worth reporting rather than a silent no-op.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.testimonial.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Testimonial not found" }, { status: 404 });
  }

  const hasStatus = body.status !== undefined;
  const hasDate = body.charterDate !== undefined;
  if (!hasStatus && !hasDate) {
    return NextResponse.json({ error: "nothing to update: send status, charterDate, or both" }, { status: 400 });
  }
  if (hasStatus && !["pending", "approved", "rejected"].includes(body.status)) {
    return NextResponse.json({ error: 'status must be "pending", "approved", or "rejected"' }, { status: 400 });
  }
  // An unparseable date is rejected rather than coerced. Storing a wrong month
  // against a named guest is worse than storing nothing: the line is public.
  if (hasDate && body.charterDate !== null && !ISO_DAY.test(String(body.charterDate))) {
    return NextResponse.json({ error: "charterDate must be YYYY-MM-DD, or null to clear" }, { status: 400 });
  }

  const data = {};
  if (hasStatus) {
    data.status = body.status;
    if (body.status !== "pending" && existing.status === "pending") data.reviewedAt = new Date();
  }
  if (hasDate) data.charterDate = body.charterDate === null ? null : String(body.charterDate);

  const updated = await prisma.testimonial.update({ where: { id }, data });
  return NextResponse.json(updated);
}

async function DELETE(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.testimonial.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
