// Comments left on our posts, and which of them are still waiting.
//
// WHY THIS EXISTS. On 6 Sep 2026 a Boatz & Glowz post drew four comments
// challenging the operation — liability, life jackets, drink-driving, litter on
// the shoreline. The first one sat for twenty-three hours before the owner saw
// it, and that is the window in which a thread turns: the people reading are
// the ones who never comment, and an unanswered accusation reads as conceded.
//
// Nothing here posts anything. It sorts what came in and works out what has
// been answered, so the console can show a queue instead of a feed.
//
// PLATFORMS. Facebook and Instagram only. TikTok comments are not exposed by
// the publishing API at all, so they stay a manual job in the TikTok app —
// saying otherwise would leave the owner believing a channel was covered when
// nothing was watching it.
const PLATFORMS = ["facebook", "instagram"];

// A comment written by us. Blotato marks these with isAuthor.
const isOurs = (c) => !!(c && c.isAuthor);

// Only posted comments count. A queued reply has not reached anyone yet, and a
// failed one certainly has not — treating either as "answered" would hide a
// thread that is still sitting there open.
const isLive = (c) => !c || c.status == null || c.status === "posted";

// Group a flat comment list into threads: each top-level comment from someone
// else, with our replies under it.
//
// Blotato supports one level of threading, so a parentCommentId always points
// at a top-level comment.
function threadsFrom(comments, nowMs) {
  const all = (comments || []).filter((c) => c && c.id);
  const now = nowMs == null ? Date.now() : nowMs;

  const byParent = new Map();
  for (const c of all) {
    if (!c.parentCommentId) continue;
    if (!byParent.has(c.parentCommentId)) byParent.set(c.parentCommentId, []);
    byParent.get(c.parentCommentId).push(c);
  }

  return all
    // Top-level, and not something we said ourselves.
    .filter((c) => !c.parentCommentId && !isOurs(c) && isLive(c))
    .map((c) => {
      const replies = (byParent.get(c.id) || [])
        .slice()
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const ourReplies = replies.filter((r) => isOurs(r) && isLive(r));
      // The last thing said in the thread. If somebody else spoke after our
      // reply, the thread is open again — that is exactly how the drink-driving
      // follow-up arrived four minutes after an answer.
      const last = replies.length ? replies[replies.length - 1] : c;
      return {
        comment: c,
        replies,
        platform: c.platform,
        postId: c.postId,
        answered: ourReplies.length > 0 && isOurs(last),
        waitingSince: new Date(last.createdAt).getTime(),
        ageHours: Math.max(0, Math.round((now - new Date(last.createdAt).getTime()) / 3600000)),
        // A reply to our reply is a live conversation, not a fresh complaint.
        isFollowUp: ourReplies.length > 0 && !isOurs(last),
      };
    })
    // A FEED, in the order the comments arrived. Newest first, because that is
    // how anyone reads a comment section.
    .sort((a, b) => new Date(b.comment.createdAt) - new Date(a.comment.createdAt));
}

// A QUEUE, which wants the opposite order: whatever has been sitting unanswered
// longest goes at the top, because that is the one that has been read in public
// by the most people with no reply under it.
//
// The clock runs from the LAST thing said, not the first. A thread we answered
// and someone came back to has been waiting since their follow-up, not since
// their original comment — otherwise a live conversation outranks a genuine
// day-old miss.
function needsReply(comments, nowMs) {
  return threadsFrom(comments, nowMs)
    .filter((t) => !t.answered)
    .sort((a, b) => a.waitingSince - b.waitingSince);
}

// How urgent, for the console to colour by. These are hours, not opinions:
// a thread nobody has answered by the next morning has been read by everybody
// who was going to read it.
function urgency(thread) {
  if (!thread || thread.answered) return "done";
  if (thread.ageHours >= 24) return "overdue";
  if (thread.ageHours >= 6) return "waiting";
  return "fresh";
}

const URGENCY_COLOUR = {
  overdue: "#E2685F",
  waiting: "#E8934A",
  fresh: "#4FF3FF",
  done: "#4FBF8B",
};

// "3h" / "2d" — a queue is read at a glance.
function shortAge(hours) {
  if (hours == null) return "";
  if (hours < 1) return "just now";
  if (hours < 24) return hours + "h";
  return Math.round(hours / 24) + "d";
}

// A one-line summary for the panel header and for Siren's status.
function summarise(comments, nowMs) {
  const threads = threadsFrom(comments, nowMs);
  const open = threads.filter((t) => !t.answered);
  const overdue = open.filter((t) => urgency(t) === "overdue");
  return {
    total: threads.length,
    open: open.length,
    overdue: overdue.length,
    oldestHours: open.length ? Math.max(...open.map((t) => t.ageHours)) : 0,
    followUps: open.filter((t) => t.isFollowUp).length,
  };
}

module.exports = {
  PLATFORMS, isOurs, isLive,
  threadsFrom, needsReply, urgency, URGENCY_COLOUR, shortAge, summarise,
};
