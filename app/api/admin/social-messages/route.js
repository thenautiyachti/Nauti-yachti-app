const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { threadsFrom, summarise } = require("../../../../lib/socialMessages");

// Direct messages on Facebook and Instagram, and replying to them.
//
// WHY THIS EXISTS. Nothing read them. Not the console, which had a comments tab
// and no messages tab, and not any of the nine scheduled crew, none of whose
// briefs mentioned a DM. So a message arrived, sat in an inbox nobody opened,
// and there was no point at which anyone would find out.
//
// It was not theoretical. On 8 Sep 2026 the first look at this endpoint's data
// found two unread messages from 7 September, from the man who had posted
// publicly about litter on the shoreline. He was offering **two of his own
// boats** to help with the cleanup after the glow party. That had been sitting
// for a day and a half.
//
// A comment is public and embarrassing to miss. A DM is private, which makes it
// easier to miss and more personal when you do.
//
// SERVER-SIDE, so the Blotato key never reaches the browser.
//
// FACEBOOK AND INSTAGRAM ONLY. TikTok does not expose messages through the
// publishing API at all, and the panel says so rather than implying it covers
// three channels when it covers two.
const BASE = "https://backend.blotato.com/v2";
const PLATFORMS = ["facebook", "instagram"];

function key() {
  return process.env.BLOTATO_API_KEY || "";
}

async function blotato(path, options) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "blotato-api-key": key(),
      "Content-Type": "application/json",
      ...(options && options.headers),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error((body && (body.message || body.error)) || `Blotato ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!key()) {
    return NextResponse.json({
      threads: [], summary: summarise([]), platforms: PLATFORMS,
      error: "BLOTATO_API_KEY is not set, so messages cannot be read.",
    });
  }

  try {
    const convParams = new URLSearchParams({ limit: "100" });
    const convBody = await blotato("/conversations?" + convParams.toString(), { method: "GET" });
    const conversations = (convBody && convBody.items) || [];

    // One request per conversation. Fine at this volume — this business has had
    // single figures of them — and the alternative is listing every message and
    // regrouping, which loses the conversation's own timestamps.
    const withMessages = [];
    for (const c of conversations) {
      const p = new URLSearchParams({ conversationId: String(c.id), limit: "50" });
      let messages = [];
      try {
        const mBody = await blotato("/messages?" + p.toString(), { method: "GET" });
        messages = (mBody && mBody.items) || [];
      } catch {
        // One unreadable thread must not empty the whole inbox. It still shows,
        // with nothing in it, which reads as "something is wrong here" rather
        // than as "no messages".
      }
      withMessages.push({ conversation: c, messages });
    }

    return NextResponse.json({
      threads: threadsFrom(withMessages),
      summary: summarise(withMessages),
      platforms: PLATFORMS,
      fetchedAt: Date.now(),
    });
  } catch (err) {
    // An empty inbox because a fetch failed is worse than no inbox, because
    // empty reads as "nobody has written to us".
    return NextResponse.json({
      threads: [], summary: summarise([]), platforms: PLATFORMS,
      error: String(err && err.message ? err.message : err),
    });
  }
}

// Body: { accountId, recipientId, text }
//
// The owner presses send. Nothing here composes or sends on its own. A DM is a
// private message from the business to a named person, and that is not a
// decision to hand to a schedule — the same rule the comments tab follows.
async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!key()) {
    return NextResponse.json({ error: "BLOTATO_API_KEY is not set" }, { status: 400 });
  }

  const { accountId, recipientId, text } = await req.json();
  if (!accountId) return NextResponse.json({ error: "Which account?" }, { status: 400 });
  if (!recipientId) return NextResponse.json({ error: "Who to?" }, { status: 400 });
  const body = String(text || "").trim();
  if (!body) return NextResponse.json({ error: "Nothing to say" }, { status: 400 });
  // Both platforms cap a DM at 1000 characters. Catching it here gives a
  // sentence the owner can act on instead of a rejection from the API.
  if (body.length > 1000) {
    return NextResponse.json({ error: "Too long for a DM — 1000 characters maximum." }, { status: 400 });
  }

  try {
    const sent = await blotato("/messages", {
      method: "POST",
      body: JSON.stringify({ accountId: String(accountId), recipientId: String(recipientId), text: body }),
    });
    // Sending is asynchronous: it comes back queued and becomes sent, delivered
    // or failed. The panel re-reads rather than claiming success from a 201.
    return NextResponse.json(sent);
  } catch (err) {
    return NextResponse.json({
      error: String(err && err.message ? err.message : err),
    }, { status: 502 });
  }
}

module.exports = { GET, POST };
