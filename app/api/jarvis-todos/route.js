const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

// Not-done items first (oldest first within that group), then done items
// most-recently-completed first — keeps the active list stable while
// checked-off items settle to the bottom instead of disappearing outright.
async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const todos = await prisma.jarvisTodo.findMany({
    orderBy: [{ done: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(todos);
}

// Body: { text }
async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  const text = (body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const todo = await prisma.jarvisTodo.create({ data: { text } });
  return NextResponse.json(todo);
}

module.exports = { GET, POST };
