const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const subscriptions = await prisma.subscription.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(subscriptions);
}

// Body: { name, category?, amount, billingCycle, nextDueDate?, vendor?, note? }
async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  const { name, category, amount, billingCycle, nextDueDate, vendor, note } = body;

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!["monthly", "yearly", "weekly"].includes(billingCycle)) {
    return NextResponse.json({ error: 'billingCycle must be "monthly", "yearly", or "weekly"' }, { status: 400 });
  }
  const value = Number(amount);
  if (!value || value <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const subscription = await prisma.subscription.create({
    data: {
      name: String(name).trim(),
      category: category || null,
      amount: value,
      billingCycle,
      nextDueDate: nextDueDate || null,
      vendor: vendor || null,
      note: note || null,
    },
  });
  return NextResponse.json(subscription);
}

module.exports = { GET, POST };
