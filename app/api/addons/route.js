const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

// Admin-only — returns EVERY add-on (active, hidden, and archived) so the
// owner console can render all three states. The public site gets its
// filtered (active, non-archived) list via a direct prisma call in
// app/page.js, not through this route.
async function GET() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const addons = await prisma.addOn.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(addons);
}

// Body: { name, price, unit?, blurb? }
async function POST(req) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  const { name, price, unit, blurb } = body;
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const value = Number(price);
  if (!Number.isFinite(value) || value < 0) {
    return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
  }

  const maxSortOrder = await prisma.addOn.aggregate({ _max: { sortOrder: true } });
  let id = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `addon-${Date.now()}`;
  if (await prisma.addOn.findUnique({ where: { id } })) {
    id = `${id}-${Date.now().toString(36)}`;
  }

  const addon = await prisma.addOn.create({
    data: {
      id,
      name: String(name).trim(),
      price: value,
      unit: unit || null,
      blurb: blurb || null,
      sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
      active: true,
      archived: false,
    },
  });
  return NextResponse.json(addon);
}

module.exports = { GET, POST };
