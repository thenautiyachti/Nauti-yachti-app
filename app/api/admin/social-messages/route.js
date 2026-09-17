const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { threadsFrom, summarise, summariseThreads, applyAnswers } = require("../../../../lib/socialMessages");
const { triage } = require("../../../../lib/messageTriage");

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

    const threads = threadsFrom(withMessages);

    // Fold in the threads he answered from his phone, before anything else
    // reads `waiting`. Order matters: the triage pass below and the summary
    // both depend on this having happened.
    let answers = [];
    try {
      answers = await prisma.messageThreadAnswer.findMany();
    } catch {
      // Missing table must not take the inbox down. Worst case every thread
      // reads as waiting, which is where this started and is survivable.
    }
    applyAnswers(threads, new Map(answers.map((a) => [a.conversationId, a])));

    // SUGGESTED REPLIES, and WHY A THREAD IS THE OWNER'S TO ANSWER.
    //
    // Two different things, both attached here so the console never has to work
    // either out for itself.
    //
    // Since 17 Sep 2026 most DMs are answered within seconds by a Blotato
    // automation firing on message-received (protocol 3d-ii). That automation
    // matches keywords and nothing else — it has no idea whether the message it
    // just replied to was a complaint, a refund demand, or somebody telling us
    // their child was hurt. So every waiting thread is run through the triage
    // rules here, and a thread the rules would have HELD is marked, with the
    // reason in the owner's own words.
    //
    // That is the one real exposure in the whole arrangement: a keyword match on
    // a message that should never have been answered by a machine. This is what
    // surfaces it.
    let suggestions = [];
    try {
      suggestions = await prisma.messageReplyDraft.findMany({ where: { usedAt: null } });
    } catch {
      // A missing suggestion table must not take the inbox down with it. The
      // messages are the point; the pre-fill is a convenience.
    }
    const byThread = new Map(suggestions.map((s) => [s.conversationId, s]));

    for (const t of threads) {
      const s = byThread.get(t.id);
      if (s) {
        t.suggestion = s.suggestion;
        t.suggestionAuthor = s.author;
        t.suggestionAt = s.createdAt;
        // Stale when they have written again since it was drafted: the answer
        // may be to a question that has been overtaken.
        const lastIn = [...(t.messages || [])].reverse().find((m) => m.direction !== "outgoing");
        t.suggestionStale = !!(s.messageId && lastIn && s.messageId !== lastIn.id);
      }

      // Only the last thing THEY said is worth triaging. Our own replies are
      // not messages anybody has to decide about.
      const lastIn = [...(t.messages || [])].reverse().find((m) => m.direction !== "outgoing");
      if (!lastIn) continue;
      const verdict = triage(lastIn.text, { dateResolved: true });
      t.triage = verdict.action;
      t.triageRule = verdict.rule;
      t.triageReason = verdict.reason;
      // Did a machine already answer this one? Anything outgoing after their
      // last message, on a thread the rules say should have been held, is the
      // case worth shouting about.
      const answeredAfter = (t.messages || []).some(
        (m) => m.direction === "outgoing" && new Date(m.createdAt) > new Date(lastIn.createdAt)
      );
      t.autoAnsweredButShouldNotHaveBeen = verdict.action === "hold" && answeredAfter;
    }

    return NextResponse.json({
      threads,
      // summariseThreads, not summarise: the latter recomputes from the raw
      // entries and would go on counting a thread the card shows as answered.
      summary: summariseThreads(threads),
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

// PATCH -> "I answered this one somewhere else."
//
// Body: { conversationId, answeredMessageId?, answeredWhere?, answered? }
// Set answered:false to undo.
//
// This records a fact the console cannot observe: he replied from the Facebook
// app and Blotato never saw it. It writes nothing to any platform and sends
// nothing to anybody — it is a note against a thread in our own database.
//
// IT DOES NOT TOUCH THE AUTO-REPLY. The Blotato automation fires on
// message-received at the platform and never reads this table, so their next
// message still gets an automatic reply. Nothing here can switch that off, by
// accident or otherwise.
async function PATCH(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });

  const conversationId = String(body.conversationId || "").trim();
  if (!conversationId) {
    return NextResponse.json({ error: "Which conversation?" }, { status: 400 });
  }

  // Undo. He marked the wrong thread, or wants it back in the queue.
  if (body.answered === false) {
    const gone = await prisma.messageThreadAnswer.deleteMany({ where: { conversationId } });
    return NextResponse.json({ answered: false, cleared: gone.count });
  }

  const data = {
    conversationId,
    platform: body.platform ? String(body.platform).slice(0, 40) : null,
    answeredMessageId: body.answeredMessageId ? String(body.answeredMessageId).slice(0, 200) : null,
    // Now, not the time of their message: what is being recorded is when HE
    // dealt with it, and everything newer than this re-opens the thread.
    answeredAt: new Date(),
    answeredWhere: body.answeredWhere ? String(body.answeredWhere).slice(0, 120) : null,
    note: body.note ? String(body.note).slice(0, 500) : null,
  };

  const row = await prisma.messageThreadAnswer.upsert({
    where: { conversationId },
    update: data,
    create: data,
  });
  return NextResponse.json(row);
}

module.exports = { GET, POST, PATCH };
