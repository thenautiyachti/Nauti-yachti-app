const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: any subset of { name, category, amount, billingCycle, nextDueDate, vendor, note, active }
// Only the fields present in the body are updated — used both for inline
// field edits and for the active-toggle button.
async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.subscription.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  if ("billingCycle" in body && !["monthly", "yearly", "weekly"].includes(body.billingCycle)) {
    return NextResponse.json({ error: 'billingCycle must be "monthly", "yearly", or "weekly"' }, { status: 400 });
  }

  const data = {};
  if ("name" in body) data.name = String(body.name).trim();
  if ("category" in body) data.category = body.category || null;
  if ("amount" in body) data.amount = Number(body.amount);
  if ("billingCycle" in body) data.billingCycle = body.billingCycle;
  if ("nextDueDate" in body) data.nextDueDate = body.nextDueDate || null;
  if ("vendor" in body) data.vendor = body.vendor || null;
  if ("note" in body) data.note = body.note || null;
  if ("active" in body) data.active = !!body.active;

  const updated = await prisma.subscription.update({ where: { id }, data });
  return NextResponse.json(updated);
}

async function DELETE(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.subscription.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
