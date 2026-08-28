const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");

async function GET() {
  const vessels = await prisma.vessel.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(vessels);
}

module.exports = { GET };
