const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: { label?, intervalHours?, intervalMonths?, lastDoneDate?, lastDoneHours?, notes? }
// Only the fields present in the body are updated — the owner edits schedule
// fields inline (interval hours/months) or marks an item done (lastDoneDate +
// lastDoneHours) from the same table, one field at a time.
async function PATCH(req, { params }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = params;
  const body = await req.json();
  const existing = await prisma.maintenanceItem.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const data = {};
  if ("label" in body) data.label = body.label;
  if ("intervalHours" in body) data.intervalHours = body.intervalHours === "" || body.intervalHours == null ? null : Number(body.intervalHours);
  if ("intervalMonths" in body) data.intervalMonths = body.intervalMonths === "" || body.intervalMonths == null ? null : Number(body.intervalMonths);
  if ("lastDoneDate" in body) data.lastDoneDate = body.lastDoneDate || null;
  if ("lastDoneHours" in body) data.lastDoneHours = body.lastDoneHours === "" || body.lastDoneHours == null ? null : Number(body.lastDoneHours);
  if ("notes" in body) data.notes = body.notes || null;

  const updated = await prisma.maintenanceItem.update({ where: { id }, data });
  return NextResponse.json(updated);
}

module.exports = { PATCH };
