const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: { done }
async function PATCH(req, { params }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = params;
  const body = await req.json();
  const done = !!body.done;
  const updated = await prisma.jarvisTodo.update({
    where: { id },
    data: { done, doneAt: done ? new Date() : null },
  });
  return NextResponse.json(updated);
}

async function DELETE(req, { params }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = params;
  await prisma.jarvisTodo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
