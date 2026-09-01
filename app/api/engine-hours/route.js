const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const logs = await prisma.engineHoursLog.findMany({ orderBy: { date: "desc" } });
  return NextResponse.json(logs);
}

// Body: { vesselId, date, hours, note }
async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  const { vesselId, date, hours, note } = body;
  if (!vesselId || !date || hours == null || hours === "") {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }
  const log = await prisma.engineHoursLog.create({
    data: { vesselId, date, hours: Number(hours), note: note || null },
  });
  return NextResponse.json(log);
}

module.exports = { GET, POST };
