const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { parsePackage } = require("../../../lib/serialize");

async function GET() {
  const packages = await prisma.package.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(packages.map(parsePackage));
}

module.exports = { GET };
