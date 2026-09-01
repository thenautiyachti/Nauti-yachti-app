const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

// GET ?campaign=... -> the scheduled posts, soonest first.
async function GET(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const campaign = new URL(req.url).searchParams.get("campaign") || undefined;
  const posts = await prisma.campaignPost.findMany({
    where: campaign ? { campaign } : undefined,
    orderBy: [{ scheduledDate: "asc" }, { postNumber: "asc" }, { platform: "asc" }],
  });
  return NextResponse.json(posts);
}

module.exports = { GET };
