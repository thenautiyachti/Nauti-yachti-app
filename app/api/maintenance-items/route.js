const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const items = await prisma.maintenanceItem.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(items);
}

module.exports = { GET };
