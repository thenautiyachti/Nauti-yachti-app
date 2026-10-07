const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { isDemo } = require("../../../../lib/demo");

// The emails the demo would have sent (lib/demoOutbox.js). Only exists in demo
// mode: on the live site it answers 404, so nothing here is ever reachable there.
const dynamic = "force-dynamic";

async function GET() {
  if (!isDemo()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { readDemoOutbox } = require("../../../../lib/demoOutbox");
  return NextResponse.json(
    { messages: await readDemoOutbox() },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}

module.exports = { GET, dynamic };
