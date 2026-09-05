const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: { sent: true|false, sentNote?: string }
//
// "Sent" means a person has actually sent that guest their photographs. It is
// not a status the system can infer and nothing sets it automatically -- the
// whole point of the /thanks page is that the promise gets kept, and a flag
// something else could tick would quietly turn into a lie.
//
// Reversible on purpose: marking the wrong row sent would otherwise bury a
// guest who is still waiting, with no way back to them.
async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const existing = await prisma.photoRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Photo request not found" }, { status: 404 });
  }

  const data = {};
  if (typeof body.sent === "boolean") {
    data.sentAt = body.sent ? existing.sentAt || new Date() : null;
    // Clearing "sent" clears the note with it. A note saying "texted the
    // tubing ones" against a row that is back in the queue reads as though
    // they were already sent, which is the confusion this avoids.
    if (!body.sent) data.sentNote = null;
  }
  if (typeof body.sentNote === "string") {
    data.sentNote = body.sentNote.trim().slice(0, 500) || null;
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.photoRequest.update({ where: { id }, data });
  return NextResponse.json(updated);
}

async function DELETE(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.photoRequest.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
