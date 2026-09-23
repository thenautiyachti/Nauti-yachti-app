// Which public comments a machine may answer by itself, and which wait for him.
//
// Owner, 22 Sep 2026: "I want these to be auto-sent out as well."
//
// THIS FILE ONLY CLASSIFIES. It sends nothing and knows nothing about Blotato.
// Shipped ahead of any sender on purpose: knowing WHY a comment is his to answer
// is worth having on the drafting side regardless of whether auto-send is ever
// switched on, and the console shows that reason on the card.
//
// FAIL CLOSED, EVERYWHERE. An unrecognised comment is not a safe comment, it is
// a comment nobody has understood. Same doctrine as lib/messageTriage.js, and
// the reason the default at the bottom of this file is "hold".
const { HOLD_RULES } = require("./messageTriage");
const { PRAISE_PHRASES, POSITIVE_EMOJI, TYPO_MAP, praiseTemplateFor } = require("./commentReplies");

// ---------------------------------------------------------------------------
// NORMALISATION
// ---------------------------------------------------------------------------
const EMOJI_ISH = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

function normalise(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(EMOJI_ISH, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'’]/gu, " ")   // punctuation out, apostrophes kept
    .replace(/’/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// THE SINGLE LINE THAT CLOSES THE PREFIX ATTACK.
//
// A comment is only ever auto-sendable if the WHOLE normalised comment is a
// listed string. Not a prefix, not a keyword found inside it. Any digit, any
// interior punctuation, anything over 24 characters, and it is his.
//
//   "Awesome time, shame about the trash on the shore" -> comma -> fails
//   "hell ya, 3 hours late"                            -> digit -> fails
//   "Love it 😄 shame the captain was 40 min late"      -> length + digit -> fails
const ELIGIBLE = /^[a-z' ]{1,24}$/;

// ---------------------------------------------------------------------------
// COMMENT-ONLY HOLD RULES
//
// DELIBERATELY NOT APPENDED TO messageTriage.HOLD_RULES. That array is iterated
// by the live DM auto-reply; adding "drunk" or "kids" there would silently stop
// DMs answering and regress a working, owner-approved system from a comments
// change. These are comment-shaped by definition, so there is nothing to drift.
// ---------------------------------------------------------------------------
const COMMENT_HOLD_RULES = [
  {
    id: "intoxication",
    why: "it is about drinking, and this is a 21+ event",
    // The corpus case: "i have zero memory of this photo. glowz got me". A
    // cheerful reply there makes the business publicly confirm a named guest was
    // incapacitated on our boat, and ties our safety line to her state.
    re: /\b(drunk|drunks|drinking|boozin|booze|wasted|hammered|shit.?faced|shitfaced|blackout|black(ed)? out|zero memory|no memory|don'?t remember|dont remember|tipsy|buzzed|sloshed|dui|dwi|bui|sober|floating bar)\b/i,
  },
  {
    id: "duty-of-care",
    why: "somebody's safety or suitability is in it",
    // Whether a six-year-old may ride the tube is a captain's call made on the
    // day, not a lookup. Family-friendly boarding and clearance to ride are two
    // different facts and the friendly version of the question hides that.
    re: /\b(kids?|child|children|minor|yr old|year old|years old|pregnan|disab|wheelchair|non.?swimmer|can'?t swim|cant swim|life ?(jacket|vest)|pfd|capacit|overload|storm|lightning|choppy|weather)\b/i,
  },
  {
    id: "incident",
    why: "something happened on the water",
    // Gaps the DM "safety" rule does not cover, because a comment reports an
    // incident in words a DM rarely uses.
    re: /\b(cops|flipped|tipped|swamped|bruis|sunburn|sun burn|my back|my ribs|my knee|cooler|left (my|our)|lost (my|our)|missing)\b/i,
  },
  {
    id: "provenance",
    why: "it is about whose photo or video this is",
    // The 7 Sep incident, in its own rule. "Just using my photo with no heads up
    // huh??" must never reach a machine that feels able to answer it.
    re: /\b(my (pic|photo|picture|face|kid|daughter|son)|our (pic|photo|picture)|that'?s me|thats me|where('| )?d you get|is (that|this) ai|ai.?generated|ai wrote|fake|stolen|stock photo)\b/i,
  },
  {
    id: "competitor",
    why: "another operator is named in it",
    // The NDA rule already catches Lake Bryan. This catches the dig-at-a-peer
    // shape, where any reply at all is a business decision.
    re: /\b(yolo|competitor|better than|cheaper than)\b/i,
  },
];

// A person named in a comment that also has other content. Tag-only comments are
// caught earlier, at the ignore step, so this cannot fire on them.
const TITLECASE_PAIR = /\b\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+\b/u;

function namesSomeone(text) {
  const t = String(text || "");
  if (/@[\w.\-]+/.test(t)) return true;
  return TITLECASE_PAIR.test(t);
}

// Every token is a handle or part of a Titlecase name, four tokens or fewer, no
// verb, no question. Strict Titlecase excludes "TRASH CANS"; requiring EVERY
// token to match excludes "Any openings sunday"; requiring two tokens for a name
// excludes single words like "Wow".
function isTagOnly(text) {
  const t = String(text || "").trim();
  if (!t || /[?]/.test(t)) return false;
  const tokens = t.split(/\s+/);
  if (!tokens.length || tokens.length > 4) return false;
  const handle = (s) => /^@[\w.\-]+$/.test(s);
  const titled = (s) => /^\p{Lu}\p{Ll}+$/u.test(s);
  if (!tokens.every((s) => handle(s) || titled(s))) return false;
  // A lone Titlecase word is "Wow", not a name.
  return tokens.some(handle) || tokens.filter(titled).length >= 2;
}

function emojiOnly(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\p{L}|\p{N}/u.test(t)) return false;
  const found = t.match(EMOJI_ISH) || [];
  if (!found.length) return false;
  const allow = new Set(POSITIVE_EMOJI.map((e) => e.replace(/[\u{FE00}-\u{FE0F}]/gu, "")));
  return found
    .filter((c) => !/[\u{FE00}-\u{FE0F}\u{200D}]/u.test(c))
    .every((c) => allow.has(c));
}

const hold = (rule, reason) => ({ action: "hold", rule, reason });

/**
 * thread: { comment: {id, text}, platform, postId, post, isFollowUp, replies,
 *           answeredElsewhere }
 * Returns { action: 'auto' | 'hold' | 'ignore', tier?, templateId?, vars?,
 *           rule?, reason? }
 */
function triageComment(thread, ctx) {
  const t = thread || {};
  const c = t.comment || {};
  const text = String(c.text || "");
  const opts = ctx || {};

  // --- preconditions the classifier owns -----------------------------------
  if (!text.trim()) return hold("no-text", "there is no text to read — a sticker or an image");
  if (t.answeredElsewhere) return hold("answered", "you already answered this somewhere else");
  if (t.isFollowUp) return hold("follow-up", "they came back after our reply — a live conversation");
  if ((t.replies || []).length) return hold("has-replies", "the thread already has replies on it");

  // Knowing WHICH post is a precondition, not a nicety. Whether a jaunty reply
  // is appropriate is a question about the post as much as the comment.
  if (!t.post && opts.requirePost !== false) {
    return hold("post-unknown", "we cannot tell which post this is on");
  }

  // --- 1. structural holds --------------------------------------------------
  if (text.length > 120) return hold("long", "it is long enough to be saying something specific");
  if ((text.match(/\?/g) || []).length > 1) return hold("many-questions", "more than one question in it");
  if (/https?:\/\/|www\./i.test(text)) return hold("link", "it carries a link");
  if (/\b[A-Z]{6,}\b/.test(text)) return hold("shouting", "it is partly in capitals");
  if (/\d/.test(text)) return hold("digits", "it has a number in it, which usually means a fact");

  // --- 2. the DM hold rules, IMPORTED ---------------------------------------
  for (const r of HOLD_RULES) {
    if (r.re.test(text)) return hold(r.id, r.why);
  }

  // --- 3. the comment-only hold rules ---------------------------------------
  for (const r of COMMENT_HOLD_RULES) {
    if (r.re.test(text)) return hold(r.id, r.why);
  }

  // --- 4. tag-only, before anything can send --------------------------------
  if (isTagOnly(text)) {
    return { action: "ignore", rule: "tag-only", reason: "a tag with nothing to answer" };
  }

  // A person named in a comment that has other content in it too.
  if (namesSomeone(text)) return hold("person-named", "somebody is named in it");

  // --- 5. the two send tiers, exact whole-string only -----------------------
  const norm = normalise(text);

  if (emojiOnly(text)) {
    return { action: "auto", tier: "praise-emoji", templateId: "praise-emoji" };
  }

  if (ELIGIBLE.test(norm)) {
    const typo = TYPO_MAP[norm];
    if (typo) {
      return { action: "auto", tier: "keyword-typo", templateId: "keyword-rescue", vars: { KEYWORD: typo } };
    }
    if (PRAISE_PHRASES.includes(norm)) {
      return { action: "auto", tier: "praise", templateId: praiseTemplateFor(c.id) };
    }
  }

  // --- 6. default ------------------------------------------------------------
  return hold("not-recognised", "nobody has taught us this one — it is yours");
}

module.exports = { triageComment, normalise, isTagOnly, emojiOnly, namesSomeone, COMMENT_HOLD_RULES, ELIGIBLE };
