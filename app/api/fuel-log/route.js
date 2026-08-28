const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const logs = await prisma.fuelLog.findMany({ orderBy: { date: "desc" } });
  return NextResponse.json(logs);
}

// Body: { vesselId, date, hoursAtFillup, gallons, cost, note }
// When cost is provided, also writes a LedgerEntry (type "expense", category
// "fuel", origin "maintenance-tracker") so it flows into the existing Ledger
// totals automatically, same as any other expense entered on the Ledger tab.
async function POST(req) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  const { vesselId, date, hoursAtFillup, gallons, cost, note } = body;
  if (!vesselId || !date) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }
  const log = await prisma.fuelLog.create({
    data: {
      vesselId, date,
      hoursAtFillup: hoursAtFillup === "" || hoursAtFillup == null ? null : Number(hoursAtFillup),
      gallons: gallons === "" || gallons == null ? null : Number(gallons),
      cost: cost === "" || cost == null ? null : Number(cost),
      note: note || null,
    },
  });

  if (cost) {
    await prisma.ledgerEntry.create({
      data: {
        type: "expense",
        category: "fuel",
        amount: Number(cost),
        note: note || `Fuel — ${vesselId}`,
        origin: "maintenance-tracker",
        bookingId: null,
        date,
      },
    });
  }

  return NextResponse.json(log);
}

module.exports = { GET, POST };
