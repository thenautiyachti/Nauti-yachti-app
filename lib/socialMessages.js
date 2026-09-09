// Direct messages, sorted into what is waiting on a reply and what is not.
//
// Deliberately the same shape as lib/socialComments.js — the two panels answer
// the same question about different channels, and having them disagree about
// what "waiting" means would be its own bug.
//
// THE DIFFERENCE FROM COMMENTS, and it is the one that matters: a comment is
// public, so missing one is embarrassing and somebody usually notices. A DM is
// private. Nobody sees it go unanswered except the person who sent it, which
// makes it easier to miss and more personal when you do.

// A message the business sent. Blotato marks direction on every one.
const isOurs = (m) => !!(m && m.direction === "outgoing");

// Only messages that actually reached someone count as an answer. A queued or
// failed reply has not been read by anybody, and treating either as "answered"
// would bury a thread that is still open.
const isDelivered = (m) =>
  !m || m.status == null || m.status === "sent" || m.status === "delivered";

// The other party's id, which is what a reply has to be addressed to. On an
// incoming message that is the sender; on one of ours, the recipient.
function otherPartyId(messages) {
  for (const m of messages) {
    if (!isOurs(m) && m.senderId) return m.senderId;
  }
  for (const m of messages) {
    if (isOurs(m) && m.recipientId) return m.recipientId;
  }
  return null;
}

// Group each conversation with its messages, oldest first, and work out whether
// it is waiting on us.
function threadsFrom(entries, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;

  return (entries || [])
    .filter((e) => e && e.conversation)
    .map(({ conversation, messages }) => {
      const sorted = (messages || [])
        .slice()
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const last = sorted.length ? sorted[sorted.length - 1] : null;
      const ourReplies = sorted.filter((m) => isOurs(m) && isDelivered(m));

      // Waiting means the last thing said came from them. Same test the comment
      // queue uses, and it is the only one that survives a conversation going
      // back and forth several times.
      const waiting = !!last && !isOurs(last);
      const since = last ? new Date(last.createdAt).getTime()
        : new Date(conversation.updatedAt || conversation.createdAt).getTime();

      return {
        id: conversation.id,
        accountId: conversation.accountId,
        platform: conversation.platform,
        recipientId: otherPartyId(sorted),
        messages: sorted,
        last,
        waiting,
        // Never replied at all, as opposed to a conversation that has been
        // going and they got the last word. The first is a miss; the second is
        // just a conversation.
        neverAnswered: waiting && ourReplies.length === 0,
        ageHours: Math.max(0, Math.round((now - since) / 3600000)),
        waitingSince: since,
        // Anything that failed to send is worth surfacing on the card: it looks
        // answered in the transcript and was never delivered.
        failed: sorted.filter((m) => m.status === "failed"),
      };
    })
    // Longest wait first — that is the one the most damage has been done to.
    // Answered threads fall to the bottom in recency order.
    .sort((a, b) => {
      if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
      return a.waiting ? a.waitingSince - b.waitingSince : b.waitingSince - a.waitingSince;
    });
}

function summarise(entries, nowMs) {
  const threads = threadsFrom(entries, nowMs);
  return {
    total: threads.length,
    waiting: threads.filter((t) => t.waiting).length,
    neverAnswered: threads.filter((t) => t.neverAnswered).length,
    failed: threads.reduce((n, t) => n + t.failed.length, 0),
    oldestWaitingHours: threads.filter((t) => t.waiting).reduce((m, t) => Math.max(m, t.ageHours), 0),
  };
}

// Hours, not opinions. A DM left overnight has been read by the one person it
// matters to, and they have decided what it means.
function urgency(thread) {
  if (!thread || !thread.waiting) return "done";
  if (thread.ageHours >= 24) return "overdue";
  if (thread.ageHours >= 4) return "due";
  return "fresh";
}

const URGENCY_COLOUR = {
  overdue: "#ff4d5e",
  due: "#ffb454",
  fresh: "#4ff3ff",
  done: "#1c7a86",
};

module.exports = { threadsFrom, summarise, urgency, URGENCY_COLOUR, isOurs, otherPartyId };
