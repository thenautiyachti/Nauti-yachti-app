const { NextResponse } = require("next/server");
const { isDemo, assertDemoDatabase } = require("../../../../lib/demo");

// Nightly reset of the DEMO site: wipe and re-seed (lib/demoSeed.js), so every
// prospect sees a clean demo whatever the last one clicked.
//
// vercel.json schedules this for every project built from this repository,
// including the live site. On the live site it answers 404 and does nothing:
// demo mode is off there, and even if it were somehow on, assertDemoDatabase()
// refuses unless the database is positively the demo one. Three locks, any one
// of which stops it: demo mode, the demo database ref, and Vercel's cron secret.
const dynamic = "force-dynamic";
const maxDuration = 60;

async function GET(req) {
  if (!isDemo()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    assertDemoDatabase();
    const { prisma } = require("../../../../lib/db");
    const { seedDemo } = require("../../../../lib/demoSeed");
    const counts = await seedDemo(prisma, { log: () => {} });
    return NextResponse.json({ ok: true, ...counts });
  } catch (e) {
    console.error("[demo reset] failed:", e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

module.exports = { GET, dynamic, maxDuration };
