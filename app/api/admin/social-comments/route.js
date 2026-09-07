const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { threadsFrom, summarise, PLATFORMS } = require("../../../../lib/socialComments");

// Comments on our published posts, and replying to them.
//
// On 6 Sep 2026 a Boatz & Glowz post drew four challenges — liability, life
// jackets, drink-driving, litter — and the first sat twenty-three hours before
// anyone saw it. That is the window in which a thread turns, because the people
// reading are the ones who never comment.
//
// SERVER-SIDE, so the Blotato key never reaches the browser and the console
// keeps talking only to our own origin.
//
// FACEBOOK AND INSTAGRAM ONLY. TikTok comments are not exposed by the
// publishing API, and the panel says so rather than quietly covering two
// channels of three while looking like it covers all of them.
const BASE = "https://backend.blotato.com/v2";

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
      error: "BLOTATO_API_KEY is not set, so comments cannot be read.",
    });
  }

  try {
    const params = new URLSearchParams({ limit: "250" });
    for (const p of PLATFORMS) params.append("platform", p);
    const body = await blotato("/comments?" + params.toString(), { method: "GET" });
    const items = (body && body.items) || [];
    return NextResponse.json({
      threads: threadsFrom(items),
      summary: summarise(items),
      platforms: PLATFORMS,
      fetchedAt: Date.now(),
    });
  } catch (err) {
    // A panel that shows an empty queue because a fetch failed is worse than
    // one that shows nothing, because an empty queue reads as "all answered".
    return NextResponse.json({
      threads: [], summary: summarise([]), platforms: PLATFORMS,
      error: String(err && err.message ? err.message : err),
    });
  }
}

// Body: { postId, parentCommentId, text }
//
// The owner presses send. Nothing here composes or posts on its own — a reply
// from this page is public, immediate and attributed to the business, and that
// is not a decision to hand to a schedule.
async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!key()) {
    return NextResponse.json({ error: "BLOTATO_API_KEY is not set" }, { status: 400 });
  }

  const { postId, parentCommentId, text } = await req.json();
  if (!postId) return NextResponse.json({ error: "Which post?" }, { status: 400 });
  const body = String(text || "").trim();
  if (!body) return NextResponse.json({ error: "Nothing to say" }, { status: 400 });
  if (body.length > 8000) return NextResponse.json({ error: "Too long for a comment" }, { status: 400 });

  try {
    const made = await blotato("/comments", {
      method: "POST",
      body: JSON.stringify({ postId, parentCommentId: parentCommentId || undefined, text: body }),
    });
    // Posting is asynchronous — it comes back "queued" and becomes "posted" or
    // "failed". The panel polls, rather than claiming success from a 201.
    return NextResponse.json(made);
  } catch (err) {
    return NextResponse.json({
      error: String(err && err.message ? err.message : err),
    }, { status: 502 });
  }
}

module.exports = { GET, POST };
