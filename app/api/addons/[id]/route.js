const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: { field: "price", value: number }
async function PATCH(req, { params }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = params;
  const { field, value } = await req.json();
  const existing = await prisma.addOn.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Add-on not found" }, { status: 404 });
  }
  if (field !== "price") {
    return NextResponse.json({ error: "Unknown field" }, { status: 400 });
  }
  const updated = await prisma.addOn.update({ where: { id }, data: { price: Number(value) } });
  return NextResponse.json(updated);
}

module.exports = { PATCH };
