// Priority for the board.
//
// Two kinds of item land here and they have to be ranked together: crew items
// carrying an explicit tier ("[PENNY · T1] ..."), and items the owner typed
// himself, which carry nothing. Ranking only the tagged ones would push every
// item he wrote to the bottom regardless of what it says, so untagged items are
// read for what they are about.

const { formatBody } = require("./boardText");
const { classify } = require("./boardPriority");

const PRIORITY = {
  high: { label: "High", color: "#E2685F", weight: 0 },
  medium: { label: "Medium", color: "#E8934A", weight: 1 },
  low: { label: "Low", color: "#6E8BA6", weight: 2 },
};

// "[PENNY · T1] text" -> { owner: "PENNY", tier: 1, body: "text" }
function parseItem(text) {
  const s = String(text || "");
  // Tier is OPTIONAL. "[PENNY · T1]" and "[PENNY]" are both her item; the tier
  // only says how loudly to shout. Requiring it meant every item she filed came
  // back ownerless and rendered as plain text beside everyone else's chips.
  // The separator class is deliberately generous. Three of Shelly's items are
  // stored as "[SHELLY . T2]" -- a full stop where the middot should be, from a
  // console that cannot print U+00B7 -- and the tighter class did not match
  // them at all. The cost of that was invisible and total: no owner, so no
  // chip; the literal text "[SHELLY . T2]" printed in the middle of the board;
  // and the tier ignored, so a T2 item was ranked by keyword guesswork instead
  // of by what she declared. Anything a human might type between the name and
  // the tier is accepted here.
  const m = s.match(/^\s*\[([A-Z][A-Z]*?)(?:[\s·.:|*\-–—]+T([0-9]))?\]\s*/);
  if (!m) return { owner: null, tier: null, body: s.trim() };
  return {
    owner: m[1].trim(),
    tier: m[2] ? Number(m[2]) : null,
    body: s.slice(m[0].length).trim(),
  };
}

// The keyword ladders that used to live here -- HIGH, MEDIUM and a daysUntil()
// deadline promoter -- are gone rather than kept for reference, because a dead
// rule set beside a live one is an invitation to edit the wrong one. Everything
// they did now lives in lib/boardPriority.js, where each rule is quoted against
// the decision it came from. daysUntil in particular is not coming back: it read
// the first ISO date in an item as a deadline, which meant the date on a
// verification note promoted the item that note was about.

// Rank on the CLAIM, never on the notes underneath it, and rank it by the rules
// the owner set out on 4 Sep 2026 rather than by keyword matching.
//
// Two separate faults were fixed here on the same day. The first: every
// verification note carries the date it was written -- "CHECKED 2026-09-04" --
// and daysUntil() read the first ISO date in the body as a deadline, so eight
// open items sat in High purely because somebody had checked them that morning.
// The board ranked attention rather than urgency, and got worse the more the
// crew did their job.
//
// The second: the keyword ladder itself. Say "insurance" or "refund" anywhere
// and an item went High, which produced a board where nine of fifteen High items
// were things he would have called Low. He went through fourteen of them by hand
// and said where each belonged; lib/boardPriority.js is that, written down, and
// it reproduces all fourteen.
//
// `why` is returned alongside so the console can say WHY something sits where it
// does -- the thing the old matcher could never explain.
function priorityDetail(text) {
  const { tier, body } = parseItem(text);
  const { lead, points } = formatBody(body);
  const claim = [lead, ...points].join(" ");
  return classify(claim, tier, { lead });
}

function priorityOf(text) {
  return priorityDetail(text).priority;
}

// High first, then medium, then low; newest first inside each band.
function sortBoard(items) {
  return [...(items || [])].sort((a, b) => {
    const pa = PRIORITY[priorityOf(a.text)].weight;
    const pb = PRIORITY[priorityOf(b.text)].weight;
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
}

module.exports = { PRIORITY, parseItem, priorityOf, priorityDetail, sortBoard };
