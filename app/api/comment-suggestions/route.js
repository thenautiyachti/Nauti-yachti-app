const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

// Suggested replies waiting in the comment box.
//
// The console has no model access; the crew do. Siren reads the open comments
// on her run and leaves a suggestion here, the same way Coral leaves a
// MediaDraft, so answering a comment is editing a sentence rather than staring
// at an empty field.
//
// NOTHING HERE POSTS. A suggestion is text sitting in a textarea for a person
// to read, change or throw away; sending still goes through the owner pressing
// the button on the comments tab, with the confirm dialog it already has.
//
// That distinction earned itself on 7 Sep 2026. A comment read "Just using my
// photo with no heads up huh??" and the confident answer — that the picture
// was AI-generated — was flatly wrong: the file still carried Samsung camera
// Exif. A suggestion that posted itself would have published that to a public
// thread, under the business's name, to someone who was standing there.

// Same machine key as the media-draft queue. Note `process.env.` — reading a
// bare JARVIS_SERVICE_KEY here is a ReferenceError in module scope, which is
// exactly how every media-draft POST 500'd for a while without anyone seeing
// why.
async function authorized(req) {
  const serviceKey = req.headers.get("x-jarvis-key");
  return (
    (await isAdminAuthenticated()) ||
    (process.env.JARVIS_SERVICE_KEY && serviceKey === process.env.JARVIS_SERVICE_KEY)
  );
}

async function GET(req) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const rows = await prisma.commentReplyDraft.findMany({
    where: { usedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(rows);
}

// Body: { commentId, platform, suggestion, commentText?, author? }
//
// Upsert rather than create: Siren runs repeatedly and a comment she has
// already looked at should end up with ONE suggestion that reflects her latest
// read, not a pile of them the console has to choose between.
async function POST(req) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });

  const commentId = String(body.commentId || "").trim();
  const platform = String(body.platform || "").trim();
  const suggestion = String(body.suggestion || "").trim();
  const errors = [];
  if (!commentId) errors.push("commentId is required — it is what the console keys the box on.");
  if (!["facebook", "instagram"].includes(platform)) errors.push("platform must be facebook or instagram.");
  if (!suggestion) errors.push("suggestion cannot be empty.");
  // A reply long enough to need scrolling is not a comment reply, and the
  // platforms truncate it anyway.
  if (suggestion.length > 2000) errors.push("suggestion is over 2000 characters.");
  if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });

  const data = {
    commentId, platform, suggestion,
    commentText: body.commentText ? String(body.commentText).slice(0, 2000) : null,
    author: String(body.author || "Nauti Siren").slice(0, 60),
    usedAt: null,
  };
  const row = await prisma.commentReplyDraft.upsert({
    where: { commentId },
    update: data,
    create: data,
  });
  return NextResponse.json(row, { status: 201 });
}

// Mark one used, so a suggestion the owner has already acted on stops coming
// back into the box.
async function PATCH(req) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const commentId = String((body && body.commentId) || "").trim();
  if (!commentId) return NextResponse.json({ error: "commentId is required." }, { status: 400 });
  const row = await prisma.commentReplyDraft.updateMany({
    where: { commentId },
    data: { usedAt: new Date() },
  });
  return NextResponse.json({ updated: row.count });
}

module.exports = { GET, POST, PATCH };
