const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: any of { name, price, unit, blurb, active, archived } — only the
// fields present are updated. Archiving also forces active:false (an
// archived add-on shouldn't show on the public site regardless of its own
// active flag); un-archiving does NOT automatically restore active — the
// owner re-enables visibility explicitly, so a restored add-on starts back
// out hidden until they choose to show it again.
async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.addOn.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Add-on not found" }, { status: 404 });
  }

  const data = {};
  if ("name" in body) {
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    data.name = String(body.name).trim();
  }
  if ("price" in body) {
    const value = Number(body.price);
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
    }
    data.price = value;
  }
  if ("unit" in body) data.unit = body.unit || null;
  if ("blurb" in body) data.blurb = body.blurb || null;
  if ("active" in body) data.active = !!body.active;
  if ("archived" in body) {
    data.archived = !!body.archived;
    if (data.archived) data.active = false;
  }

  const updated = await prisma.addOn.update({ where: { id }, data });
  return NextResponse.json(updated);
}

module.exports = { PATCH };
