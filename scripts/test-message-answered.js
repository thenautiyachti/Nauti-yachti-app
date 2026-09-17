// Does "I answered this elsewhere" behave the way the owner asked?
//
//     node scripts/test-message-answered.js
//
// The requirement in his words, 17 Sep 2026: "if we do mark it answered and
// they reply back, we would still need the auto-reply to take effect."
//
// The auto-reply itself was never at risk — it fires on message-received inside
// Blotato and never reads our database. What IS at risk is the console: if
// marking a thread answered on Tuesday hid a question asked on Thursday, he
// would stop trusting the queue, and the queue is the only reason any of this
// was found. So the test that matters is the third one.
const { threadsFrom, summariseThreads, applyAnswers, urgency } = require("../lib/socialMessages");

let pass = 0;
const fails = [];
function check(label, got, want) {
  if (got === want) pass++;
  else fails.push(label + "  expected " + JSON.stringify(want) + ", got " + JSON.stringify(got));
}

const NOW = Date.parse("2026-09-17T20:00:00Z");
const at = (iso) => new Date(iso).toISOString();

// One thread: they wrote, we never replied through Blotato.
function thread(messages) {
  return threadsFrom([{
    conversation: { id: "c1", accountId: "a1", platform: "facebook", updatedAt: at("2026-09-17T14:00:00Z") },
    messages,
  }], NOW);
}

const theirs = { id: "m1", direction: "incoming", senderId: "them", text: "any seats saturday?", createdAt: at("2026-09-17T14:00:00Z") };

// --- before marking -------------------------------------------------------
let t = thread([theirs]);
check("waiting before marking", t[0].waiting, true);
check("never answered before marking", t[0].neverAnswered, true);
check("summary counts it", summariseThreads(t).waiting, 1);

// --- marked answered ------------------------------------------------------
t = thread([theirs]);
applyAnswers(t, new Map([["c1", { answeredAt: at("2026-09-17T15:00:00Z"), answeredWhere: "outside the console" }]]));
check("not waiting once marked", t[0].waiting, false);
check("red flag cleared", t[0].neverAnswered, false);
check("says so on the thread", t[0].answeredElsewhere, true);
check("colour goes quiet", urgency(t[0]), "done");
check("BADGE respects it", summariseThreads(t).waiting, 0);
check("and counts it separately", summariseThreads(t).answeredElsewhere, 1);

// --- THEY WRITE BACK. This is the one that matters. ------------------------
const theirSecond = { id: "m2", direction: "incoming", senderId: "them", text: "how much for 4?", createdAt: at("2026-09-17T18:00:00Z") };
t = thread([theirs, theirSecond]);
applyAnswers(t, new Map([["c1", { answeredAt: at("2026-09-17T15:00:00Z") }]]));
check("RE-OPENS when they write again", t[0].waiting, true);
check("not shown as answered any more", !!t[0].answeredElsewhere, false);
check("badge counts it again", summariseThreads(t).waiting, 1);

// A thread he answered, they replied, and he answered THAT too.
t = thread([theirs, theirSecond]);
applyAnswers(t, new Map([["c1", { answeredAt: at("2026-09-17T19:00:00Z") }]]));
check("marking again after their reply closes it", t[0].waiting, false);

// --- edges ----------------------------------------------------------------
// Our own message must never re-open a thread he has marked.
const ours = { id: "m3", direction: "outgoing", recipientId: "them", text: "hi", createdAt: at("2026-09-17T19:30:00Z") };
t = thread([theirs, ours]);
applyAnswers(t, new Map([["c1", { answeredAt: at("2026-09-17T15:00:00Z") }]]));
check("our own reply does not re-open it", t[0].waiting, false);

// Exactly simultaneous counts as answered — he marked it as their message
// landed, which is the click he actually makes.
t = thread([theirs]);
applyAnswers(t, new Map([["c1", { answeredAt: at("2026-09-17T14:00:00Z") }]]));
check("same instant counts as answered", t[0].waiting, false);

// A mark for a different conversation must not touch this one.
t = thread([theirs]);
applyAnswers(t, new Map([["other", { answeredAt: at("2026-09-17T19:00:00Z") }]]));
check("another thread's mark is ignored", t[0].waiting, true);

// No marks at all, and an empty map, must both be no-ops.
t = thread([theirs]);
applyAnswers(t, new Map());
check("empty map is a no-op", t[0].waiting, true);
t = thread([theirs]);
applyAnswers(t, null);
check("null is a no-op", t[0].waiting, true);

if (fails.length) {
  console.log("  " + pass + " passed, " + fails.length + " FAILED\n");
  for (const f of fails) console.log("  FAIL  " + f);
  process.exitCode = 1;
} else {
  console.log("  " + pass + "/" + pass + " passed — marking answered clears the flag, and their next message brings it back.");
}
