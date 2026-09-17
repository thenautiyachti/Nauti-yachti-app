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

// THREADS ANSWERED SOMEWHERE WE CANNOT SEE.
//
// Blotato only knows about messages sent through Blotato. The owner answers
// most DMs from the Facebook app on his phone, and those replies never come
// back to us — so on 17 Sep 2026 two threads he had personally answered still
// wore the red NEVER ANSWERED flag, one of them for ten days. He was right and
// the console was wrong, and no amount of reading Blotato harder would have
// fixed it, because the data simply is not there.
//
// So a person supplies the missing half, and this folds it in.
//
// COMPARED ON TIME, NOT ON A FLAG. A thread counts as answered only while the
// answer is NEWER than the last thing they said. Write again and it re-opens on
// its own — which is exactly what the owner asked for: "if we do mark it
// answered and they reply back, we would still need the auto-reply to take
// effect". The auto-reply was never in question (it fires at the platform and
// never looks here), but the console has to re-open too, or his marking a
// thread answered on Tuesday would hide a question asked on Thursday.
//
// `answers` is a Map of conversationId -> { answeredAt, answeredWhere }.
function applyAnswers(threads, answers) {
  if (!answers || !answers.size) return threads;
  for (const t of threads) {
    const a = answers.get(t.id);
    if (!a || !a.answeredAt) continue;

    // The last thing THEY said. Our own messages cannot re-open a thread.
    const lastIn = [...(t.messages || [])].reverse().find((m) => !isOurs(m));
    const answeredAt = new Date(a.answeredAt).getTime();
    const theirLast = lastIn ? new Date(lastIn.createdAt).getTime() : 0;
    if (!(answeredAt >= theirLast)) continue; // they have written since

    t.answeredElsewhere = true;
    t.answeredAt = a.answeredAt;
    t.answeredWhere = a.answeredWhere || null;
    // These are what the badge, the colour and the red flag all read.
    t.waiting = false;
    t.neverAnswered = false;
  }
  return threads;
}

// Summarise threads that have already been adjusted, rather than rebuilding
// them from the raw entries.
//
// summarise() below recomputes from scratch, which is correct for a caller that
// has no answer records — and quietly wrong for one that does, because the tab
// badge would go on counting a thread the card itself shows as answered. A
// badge that disagrees with the list under it is the exact fault the bookings
// tab was fixed for on 11 Sep 2026.
function summariseThreads(threads) {
  const t = threads || [];
  return {
    total: t.length,
    waiting: t.filter((x) => x.waiting).length,
    neverAnswered: t.filter((x) => x.neverAnswered).length,
    answeredElsewhere: t.filter((x) => x.answeredElsewhere).length,
    failed: t.reduce((n, x) => n + (x.failed ? x.failed.length : 0), 0),
    oldestWaitingHours: t.filter((x) => x.waiting).reduce((m, x) => Math.max(m, x.ageHours), 0),
  };
}

module.exports = {
  threadsFrom, summarise, summariseThreads, applyAnswers,
  urgency, URGENCY_COLOUR, isOurs, otherPartyId,
};
