const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

const STATUSES = ["pending", "posted", "skipped"];

// PATCH { status?, postUrl?, body? }
// Marking something posted stamps the time, so "did I already do the Instagram
// one?" has an answer that survives closing the tab.
async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data = {};

  if ("status" in body) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
    data.postedAt = body.status === "posted" ? new Date() : null;
  }
  if ("postUrl" in body) data.postUrl = body.postUrl || null;
  // The owner can tweak a caption in place rather than editing the markdown and
  // re-seeding — the queue is the working copy once the campaign is running.
  if ("body" in body && body.body) data.body = body.body;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const updated = await prisma.campaignPost.update({ where: { id }, data });
  return NextResponse.json(updated);
}

module.exports = { PATCH };
