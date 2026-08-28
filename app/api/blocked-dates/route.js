const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");
const { groupBlockedDates } = require("../../../lib/serialize");

async function GET() {
  const rows = await prisma.blockedDate.findMany();
  return NextResponse.json(groupBlockedDates(rows));
}

// Toggles a single date for a vessel — admin only.
async function POST(req) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { vesselId, date } = await req.json();
  const existing = await prisma.blockedDate.findUnique({
    where: { vesselId_date: { vesselId, date } },
  });
  if (existing) {
    await prisma.blockedDate.delete({ where: { id: existing.id } });
    return NextResponse.json({ blocked: false });
  }
  await prisma.blockedDate.create({ data: { vesselId, date } });
  return NextResponse.json({ blocked: true });
}

module.exports = { GET, POST };
