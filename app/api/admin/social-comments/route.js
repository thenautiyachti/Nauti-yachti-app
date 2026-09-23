const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { prisma } = require("../../../../lib/db");
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
    const threads = threadsFrom(items);

    // Siren's suggested replies, attached to the thread they answer so the box
    // opens with a sentence in it instead of empty. A suggestion is a draft:
    // nothing here sends, and the owner types over it freely.
    let suggestions = [];
    try {
      suggestions = await prisma.commentReplyDraft.findMany({ where: { usedAt: null } });
    } catch {
      // A missing suggestion table must not take the comment queue down with
      // it — the comments are the point, the pre-fill is a convenience.
    }
    // MATCH ON THE COMMENT THE SUGGESTION ANSWERS, NOT THE TOP OF THE THREAD.
    //
    // This looked at t.comment.id only, and t.comment is always the TOP-LEVEL
    // comment. But a suggestion is filed against the comment that is actually
    // waiting, and in a thread somebody came back to, that is the follow-up
    // reply — which has its own id. So every suggestion written for a
    // follow-up was stored correctly, returned correctly by
    // /api/comment-suggestions, and then silently failed to find its thread.
    //
    // On 8 Sep 2026 both Facebook suggestions in the box were follow-ups and
    // neither appeared in the console; the only one that rendered was an
    // Instagram comment that happened to be top-level. It read exactly like the
    // suggestions had never been written, which is the worst way for this to
    // fail — the owner cannot tell a missing draft from an unrendered one.
    //
    // Newest reply first, then the root: the last thing said is the thing being
    // answered.
    const byComment = new Map(suggestions.map((s) => [s.commentId, s]));
    for (const t of threads) {
      const chain = [...(t.replies || [])].reverse().concat(t.comment ? [t.comment] : []);
      let s = null, answers = null;
      for (const c of chain) {
        const hit = c && byComment.get(c.id);
        if (hit) { s = hit; answers = c; break; }
      }
      if (!s) continue;
      t.suggestion = s.suggestion;
      t.suggestionAuthor = s.author;
      t.suggestionAt = s.createdAt;
      // Which comment it answers, so a draft written for a follow-up is not
      // read as an answer to the comment at the top of the card.
      t.suggestionFor = answers.id;
      // If the comment has been edited since it was read, the suggestion may
      // answer a question nobody asked. Say so rather than pre-filling it
      // silently. Compared against the comment it was WRITTEN for.
      t.suggestionStale = !!(s.commentText && answers.text && s.commentText !== answers.text);
    }

    // WHICH POST IS THIS UNDER. Owner, 22 Sep 2026: "it would also be nice to
    // see which post the comments belong to, if this is possible."
    //
    // It is, and the data was already arriving — every comment carries postId
    // and platformPostId and both were being discarded. The join is on
    // MediaDraft.blotatoPostId, written at publish time.
    //
    // ITS OWN try/catch, and deliberately so. A comment queue that goes blank
    // because a join failed is the worst outcome here: an empty queue reads as
    // "everything is answered". The chip is a nicety; the comments are the point.
    //
    // Expect misses to be COMMON. Anything posted by hand from the phone has no
    // MediaDraft at all, so "post not identified" is a normal state.
    try {
      const ids = [...new Set(threads.map((t) => t.postId).filter(Boolean))];
      if (ids.length) {
        const posts = await prisma.mediaDraft.findMany({
          where: { blotatoPostId: { in: ids } },
          select: {
            blotatoPostId: true, caption: true, mediaUrl: true, mediaType: true,
            platform: true, scheduledDate: true, postUrl: true, theme: true,
          },
        });
        const byPost = new Map(posts.map((p) => [p.blotatoPostId, p]));
        for (const t of threads) {
          const p = t.postId && byPost.get(t.postId);
          if (!p) {
            // Say so rather than leave the header blank — an unlabelled card
            // reads as "no post", not as "we could not tell".
            t.post = null;
            t.postUnidentified = true;
            continue;
          }
          const line = String(p.caption || "").replace(/\s+/g, " ").trim();
          t.post = {
            label: p.theme || p.platform || "post",
            caption: line.length > 70 ? line.slice(0, 70) + "…" : line,
            thumb: p.mediaType === "image" ? p.mediaUrl : null,
            mediaType: p.mediaType,
            date: p.scheduledDate || null,
            // The permalink we were given at publish time is the trustworthy
            // one. Only fall back to building a Facebook URL from the platform
            // id; Instagram's permalink needs a shortcode we do not have.
            url: p.postUrl
              || (t.platform === "facebook" && t.platformPostId
                ? "https://facebook.com/" + t.platformPostId
                : null),
          };
        }
      }
    } catch (e) {
      // Leave every thread's post undefined and carry on serving comments.
      console.error("[social-comments] post attribution skipped:", e.message);
    }

    // ANSWERED SOMEWHERE ELSE. He works the Facebook app and Meta Business Suite
    // on his phone, and a reply typed there is invisible to this queue — the
    // thread sits here looking open for ever. Same problem MessageThreadAnswer
    // already solves for DMs, so the same shape solves it here.
    try {
      const answered = await prisma.commentThreadAnswer.findMany({
        select: { commentId: true, answeredAt: true, answeredWhere: true },
      });
      const byId = new Map(answered.map((a) => [a.commentId, a]));
      for (const t of threads) {
        const hit = t.comment && byId.get(t.comment.id);
        if (!hit) continue;
        t.answeredElsewhere = true;
        t.answeredElsewhereAt = hit.answeredAt;
        t.answeredElsewhereWhere = hit.answeredWhere || null;
      }
    } catch (e) {
      console.error("[social-comments] answered-elsewhere skipped:", e.message);
    }

    return NextResponse.json({
      threads,
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

    // RECORD WHAT WENT OUT. Until now the only trace of an answered comment was
    // CommentReplyDraft.usedAt flipping non-null — which meant a reply he typed
    // himself, over the suggestion or from scratch, left NOTHING behind. The
    // console could not tell an answered thread from an unanswered one once
    // Blotato's 250-row window rolled past it.
    //
    // Owner, 22 Sep 2026, on wanting the history even though Meta Business Suite
    // has it: Meta shows THAT a reply went out. This shows which post it was
    // under, who drafted it, and what he changed it to.
    //
    // Never fails the send. The comment is already public by this line; throwing
    // here would tell him it failed and invite him to post it twice, into a
    // stack with no delete.
    try {
      const draft = parentCommentId
        ? await prisma.commentReplyDraft.findUnique({ where: { commentId: parentCommentId } })
        : null;
      await prisma.commentReply.upsert({
        where: { commentId: parentCommentId || String(made && made.id) },
        create: {
          commentId: parentCommentId || String(made && made.id),
          platform: (made && made.platform) || "facebook",
          postId: String(postId),
          commentText: draft ? draft.commentText : null,
          draftText: draft ? draft.suggestion : null,
          draftAuthor: draft ? draft.author : null,
          sentText: body,
          source: "owner",
          // Whether he took the suggestion or wrote past it. The interesting
          // number over time is how often the draft survived contact.
          editedFromSuggestion: !!(draft && draft.suggestion && draft.suggestion.trim() !== body),
          blotatoReplyId: made && made.id ? String(made.id) : null,
          status: (made && made.status) || "queued",
          sentAt: new Date(),
        },
        update: {
          sentText: body,
          source: "owner",
          blotatoReplyId: made && made.id ? String(made.id) : null,
          status: (made && made.status) || "queued",
          sentAt: new Date(),
        },
      });
    } catch (e) {
      console.error("[social-comments] reply not recorded:", e.message);
    }

    // Posting is asynchronous — it comes back "queued" and becomes "posted" or
    // "failed". The panel polls, rather than claiming success from a 201.
    return NextResponse.json(made);
  } catch (err) {
    return NextResponse.json({
      error: String(err && err.message ? err.message : err),
    }, { status: 502 });
  }
}

