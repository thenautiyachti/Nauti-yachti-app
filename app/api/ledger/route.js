const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const entries = await prisma.ledgerEntry.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(entries);
}

async function POST(req) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { type, amount, note, date, category, origin, bookingId } = await req.json();
  if (!["income", "expense"].includes(type) || !amount || !date) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }
  const entry = await prisma.ledgerEntry.create({
    data: {
      type, amount: Number(amount), note: note || null, date,
      category: category || null, origin: origin || null, bookingId: bookingId || null,
    },
  });
  return NextResponse.json(entry);
}

module.exports = { GET, POST };
