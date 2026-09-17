const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

// Suggested replies waiting in the DM box.
//
// The sibling of /api/comment-suggestions, and it exists because the Messages
// tab was built to the same shape as Comments and never got the same plumbing.
// Same card, same textarea, same Send button — and nothing on earth that filled
// the box. On 17 Sep 2026 a guest asked "Hey bub, you got any seats open for
// Saturday?" and it sat for two hours under an empty field, because no crew
// brief had ever mentioned a DM.
//
// The console has no model access; the crew do. Siren reads the waiting threads
// on her morning run and leaves a suggestion here, so answering a DM is editing
// a sentence rather than starting from nothing at the moment somebody wants to
// give us money.
//
// NOTHING HERE SENDS. A suggestion is text sitting in a textarea for a person to
// read, change or throw away. Sending still goes through the owner pressing the
// button on the Messages tab, with the confirm dialog it already has.
//
// That rule is not paperwork. A DM is a private message from the business to a
// named person, and the comment queue already has the cautionary tale: on
// 7 Sep 2026 a confident suggested reply — that a photo was AI-generated — was
// flatly wrong, the file still carried Samsung camera Exif, and a suggestion
// that posted itself would have published that under the business's name to
// somebody standing right there. A DM is more personal than that, not less.

// Same machine key as the comment queue and the media drafts. Note
// `process.env.` — reading a bare JARVIS_SERVICE_KEY in module scope is a
// ReferenceError, which is how every media-draft POST 500'd for a while with
// nothing saying why.
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
  const rows = await prisma.messageReplyDraft.findMany({
    where: { usedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(rows);
}

// Body: { conversationId, platform, suggestion, messageId?, messageText?, author? }
//
// Upsert on the conversation, not create. Siren runs every morning, and a
// thread she has already read should end up with ONE suggestion reflecting her
// latest read rather than a stack of them the console has to choose between.
async function POST(req) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });

  const conversationId = String(body.conversationId || "").trim();
  const platform = String(body.platform || "").trim();
  const suggestion = String(body.suggestion || "").trim();

  const errors = [];
  if (!conversationId) errors.push("conversationId is required — it is what the console keys the box on.");
  if (!["facebook", "instagram"].includes(platform)) errors.push("platform must be facebook or instagram.");
  if (!suggestion) errors.push("suggestion cannot be empty.");
  // Both platforms cap a DM at 1000 characters and the console's own box says
  // so. A suggestion that cannot be sent as written is worse than none: it
  // looks ready, and the failure only appears when he presses the button.
  if (suggestion.length > 1000) {
    errors.push("suggestion is over 1000 characters, which is the DM limit on both platforms.");
  }
  if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });

  const data = {
    conversationId,
    platform,
    suggestion,
    messageId: body.messageId ? String(body.messageId).slice(0, 200) : null,
    messageText: body.messageText ? String(body.messageText).slice(0, 2000) : null,
    author: String(body.author || "Nauti Siren").slice(0, 60),
    // A re-suggestion revives the box. If she has looked again and written
    // something new, that is precisely because the last one is no longer the
    // right answer.
    usedAt: null,
  };

  const row = await prisma.messageReplyDraft.upsert({
    where: { conversationId },
    update: data,
    create: data,
  });
  return NextResponse.json(row, { status: 201 });
}

// Mark one used, so a suggestion the owner has already sent stops coming back.
async function PATCH(req) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const conversationId = String((body && body.conversationId) || "").trim();
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }
  const row = await prisma.messageReplyDraft.updateMany({
    where: { conversationId },
    data: { usedAt: new Date() },
  });
  return NextResponse.json({ updated: row.count });
}

module.exports = { GET, POST, PATCH };
