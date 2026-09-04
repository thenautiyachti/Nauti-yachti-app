// Priority for the board.
//
// Two kinds of item land here and they have to be ranked together: crew items
// carrying an explicit tier ("[PENNY · T1] ..."), and items the owner typed
// himself, which carry nothing. Ranking only the tagged ones would push every
// item he wrote to the bottom regardless of what it says, so untagged items are
// read for what they are about.

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

// Money the business is holding, or a live legal/safety exposure, is the top of
// the board no matter who wrote it. These patterns are deliberately narrow --
// anything vaguer belongs in medium, where it is still visible.
const HIGH = /\b(nudity|topless|refund|holding \$|we are holding|money is still ours|never ran|paid for that never|unrecorded|missing payment|no payment recorded|liability|waiver|attorney|insurance|overdue|late fee|expired?|security:|breach|password|secret key)\b/i;
const MEDIUM = /\b(deadline|due |by \d|before \d|renewal|expires|back-?fill|reconcile|missing|gap|placeholder|re-?source|wrong address|listing|lost sale|declined|turned away|capacity)\b/i;

// Items written as "[2026-09-05] shoot the weekend" carry their own deadline,
// and a date arriving in two days outranks whatever the wording suggests. The
// content-capture task sat at the bottom of the board on the Thursday before
// the Saturday it was about, which is the case this exists for.
function daysUntil(body) {
  const m = String(body).match(/\[?(\d{4}-\d{2}-\d{2})\]?/);
  if (!m) return null;
  const then = new Date(m[1] + "T12:00:00");
  if (isNaN(then)) return null;
  return Math.round((then - Date.now()) / 86400000);
}

function priorityOf(text) {
  const { tier, body } = parseItem(text);

  const due = daysUntil(body);
  // Only future dates promote. A date in the past is usually context ("paid on
  // 25 Jun"), not a deadline, and treating it as one would promote everything.
  const imminent = due !== null && due >= 0 && due <= 2;
  const soon = due !== null && due > 2 && due <= 7;

  // An explicit tier is the author's own judgement; trust it, except that a
  // deadline inside two days can still raise it.
  if (tier === 1) return "high";
  if (tier === 2) return imminent ? "high" : "medium";
  if (tier === 3) return imminent ? "high" : soon ? "medium" : "low";

  if (HIGH.test(body)) return "high";
  if (imminent) return "high";
  if (MEDIUM.test(body) || soon) return "medium";
  return "low";
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

module.exports = { PRIORITY, parseItem, priorityOf, sortBoard };
