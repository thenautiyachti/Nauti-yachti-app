// Board items are not written in one sitting, and it shows.
//
// An item starts as a sentence. Then an agent checks it and appends "2026-09-03
// update: ...". Then Pearl measures it and appends "MEASURED 2026-09-04 by
// Pearl, and it is worse than the item says". Three weeks of that and the
// Christian Gehring item is a two-hundred-word paragraph in which the newest and
// most important fact is buried in the middle of the eleventh line.
//
// Nothing there is wrong. The accretion is the point -- an item that records
// what was checked and when is worth far more than one that gets quietly
// rewritten. It just cannot be read as one block of prose.
//
// So this splits an item into the three things it actually contains:
//
//   lead     the claim, as first written
//   points   the rest of that first pass, one line each
//   updates  everything appended since, each stamped with its own date
//
// It is a READING transform only. Nothing is dropped, reordered or reworded --
// every character of the original comes out somewhere. That is not a nicety:
// these items are the evidence trail for money and maintenance, and a renderer
// that quietly eats a clause is worse than no renderer at all. The test in
// scratchpad/test-boardtext.js round-trips every open item and fails on a
// single lost character.

// Dates appear two ways in the wild: ISO, which the agents write, and
// "4 Sep 2026", which the owner writes.
const DATEISH = "(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+[A-Z][a-z]{2,8}\\.?\\s+\\d{4})";

// The verbs the crew stamp an update with. A bare verb is not enough to split
// on -- "CLOSED" can appear in a sentence -- so each must be followed by a date.
const VERBS =
  "CLOSED|CHECKED|MEASURED|CORRECTED|RAISED|SHIPPED|VERIFIED|CONFIRMED|REVIEWED|RESOLVED|CAUSE ESTABLISHED|UPDATED|UPDATE|NOTE";

// An update stamp, matched only at the START of a sentence.
//
// Anchoring it to a sentence boundary is what stopped the Nova item shattering:
// its first line reads "(31 TAC 55.401-55.410) took effect 2026-05-01: liability
// insurance minimum raised...", and a floating date-colon pattern split it in
// half, leaving a lead of "410) took effect". A date only stamps an update when
// it opens the sentence.
// The verb and the date are not always adjacent. Pearl writes "RAISED TO HIGH by
// Pearl 2026-09-04:" as readily as "MEASURED 2026-09-04 by Pearl", so up to
// three shouted words and an attribution may sit between them.
const STAMP = new RegExp(
  "^(?:(\\b(?:" + VERBS + ")\\b(?:\\s+[A-Z][A-Z]*)*(?:\\s+by\\s+[A-Z][a-z]+)?\\s+(?:on\\s+)?" + DATEISH + ")" +
    "|(\\d{4}-\\d{2}-\\d{2}(?:\\s+update)?))" +
    "\\s*(?:by\\s+([A-Z][a-z]+))?\\s*[:,\\u2014\\u2013-]*\\s+"
);

// Sentence split with no lookbehind, so it runs in every browser that reaches
// the console -- including the phone he actually reads this on.
//
// Written as a scan over sentence ENDINGS rather than a match over sentence
// bodies, because the match form silently dropped any run of text containing an
// interior full stop: a URL, "@handle, @handle", "31 TAC 55.401". Eighty
// characters of one item vanished that way. Slicing between the endings cannot
// lose a character even when it guesses the boundary wrong.
//
// A full stop only ends a sentence when whitespace or the end of the string
// follows it, which is also what keeps "779.76 dollars" in one piece.
function sentences(s) {
  const str = String(s);
  const out = [];
  const re = /[.!?]+(?=\s|$)/g;
  let start = 0;
  let m;
  while ((m = re.exec(str))) {
    const end = m.index + m[0].length;
    out.push(str.slice(start, end).trim());
    start = end;
  }
  if (start < str.length) out.push(str.slice(start).trim());
  return out.filter(Boolean);
}

// One-clause sentences make miserable bullets. "It does not." on a line of its
// own is noise, so anything short folds back onto the line above it.
const SHORT = 45;
function asPoints(sents) {
  const points = [];
  for (const s of sents) {
    if (points.length && s.length < SHORT) points[points.length - 1] += " " + s;
    else points.push(s);
  }
  return points;
}

function formatBody(body) {
  const raw = String(body || "").trim();
  if (!raw) return { lead: "", points: [], updates: [] };

  // Blank lines the author put in deliberately survive as sentence breaks.
  const sents = raw
    .split(/\n+/)
    .flatMap((para) => sentences(para))
    .filter(Boolean);

  if (!sents.length) return { lead: raw, points: [], updates: [] };

  const lead = sents.shift();
  const points = [];
  const updates = [];

  for (const s of sents) {
    const m = s.match(STAMP);
    if (m) {
      updates.push({
        stamp: (m[1] || m[2] || "").replace(/\s+update$/i, "").trim(),
        who: m[3] || null,
        text: s.slice(m[0].length).trim(),
      });
    } else if (updates.length) {
      // Once an item is into its update history, later sentences belong to the
      // update they follow, not back up in the original claim.
      updates[updates.length - 1].text += " " + s;
    } else {
      points.push(s);
    }
  }

  return { lead, points: asPoints(points), updates };
}

module.exports = { formatBody, sentences, asPoints };