// Body: { commentId, answered?: false, platform?, answeredCommentId?, answeredWhere?, note? }
//
// "I answered this elsewhere." He works the Facebook app and Meta Business Suite
// on his phone, so a reply typed there never reaches this queue and the thread
// sits here looking open for ever. Deliberately the same shape as the DM version
// in social-messages, including the undo — the mistake it guards against is
// marking the wrong thread, and without a way back that mistake is permanent.
//
// It also matters more than tidiness: an open-looking thread is one an
// auto-sender would be entitled to act on.
async function PATCH(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });

  const commentId = String(body.commentId || "").trim();
  if (!commentId) return NextResponse.json({ error: "Which comment?" }, { status: 400 });

  // Put it back. He marked the wrong one.
  if (body.answered === false) {
    const gone = await prisma.commentThreadAnswer.deleteMany({ where: { commentId } });
    await prisma.commentReply.deleteMany({ where: { commentId, source: "elsewhere" } });
    return NextResponse.json({ answered: false, cleared: gone.count });
  }

  const where = body.answeredWhere ? String(body.answeredWhere).slice(0, 120) : null;
  const data = {
    commentId,
    platform: body.platform ? String(body.platform).slice(0, 40) : null,
    answeredCommentId: body.answeredCommentId ? String(body.answeredCommentId).slice(0, 200) : null,
    // When HE dealt with it, not when they wrote. Anything newer re-opens it.
    answeredAt: new Date(),
    answeredWhere: where,
    note: body.note ? String(body.note).slice(0, 500) : null,
  };

  const row = await prisma.commentThreadAnswer.upsert({
    where: { commentId }, update: data, create: data,
  });

  // Also goes in the history, so the Answered list is one list rather than two
  // with different provenance. sentText is honest about not knowing the words —
  // they were typed into Facebook, not into this box.
  try {
    await prisma.commentReply.upsert({
      where: { commentId },
      create: {
        commentId,
        platform: data.platform || "facebook",
        sentText: "(answered outside the console)",
        source: "elsewhere",
        status: "posted",
        sentAt: data.answeredAt,
        decidedReason: where ? "answered in " + where : "answered elsewhere",
      },
      update: {},
    });
  } catch (e) {
    console.error("[social-comments] elsewhere not recorded:", e.message);
  }

  return NextResponse.json(row);
}

module.exports = { GET, POST, PATCH };
