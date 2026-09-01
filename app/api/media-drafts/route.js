const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const drafts = await prisma.mediaDraft.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(drafts);
}

// Body: { theme, mediaUrl, mediaType?, caption, platform? }
// This is what a future generation step will call to insert a new draft.
async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  const { theme, mediaUrl, mediaType, caption, platform } = body;

  if (!theme || !String(theme).trim()) {
    return NextResponse.json({ error: "theme is required" }, { status: 400 });
  }
  if (!mediaUrl || !String(mediaUrl).trim()) {
    return NextResponse.json({ error: "mediaUrl is required" }, { status: 400 });
  }
  if (!caption || !String(caption).trim()) {
    return NextResponse.json({ error: "caption is required" }, { status: 400 });
  }
  if (mediaType && !["image", "video"].includes(mediaType)) {
    return NextResponse.json({ error: 'mediaType must be "image" or "video"' }, { status: 400 });
  }

  const draft = await prisma.mediaDraft.create({
    data: {
      theme: String(theme).trim(),
      mediaUrl: String(mediaUrl).trim(),
      mediaType: mediaType || "image",
      caption: String(caption).trim(),
      platform: platform || null,
    },
  });
  return NextResponse.json(draft);
}

module.exports = { GET, POST };
