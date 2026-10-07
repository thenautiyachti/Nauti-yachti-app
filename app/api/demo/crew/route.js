const { NextResponse } = require("next/server");
const { isDemo, assertDemoDatabase } = require("../../../../lib/demo");

// Hourly on the DEMO site: move the crew cards' runs up to each agent's latest
// scheduled time (lib/demoSeed.js refreshCrew), so the Overview never shows an
// agent as overdue. Touches only AgentActivity. Same three locks as
// /api/demo/reset: a 404 on the live site, the demo database ref, and
// Vercel's cron secret.
const dynamic = "force-dynamic";

async function GET(req) {
  if (!isDemo()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    assertDemoDatabase();
    const { prisma } = require("../../../../lib/db");
    const { refreshCrew } = require("../../../../lib/demoSeed");
    return NextResponse.json({ ok: true, ...(await refreshCrew(prisma)) });
  } catch (e) {
    console.error("[demo crew] failed:", e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

module.exports = { GET, dynamic };
