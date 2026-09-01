const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: { status } — "pending" | "approved" | "rejected". reviewedAt is
// stamped whenever status moves away from "pending" — same convention as
// MediaDraft's PATCH route.
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

  if (!["pending", "approved", "rejected"].includes(body.status)) {
    return NextResponse.json({ error: 'status must be "pending", "approved", or "rejected"' }, { status: 400 });
  }

  const data = { status: body.status };
  if (body.status !== "pending" && existing.status === "pending") data.reviewedAt = new Date();

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
