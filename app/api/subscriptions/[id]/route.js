const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: any subset of { name, category, amount, billingCycle, nextDueDate,
// vendor, note, active, premises, businessUsePct, startedOn, endedOn,
// accountRef, personal }. Only the fields present in the body are updated —
// used both for inline field edits and for the toggle buttons.
//
// THIS ROUTE SILENTLY DROPPED HALF THE COLUMNS FOR A DAY.
//
// Subscription gained premises, businessUsePct, startedOn, endedOn and
// accountRef on 13 Sep 2026, and the console gained inputs for them the same
// afternoon. Nobody added them here. An unknown field is not an error — it is
// simply never copied into `data` — so the console sent the change, the route
// returned 200, and nothing was written. The Where, Business % and Ended boxes
// looked like they worked and did not. Every value that IS in the database got
// there by script, which is exactly why it went unnoticed.
//
// AND A CLEARED AMOUNT BECAME "FREE". The console sends null to mean "nobody
// has found out what this costs", which the whole tab is built around. This
// route ran it through Number(), and Number(null) is 0 — the value that means
// "confirmed free". So clearing a price quietly asserted the opposite of what
// was meant. Same for a cleared business share, where 0 means "none of it is
// the business's" and null means nobody has decided.
//
// So: nullable fields are checked for null BEFORE coercion, never after.
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

  // A blank is a real answer here and must survive as null rather than being
  // coerced to a number that means something else entirely.
  const nullableNumber = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const data = {};
  if ("name" in body) data.name = String(body.name).trim();
  if ("category" in body) data.category = body.category || null;
  if ("amount" in body) data.amount = nullableNumber(body.amount);
  if ("billingCycle" in body) data.billingCycle = body.billingCycle;
  if ("nextDueDate" in body) data.nextDueDate = body.nextDueDate || null;
  if ("vendor" in body) data.vendor = body.vendor || null;
  if ("note" in body) data.note = body.note || null;
  if ("active" in body) data.active = !!body.active;
  if ("premises" in body) data.premises = body.premises || null;
  if ("businessUsePct" in body) data.businessUsePct = nullableNumber(body.businessUsePct);
  if ("startedOn" in body) data.startedOn = body.startedOn || null;
  if ("endedOn" in body) data.endedOn = body.endedOn || null;
  if ("accountRef" in body) data.accountRef = body.accountRef || null;
  // Moving a row between personal and business changes which totals it lands
  // in, and nothing else about it.
  if ("personal" in body) data.personal = !!body.personal;

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
