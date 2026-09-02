const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { dueDrafts } = require("../../../../lib/socialPosting");

// What is due to go out today, and whether each one can actually be published.
//
// The owner's rule is that approving a draft and giving it a date IS the
// permission to post it, so this is the queue that acts on. It reports blocked
// items alongside ready ones rather than quietly dropping them — a post that
// cannot go out is something to fix, not something to hide.
async function GET(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  // Caller may pin the date; otherwise "today" is the server's local day, which
  // is the same day the scheduledDate keys were written against.
  const today = url.searchParams.get("today") || localDateKey(new Date());

  const drafts = await prisma.mediaDraft.findMany({ where: { status: "scheduled" } });
  const due = dueDrafts(drafts, today);

  return NextResponse.json({
    today,
    total: due.length,
    ready: due.filter((d) => d.ready).length,
    blocked: due.filter((d) => !d.ready).length,
    drafts: due,
  });
}

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

module.exports = { GET };
