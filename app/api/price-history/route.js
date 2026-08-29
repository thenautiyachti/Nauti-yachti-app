const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

// Admin-only audit trail for Packages & Pricing changes. Internal use only
// — never exposed to the public site.
async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const rows = await prisma.priceChangeLog.findMany({ orderBy: { changedAt: "desc" }, take: 200 });
  return NextResponse.json(rows);
}

module.exports = { GET };
