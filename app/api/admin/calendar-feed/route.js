const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { feedToken } = require("../../../../lib/calendarFeed");
const { siteBase } = require("../../../../lib/demo");

// The private calendar-feed link, for a signed-in owner only. The console shows
// it so he can paste it into Google Calendar -> Other calendars -> From URL.
const dynamic = "force-dynamic";

async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const token = feedToken();
  if (!token) return NextResponse.json({ error: "SESSION_SECRET is not set" }, { status: 500 });
  return NextResponse.json(
    { url: `${siteBase()}/api/calendar/${token}.ics` },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}

module.exports = { GET, dynamic };
