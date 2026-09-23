// A machine answering a public comment must fail closed.
//
//     node scripts/test-comment-triage.js
//
// Owner, 22 Sep 2026: "I want these to be auto-sent out as well."
//
// Every case below is a real comment from the account, a case three independent
// adversarial reviews produced to break an earlier design, or a near miss the
// audit caught. None of it is invented to pass.
//
// THE BAR. Blotato exposes get, list and post on comments -- no delete and no
// edit. A wrong auto-reply is permanent and screenshottable under the business
// name. So the question this file asks is never "does it answer enough", it is
// "can anything dangerous get out".
const { triageComment, normalise, isTagOnly, emojiOnly } = require("../lib/commentTriage");
const { TEMPLATES, PRAISE_PHRASES, TYPO_MAP, render, praiseTemplateFor } = require("../lib/commentReplies");
const { HOLD_RULES } = require("../lib/messageTriage");
const { COMMENT_HOLD_RULES } = require("../lib/commentTriage");

let pass = 0;
const fails = [];
function ok(label, got, want) {
  if (got === want) { pass++; return; }
  fails.push(label + "\n        got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
}

// A thread shaped the way the route builds them, with a post resolved so the
// post-unknown precondition is not what is being tested.
const th = (text, extra) => ({
  comment: { id: "c1", text },
  platform: "facebook",
  postId: "7309967",
  post: { label: "Tubing", caption: "Got a Saturday open this month?" },
  replies: [],
  ...(extra || {}),
});
const act = (text, extra) => triageComment(th(text, extra)).action;
const full = (text, extra) => triageComment(th(text, extra));

console.log("");

// --- the real corpus -------------------------------------------------------
ok("A  'Lube' auto-sends", act("Lube"), "auto");
ok("A  and picks the rescue template", full("Lube").templateId, "keyword-rescue");
ok("A  resolving TUBE, not the typo", full("Lube").vars.KEYWORD, "TUBE");
ok("B  'my photo' holds", act("Just using my photo with no heads up huh?? 🤔"), "hold");
ok("C  liability holds", act("How much is your company liability ?, having ppl on water at night"), "hold");
ok("D  TRASH CANS holds", act("TRASH CANS.  the following day that shore line looks terrible."), "hold");
ok("E  'shit faced drunk' holds", act("So do people sleep on the boats after they get shit faced drunk?"), "hold");
ok("F  'sounds terrible' holds", act("Tammie Regan sounds terrible"), "hold");
ok("G  'Awesome time' auto-sends", act("Awesome time"), "auto");
ok("G  'hell ya' auto-sends", act("hell ya"), "auto");
ok("G  'Let's go!!!!' auto-sends", act("Let's go!!!!"), "auto");
ok("H  'Cathy Rangel' is a tag", act("Cathy Rangel"), "ignore");
ok("H  an @handle is a tag", act("@_jessicalongoria.combs"), "ignore");
ok("I  'leaving at 11pm' holds", act("Is everyone leaving at 11pm"), "hold");
ok("J  'where is party cove' holds", act('Where exactly is the "party cove"? The deep water cove outside'), "hold");
ok("K  'might be bored' holds", act("going on a boat where we don't know anyone. Idk about that, might be bored."), "hold");

// --- THE PREFIX ATTACK, which broke every earlier design -------------------
ok("praise + a sting holds", act("Awesome time, shame about the trash on the shore"), "hold");
ok("praise + a number holds", act("hell ya, 3 hours late"), "hold");
ok("praise + a late captain holds", act("Love it shame the captain was late"), "hold");
ok("praise + a near miss holds", act("fire yall nearly flipped us at the dam"), "hold");
ok("five stars with a complaint holds", act("had the BEST day only thing was we sat at the dock forever"), "hold");

// --- THE FUZZY-MATCH WORDS. Every one of these must NOT fire the typo tier.
// Levenshtein over the six keywords reaches all of them; the hand-written map
// must reach none.
for (const w of ["love", "Love", "beach", "slow", "wow", "boat", "day", "bad",
  "gay", "cave", "code", "back", "tune", "dude", "nude", "today", "bruised"]) {
  const r = full(w);
  ok("'" + w + "' is not read as a keyword typo", r.tier === "keyword-typo", false);
}
ok("only one entry in the typo map", Object.keys(TYPO_MAP).length, 1);

// --- EMOJI, the class no word regex can see --------------------------------
ok("hearts auto-send", act("❤️❤️❤️"), "auto");
ok("fire auto-sends", act("🔥🔥🔥"), "auto");
ok("a skull does NOT", act("💀"), "hold");
ok("a clown does NOT", act("🤡"), "hold");
ok("thumbs-down does NOT", act("👎"), "hold");
ok("a mixed bag does NOT", act("🔥💀"), "hold");

// --- TAG-ONLY, which must not swallow real comments ------------------------
ok("'Cathy Rangel' is tag-only", isTagOnly("Cathy Rangel"), true);
ok("'TRASH CANS' is not", isTagOnly("TRASH CANS"), false);
ok("'Wow' is not", isTagOnly("Wow"), false);
ok("'Any openings sunday' is not", isTagOnly("Any openings sunday"), false);
ok("'Bunch of drunks' is not", isTagOnly("Bunch of drunks"), false);
ok("a question is never tag-only", isTagOnly("Cathy Rangel?"), false);

// --- THE NEAR MISSES the audit caught ---------------------------------------
ok("the blackout comment holds",
  act("lmaooooo i have zero memory of this photo. glowz got me 🥴🍻 best night ever tho"), "hold");
ok("  and it holds on intoxication", full("i have zero memory of this photo glowz got me").rule, "intoxication");
ok("a six-year-old on the tube holds", act("can kids come or is it 21 and up?? got a 6 yr old"), "hold");
ok("a non-swimmer holds", act("my wife cant swim is that ok"), "hold");
ok("a lost cooler holds", act("did anyone find our cooler lol"), "hold");
ok("a sunburn joke holds", act("got the worst sunburn of my life 😂 worth it"), "hold");
ok("a named crew member holds", act("tell Austin Hefty thanks from us"), "hold");

// --- money, always his -----------------------------------------------------
ok("a price question holds", act("how much for the whole day"), "hold");
ok("self-deprecating money still holds", act("how much 😭 asking for a broke friend"), "hold");

// --- the structural guards --------------------------------------------------
ok("an unknown post holds", triageComment({ ...th("Awesome"), post: null }).action, "hold");
ok("a follow-up holds", act("Awesome", { isFollowUp: true }), "hold");
ok("already answered elsewhere holds", act("Awesome", { answeredElsewhere: true }), "hold");
ok("an image with no text holds", act("   "), "hold");
ok("a link holds", act("awesome https://spam.example"), "hold");
ok("two questions hold", act("awesome? really?"), "hold");
ok("the default is hold", full("the vibes were immaculate honestly").action, "hold");

// --- normalisation ----------------------------------------------------------
ok("trailing bangs strip", normalise("Let's go!!!!"), "let's go");
ok("emoji strip", normalise("awesome 🔥"), "awesome");
ok("case folds", normalise("AWESOME"), "awesome");
ok("emojiOnly is false when letters exist", emojiOnly("ok 🔥"), false);

// --- EVERY TEMPLATE IS POLICED, not merely trusted ---------------------------
for (const [id, raw] of Object.entries(TEMPLATES)) {
  const text = raw.replace(/\{KEYWORD\}/g, "TUBE");
  ok("template " + id + " has no digit", /\d/.test(text.replace("TUBE", "")), false);
  ok("template " + id + " has no money", /\$/.test(text), false);
  ok("template " + id + " has no link", /https?:\/\/|www\./i.test(text), false);
  ok("template " + id + " has no hashtag", /#/.test(text), false);
  ok("template " + id + " has no handle", /@/.test(text), false);
  ok("template " + id + " is short enough", text.length <= 160, true);
  for (const r of HOLD_RULES.concat(COMMENT_HOLD_RULES)) {
    ok("template " + id + " does not trip " + r.id, r.re.test(text), false);
  }
}

// A praise phrase that itself trips a hold rule would be a trap.
for (const p of PRAISE_PHRASES) {
  for (const r of HOLD_RULES.concat(COMMENT_HOLD_RULES)) {
    ok("praise phrase '" + p + "' does not trip " + r.id, r.re.test(p), false);
  }
}

// --- rendering --------------------------------------------------------------
ok("the rescue line renders", render("keyword-rescue", { KEYWORD: "TUBE" }).includes("TUBE"), true);
ok("an unresolved variable refuses", render("keyword-rescue", {}), null);
ok("praise rotation is deterministic", praiseTemplateFor("abc"), praiseTemplateFor("abc"));

console.log("  " + pass + " passed, " + fails.length + " failed");
for (const f of fails) console.log("   FAIL  " + f);
console.log("");
process.exitCode = fails.length ? 1 : 0;
