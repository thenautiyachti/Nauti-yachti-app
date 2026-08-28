const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");

async function GET() {
  const items = await prisma.galleryItem.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(items);
}

module.exports = { GET };
