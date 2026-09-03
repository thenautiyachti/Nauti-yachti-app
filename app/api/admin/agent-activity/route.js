const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

const JARVIS_SERVICE_KEY = process.env.JARVIS_SERVICE_KEY;

// Shared auth check for this route: the owner's admin session cookie, OR a
// machine-only service key sent as `x-jarvis-key` — same dual-auth pattern
// as /api/admin/speak, so Claude Code (running headlessly, no browser
// session) can log its own activity here.
async function authorized(req) {
  const serviceKeyHeader = req.headers.get("x-jarvis-key");
  return (await isAdminAuthenticated()) || (JARVIS_SERVICE_KEY && serviceKeyHeader === JARVIS_SERVICE_KEY);
}

// GET -> most recent AgentActivity rows (limit ~25), newest first. Polled by
// the Jarvis tab's "Agent Activity" panel. Requires the human admin session
// (this is a console-view read, not a machine write).
async function GET(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rows = await prisma.agentActivity.findMany({
    orderBy: { startedAt: "desc" },
    take: 120,
  });

  return NextResponse.json(rows);
}

// POST { agentName, taskTitle, status?, detail?, id? } -> creates a new
// AgentActivity row, or — when `id` is given — updates that existing row's
// status/detail/completedAt instead of inserting a new one. This lets a
// long-running agent log "started", then later update the same row to
// "completed"/"failed" with a result summary.
//
// Auth: admin session cookie OR x-jarvis-key header (see `authorized` above).
async function POST(req) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, agentName, taskTitle, status, detail } = body || {};

  if (id) {
    const data = {};
    if (status !== undefined) data.status = status;
    if (detail !== undefined) data.detail = detail;
    if (status === "completed" || status === "failed") data.completedAt = new Date();

    try {
      const updated = await prisma.agentActivity.update({ where: { id }, data });
      return NextResponse.json(updated);
    } catch (err) {
      return NextResponse.json({ error: "Not found", detail: String(err) }, { status: 404 });
    }
  }

  const name = (agentName || "").trim();
  const title = (taskTitle || "").trim();
  if (!name || !title) {
    return NextResponse.json({ error: "Missing 'agentName' or 'taskTitle'" }, { status: 400 });
  }

  const created = await prisma.agentActivity.create({
    data: {
      agentName: name,
      taskTitle: title,
      status: status || "running",
      detail: detail || null,
    },
  });

  return NextResponse.json(created);
}

module.exports = { GET, POST };
