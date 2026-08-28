const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");

async function GET() {
  const addons = await prisma.addOn.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(addons);
}

module.exports = { GET };
