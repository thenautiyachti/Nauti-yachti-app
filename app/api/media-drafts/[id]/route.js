const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body: { status?, reviewNote? }
// Setting status updates it; reviewedAt is stamped whenever status moves
// away from "pending". reviewNote is optional owner commentary either way.
async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.mediaDraft.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Media draft not found" }, { status: 404 });
  }

  // Pipeline stages: proposed -> approved -> scheduled -> posted, with
  // rejected as the terminal "no". The older vocabulary is still accepted and
  // translated, so anything holding an old value keeps working.
  const LEGACY = { pending: "proposed", discussing: "proposed", skipped: "rejected" };
  const STAGES = ["proposed", "approved", "scheduled", "posted", "rejected"];
  if ("status" in body) {
    const stage = LEGACY[body.status] || body.status;
    if (!STAGES.includes(stage)) {
      return NextResponse.json({ error: `status must be one of: ${STAGES.join(", ")}` }, { status: 400 });
    }
    body.status = stage;
  }

  const data = {};
  if ("status" in body) {
    data.status = body.status;
    if (body.status !== "proposed" && existing.status === "proposed") data.reviewedAt = new Date();
    // Reaching "posted" stamps the time; moving back off it clears the stamp,
    // so an undo does not leave a posted-at date on something not posted.
    if (body.status === "posted") data.postedAt = new Date();
    else if (existing.status === "posted") data.postedAt = null;
  }
  if ("reviewNote" in body) data.reviewNote = body.reviewNote || null;
  // Scheduling — giving a draft a date is what moves it from approved to
  // scheduled, which is the step that used to be missing entirely.
  if ("scheduledDate" in body) data.scheduledDate = body.scheduledDate || null;
  if ("scheduledTime" in body) data.scheduledTime = body.scheduledTime || null;
  if ("platform" in body) data.platform = body.platform || null;
  if ("caption" in body && body.caption) data.caption = body.caption;
  if ("postUrl" in body) data.postUrl = body.postUrl || null;

  const updated = await prisma.mediaDraft.update({ where: { id }, data });
  return NextResponse.json(updated);
}

async function DELETE(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.mediaDraft.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
