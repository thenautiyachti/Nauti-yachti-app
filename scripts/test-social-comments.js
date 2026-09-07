// Built from the real 6 Sep thread, because the edge cases in it are the ones
// that matter: a follow-up arriving after an answer, and a comment sitting
// unanswered for a day.
const { threadsFrom, needsReply, urgency, shortAge, summarise, isOurs } =
  require("../lib/socialComments");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(56) +
    (good ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

const NOW = Date.parse("2026-09-07T16:00:00Z");
const ago = (h) => new Date(NOW - h * 3600000).toISOString();

// The actual thread, trimmed to its shape.
const THREAD = [
  // David, unanswered for a day, then answered.
  { id: "d", parentCommentId: null, isAuthor: false, status: "posted", platform: "facebook", postId: "p1",
    createdAt: ago(24), text: "How much is your company liability?" },
  { id: "gibran", parentCommentId: "d", isAuthor: false, status: "posted", platform: "facebook", postId: "p1",
    createdAt: ago(21), text: "then we will take you back to your car" },
  { id: "our-d", parentCommentId: "d", isAuthor: true, status: "posted", platform: "facebook", postId: "p1",
    createdAt: ago(1), text: "Fair questions — happy to answer them." },
  // Stevie: answered, then she came back. Open again.
  { id: "s", parentCommentId: null, isAuthor: false, status: "posted", platform: "facebook", postId: "p1",
    createdAt: ago(3), text: "So do people sleep on the boats" },
  { id: "our-s", parentCommentId: "s", isAuthor: true, status: "posted", platform: "facebook", postId: "p1",
    createdAt: ago(1), text: "Nobody sleeps aboard" },
  { id: "s2", parentCommentId: "s", isAuthor: false, status: "posted", platform: "facebook", postId: "p1",
    createdAt: ago(0.5), text: "so do the captains drive the people back home as well?" },
  // Jack: never answered, 19 hours.
  { id: "j", parentCommentId: null, isAuthor: false, status: "posted", platform: "facebook", postId: "p1",
    createdAt: ago(19), text: "TRASH CANS. the following day that shore line looks terrible." },
];

console.log("\n  GROUPING THE REAL THREAD\n");
const t = threadsFrom(THREAD, NOW);
ok("three top-level comments", t.length, 3);
// A FEED reads newest comment first: Stevie 3h, Jack 19h, David 24h.
ok("newest comment first", t.map((x) => x.comment.id), ["s", "j", "d"]);
const david = t.find((x) => x.comment.id === "d");
ok("David's thread carries both replies under it", david.replies.length, 2);
ok("our own comments are never threads of their own",
  t.every((x) => !isOurs(x.comment)), true);

console.log("\n  WHAT IS ACTUALLY ANSWERED\n");
const jack = t.find((x) => x.comment.id === "j");
const stevie = t.find((x) => x.comment.id === "s");
ok("David: answered", david.answered, true);
ok("Jack: not answered", jack.answered, false);
// The one that matters. We replied to Stevie, and she came back — so it is open
// again, not closed.
ok("Stevie: answered, then she replied — open again", stevie.answered, false);
ok("and it is flagged as a follow-up, not a fresh complaint", stevie.isFollowUp, true);
ok("Jack's is not a follow-up", jack.isFollowUp, false);
// David's thread stays closed even though someone else piled on under it,
// because we spoke last.
ok("we spoke last on David's, so it is closed", isOurs(david.replies[david.replies.length - 1]), true);

console.log("\n  THE QUEUE\n");
const q = needsReply(THREAD, NOW);
ok("two threads waiting", q.map((x) => x.comment.id), ["j", "s"]);
ok("Jack has been waiting 19 hours", q[0].ageHours, 19);
// Stevie's age is from HER follow-up, not from her original comment.
ok("Stevie's clock restarted at her follow-up", q[1].ageHours, 1);

console.log("\n  URGENCY IS HOURS, NOT OPINION\n");
ok("a day unanswered is overdue", urgency({ answered: false, ageHours: 24 }), "overdue");
ok("six hours is waiting", urgency({ answered: false, ageHours: 6 }), "waiting");
ok("an hour is fresh", urgency({ answered: false, ageHours: 1 }), "fresh");
ok("answered is done", urgency({ answered: true, ageHours: 99 }), "done");

console.log("\n  A QUEUED REPLY HAS NOT REACHED ANYBODY\n");
// Treating a queued or failed reply as an answer hides a thread still sitting
// open in public.
const queued = [
  { id: "x", parentCommentId: null, isAuthor: false, status: "posted", createdAt: ago(5) },
  { id: "xr", parentCommentId: "x", isAuthor: true, status: "queued", createdAt: ago(1) },
];
ok("a queued reply does not count as answered", threadsFrom(queued, NOW)[0].answered, false);
const failed = [
  { id: "y", parentCommentId: null, isAuthor: false, status: "posted", createdAt: ago(5) },
  { id: "yr", parentCommentId: "y", isAuthor: true, status: "failed", createdAt: ago(1) },
];
ok("nor does a failed one", threadsFrom(failed, NOW)[0].answered, false);
// A deleted top-level comment should not sit in the queue forever.
ok("a deleted comment is not a thread",
  threadsFrom([{ id: "z", parentCommentId: null, isAuthor: false, status: "deleted", createdAt: ago(5) }], NOW).length, 0);

console.log("\n  THE HEADLINE\n");
const s = summarise(THREAD, NOW);
ok("three threads, two open", [s.total, s.open], [3, 2]);
// 19 hours is "waiting"; nothing here has crossed a full day since its last
// message, because David's got answered an hour ago.
ok("nothing overdue yet — the threshold is a full day", s.overdue, 0);
ok("but Jack is the one closest to it", urgency(q[0]), "waiting");
ok("oldest waiting is 19 hours", s.oldestHours, 19);
ok("one is a follow-up", s.followUps, 1);
ok("nothing at all is zeroes", summarise([], NOW), { total: 0, open: 0, overdue: 0, oldestHours: 0, followUps: 0 });

console.log("\n  READABLE AT A GLANCE\n");
ok("under an hour", shortAge(0), "just now");
ok("hours", shortAge(19), "19h");
ok("days", shortAge(48), "2d");
ok("nothing", shortAge(null), "");

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
