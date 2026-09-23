// Every sentence the machine is allowed to say in public, written by a person.
//
// THE WHOLE ARCHITECTURE IS IN THIS FILE'S EXISTENCE. Auto-send cannot compose.
// It selects a fixed string from here, chosen by the deterministic classifier in
// lib/commentTriage.js. That is what makes it structurally impossible to repeat
// the 7 Sep 2026 incident, where a confident draft claimed a guest's photo was
// AI-generated and the file still carried Samsung camera Exif. A template cannot
// invent a claim about a photograph, state a glow time from memory, or negotiate
// a refund -- not because it was told not to, but because a person wrote the
// sentence weeks earlier and it lives in a git diff somebody read.
//
// THE HARD RULE FOR EVERY STRING BELOW, enforced by scripts/test-comment-triage.js:
// no digit, no "$", no URL, no hashtag, no "@", no name, 160 characters or fewer,
// and it must not itself trip any hold rule. "Nothing it sends carries a fact" is
// otherwise an aspiration enforced by nobody.
//
// AND THERE IS NO DELETE. Blotato's comments API exposes get, list and post --
// no delete, no edit (checked against the live tool surface, 22 Sep 2026). A
// wrong reply here is permanent. That is why nothing below carries a time, a
// price, a capacity, a location, a promise, or a person's name: being wrong
// inside this envelope costs a tone point, not a correction.

// ---------------------------------------------------------------------------
// PRAISE. Exact whole-comment matches only.
//
// NOT a keyword list and NOT a prefix test. All three independent reviews broke
// the prefix version with the same shape: "Awesome time, shame about the trash
// on the shore" carries a praise token, no complaint word, no question mark and
// sits under 120 characters. The classifier requires the WHOLE normalised
// comment to be a member of this list, which that sentence can never be.
// ---------------------------------------------------------------------------
const PRAISE_PHRASES = [
  "awesome", "awesome time", "awesome video", "amazing", "amazing video",
  "great video", "great shot", "great time", "love it", "love this", "loved it",
  "hell ya", "hell yeah", "lets go", "let's go", "so fun", "looks fun",
  "looks amazing", "beautiful", "sick edit", "this is awesome", "this is great",
  "best day ever", "so cool", "nice", "epic", "fire",
];

// A comment with no letters at all is invisible to every hold rule, because
// every hold rule is a word regex. So emoji-only is allowed ONLY from a positive
// allowlist -- a skull, a clown face or a thumbs-down must never collect the
// same warm thank-you as a heart.
const POSITIVE_EMOJI = ["❤️", "❤", "🧡", "💛", "💚", "💙", "💜", "🤍", "🔥", "😍", "🥰",
  "👏", "🙌", "😎", "🤩", "👍", "⚓", "🛥️", "🛥", "🚤", "🌊", "☀️", "🤙", "💯", "🙏"];

// ---------------------------------------------------------------------------
// THE TYPO MAP, and the rule that keeps it safe.
//
// ENTRIES ARE ADDED ONLY AFTER A REAL COMMENT HAS BEEN SEEN AND THE OWNER HAS
// AGREED TO THAT SPECIFIC ENTRY. There is no edit-distance function here and
// there must never be one.
//
// All three reviews independently proved Levenshtein over four-letter keywords
// is a common-word magnet: Love->COVE, Beach->BACH, Slow->GLOW, Wow->GLOW,
// Gay->BDAY, Bruised->CRUISE, Boat, Day, Bad, Back, Cave, Code. Every false
// positive is a wrong joke at a stranger's expense, published permanently with
// no way to pull it. A hand-written map gets the one real case and nothing else.
// ---------------------------------------------------------------------------
const TYPO_MAP = {
  lube: "TUBE", // Facebook, 23 Sep 2026, under a tubing post. The owner liked the reply.
};

// ---------------------------------------------------------------------------
// THE REPLIES. Deliberately plain. The sharpest line is the one he presses send
// on -- the machine gets the second-funniest draft, because the machine has no
// way to know it misread the room.
// ---------------------------------------------------------------------------
const TEMPLATES = {
  "praise-1": "Thank you! Appreciate that.",
  "praise-2": "Thank you — that means a lot.",
  "praise-3": "Appreciate you 🙌",
  "praise-emoji": "Appreciate you 🙌",
  // The one dry line the machine is trusted with. The butt is our own bot being
  // a pedant, never the guest's spelling -- that is gate 2, and reversing it is
  // the difference between siding with him and correcting him in public.
  "keyword-rescue": "Close enough 😄 Our keyword bot only answers to {KEYWORD}, so we overruled it. Message us and we'll send it over.",
};

// Rotating the thank-you stops a comment section reading as one bot answering
// itself. Deterministic on the comment id, never random: the same comment must
// resolve to the same reply on a retry, in a stack with no delete.
function praiseTemplateFor(commentId) {
  const s = String(commentId || "");
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n + s.charCodeAt(i)) % 3;
  return "praise-" + (n + 1);
}

function render(templateId, vars) {
  const raw = TEMPLATES[templateId];
  if (!raw) return null;
  let out = raw;
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.split("{" + k + "}").join(String(v));
  }
  // A variable that never resolved would publish a literal "{KEYWORD}". Refuse
  // rather than post it; the caller treats null as a hold.
  if (/\{[A-Z_]+\}/.test(out)) return null;
  return out;
}

module.exports = {
  PRAISE_PHRASES, POSITIVE_EMOJI, TYPO_MAP, TEMPLATES,
  praiseTemplateFor, render,
};
