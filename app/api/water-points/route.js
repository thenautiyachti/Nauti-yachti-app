const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");
const { validate } = require("../../../lib/waterPoints");

// Saved places on the water — fuel, cover, ramps.
//
// Admin only. These are the owner's own operating notes, and a public list of
// where his boats shelter is nobody else's business.
async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const points = await prisma.waterPoint.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] });
  return NextResponse.json(points);
}

// Body: { kind, name, lat, lon, note? }
//
// Validated through lib/waterPoints so a half-filled form cannot put a nameless
// point at 0,0 into a list whose entire purpose is being trusted from the water.
async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  const check = validate(body);
  if (!check.ok) {
    return NextResponse.json({ error: check.errors.join(" ") }, { status: 400 });
  }
  const created = await prisma.waterPoint.create({ data: check.value });
  return NextResponse.json(created);
}

module.exports = { GET, POST };
