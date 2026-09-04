// How the board ranks itself, written from the owner's own calls.
//
// The old ranking was keyword matching: say "insurance" or "refund" anywhere in
// an item and it went High. That produced a board where nine of fifteen High
// items were things he would have called Low, and it taught the crew to reach
// for loud words. On 4 Sep 2026 he went through fourteen items one at a time and
// said where each belonged. This file is that, written down.
//
// THE PRINCIPLE HE APPLIED, in his own framing: High is for something happening
// TO the business right now -- money at real risk, a boat that cannot sail, a
// legal exposure live on every charter already run. Everything else is work, and
// work is Medium or Low however urgent it feels to whoever filed it.
//
// His words are quoted against each rule, because a rule you cannot trace back
// to a decision is a rule nobody can argue with later.
//
// ORDER IS THE WHOLE DESIGN. Six of the first fourteen test cases failed on
// ordering rather than on patterns: "the open Saturdays" listed as a content
// TOPIC made the social-queue item look like an observation; "boating license"
// in the bareboat item read as legal exposure; "would not start", describing a
// failure three months ago, read as a boat down today. Each rule below is
// placed where it is for a reason, and the tests in scratchpad/test-priority.js
// hold that order in place.

// --- money ------------------------------------------------------------------
//
// "if it was high dollar amount, over a thousand or so, then i would promote it
// to high" -- on the $94.17 Lockaway duplicate, which he placed at Medium.
//
// "This is low dollar amount, i would move it to low prio" -- on Klarna at
// $17.50 a month.
//
// $1,000 is his, stated. The Low boundary is INFERRED: it has to fall between
// Klarna's 17.50 and Lockaway's 94.17, and 50 is the round number in that gap.
// If a $60 discrepancy ever reads as Low to him, this is the line to move.
const MONEY_HIGH = 1000;
const MONEY_LOW = 50;

// Largest dollar figure in the text -- largest, not first, because an item often
// opens with a monthly figure and the real exposure is the total further in.
function largestAmount(s) {
  const hits = String(s).match(/\$\s?([\d,]+(?:\.\d{2})?)|\b([\d,]+\.\d{2})\s*dollars?\b/gi) || [];
  let max = null;
  for (const h of hits) {
    const n = Number(String(h).replace(/[^0-9.]/g, ""));
    if (!isNaN(n) && (max === null || n > max)) max = n;
  }
  return max;
}

// A boat that cannot sail RIGHT NOW. Present tense only, and that is the point:
// "as of now all boats are working. High would be a boat is down and i would
// notify you of that."
//
// An earlier version also matched "would not start" and "broke down", which are
// how you describe a failure that already happened. It put the mechanical-failure
// analysis -- a review of June and July -- at High, which is exactly the mistake
// he was correcting.
const BOAT_DOWN = /\b(boat is down|is out of service|currently down|cannot sail|not seaworthy|unsafe to sail|won'?t start|will not start)\b/i;

// Live exposure. He pointedly did NOT downgrade the TPWD insurance item.
//
// Narrow on purpose. This once matched a bare "license", which sent the bareboat
// LISTING item to High because Boatsetter asks renters to hold one. Exposure
// means the business is carrying a risk, not that a document is mentioned.
const EXPOSURE = /\b(insurance|liability|uninsured|under-?insured|waiver|attorney|lawsuit|not covered|minimum required|must carry|violation|non-?compliant)\b/i;

// Brand safety on something about to go out. Never negotiable: the whole point
// of the gate is that it does not bend.
const BRAND_SAFETY = /\b(nudity|topless|nude|explicit|minor|underage)\b/i;

// Warm leads. "This is a low prio." Checked BEFORE reviews, because a lead who
// was once in somebody's party is described in the same words as a review ask
// and would otherwise be caught by it.
const WARM_LEAD = /\b(warm lead|may book|might book|interested in booking|follow up with)\b/i;

// Content production -- work to go and film. He put a shoot happening TOMORROW
// at Low: "This is definentely not a high prio, this is low at best." Which is
// why no date, however close, promotes one of these.
//
// PRODUCTION VERBS ONLY. An earlier version also matched "post", "content" and
// "story", which swallowed the social-queue item -- and an empty queue is a
// pipeline problem, not a thing to go and film.
const CONTENT = /\b(shoot|shot live|filming|production required|no production|compilation|collab|dms\b|send .{0,12}dms)\b/i;

// The queue running dry. "When the queue become low and not far out, the media
// agent needs to start coming up with more idea to populate the next week."
// Medium: real, dated, and nobody's emergency.
const PIPELINE_GAP = /\b(queue (is |now )?(empty|ends|running low|runs out)|pipeline is empty|nothing (follows|is scheduled) (it|after)|nothing follows)\b/i;

// Reviews, which he capped and gave a count ladder for:
// "This would be a low prio as its less than 5 guests, medium would be 5-10. i
// dont think this should ever be High, its not like we have 0 reviews."
const REVIEWS = /\b(google review|reviews?|testimonial|review request)\b/i;

// Maintenance and logging, capped: "This would be a medium at max, we havent
// started logging yet so this should be its max status." Includes "mechanical",
// because the mechanical-failure analysis belongs here rather than at High.
const MAINTENANCE = /\b(maintenance|mechanical|engine hours|enginehourslog|last ?done|service interval|oil change|logging|repair)\b/i;

// Observations with nothing to do. Two items he described the same way: "more
// so just a note", "more so just something to note".
//
// "Saturdays ARE open" rather than "the open Saturdays" -- the loose version
// matched the social-queue item, which listed open Saturdays as a content topic
// and is not an observation at all.
const NOTE_ONLY = /\b(note:|worth noting|for the record|historical|(saturdays?|weekends?|dates?) (are|is) open|drew .{0,40}inquiries)\b/i;

// Work that holds its value or plainly earns. He moved gift certificates UP:
// "These hold value well, i woudl make this a medium prio tho."
const REVENUE_MECHANISM = /\b(gift certificate|gift card|bareboat|listing|list the|package|pricing|coupon|discount)\b/i;

// Books and pipeline gaps, all of which he placed at Medium.
const BOOKS_OR_PIPELINE = /\b(ledger|books|reconcile|statement|queue|scheduled|converting|conversion|inquir)\b/i;

// How many guests an item is about, for the review ladder.
function guestCount(s) {
  const m = String(s).match(/\b(\d+)\s+(?:past\s+)?guests?\b/i) || String(s).match(/\bonly\s+(\d+)\b/i);
  return m ? Number(m[1]) : null;
}

// Returns { priority, why }. The reason travels with the answer so the console
// and the crew can both show WHY something sits where it does -- the thing the
// old keyword matcher could never explain.
// Money the business could actually lose, as opposed to money merely mentioned.
//
// The open-Saturdays item says "$3,726 of unsold capacity" and went to High on
// that figure alone -- but nobody is losing $3,726, that is an estimate of what
// selling eight Saturdays would be worth. He filed it as Low, and called it
// "more so just a note".
//
// So an amount only ranks when the sentence says something has gone wrong with
// it. Upside is not exposure.
const AT_RISK = /\b(holding|held|owed|missing|unrecorded|not recorded|none of it is in|duplicate|entered twice|double.?count|overstated|refund|short|discrepanc|unpaid|never paid|at risk|write off|written off|chase)\b/i;

function classify(claim, tier, opts) {
  const s = String(claim || "");
  // High is decided by the HEADLINE, not by an aside further down.
  //
  // The bareboat item is about a listing, and went to High because the word
  // "insurance" appears three sentences in. Its lead says nothing of the kind.
  // Reading the whole claim for the High tests means any long item eventually
  // contains a scary word; reading the lead means the item has to actually be
  // about it.
  // Callers pass the lead formatBody already worked out. The fallback is only
  // for direct calls, and avoids lookbehind so it runs in any browser.
  const head = (opts && opts.lead) || (s.match(/^[^.!?]*[.!?]?/) || [s])[0] || s;
  const amount = largestAmount(s);

  // 1. High, and only these. Something happening to the business now.
  if (BRAND_SAFETY.test(head)) return { priority: "high", why: "brand safety on something due to publish" };
  if (BOAT_DOWN.test(head)) return { priority: "high", why: "a boat that cannot sail" };
  if (EXPOSURE.test(head)) return { priority: "high", why: "live legal or insurance exposure" };
  if (amount !== null && amount >= MONEY_HIGH && AT_RISK.test(s)) {
    return { priority: "high", why: "$" + amount.toLocaleString() + " at risk, over the $1,000 line" };
  }

  // 2. Ceilings, in the order that keeps them from stealing each other's items.
  if (WARM_LEAD.test(s)) return { priority: "low", why: "a warm lead, not a booking" };
  if (CONTENT.test(s)) return { priority: "low", why: "content production, which no date promotes" };
  if (PIPELINE_GAP.test(s)) return { priority: "medium", why: "the queue running dry" };
  if (REVIEWS.test(s)) {
    const n = guestCount(s);
    if (n !== null && n < 5) return { priority: "low", why: n + " guests, fewer than 5" };
    if (n !== null && n <= 10) return { priority: "medium", why: n + " guests, in the 5-10 band" };
    return { priority: "medium", why: "reviews never reach high" };
  }
  if (MAINTENANCE.test(s)) {
    return { priority: "medium", why: "capped at medium until a boat is actually down" };
  }
  if (NOTE_ONLY.test(s)) return { priority: "low", why: "an observation, with nothing to do" };

  // 3. Money below the High line -- again, only money actually at risk.
  if (amount !== null && AT_RISK.test(s)) {
    if (amount >= MONEY_LOW) return { priority: "medium", why: "$" + amount.toFixed(2) + " at risk, under the $1,000 line" };
    return { priority: "low", why: "$" + amount.toFixed(2) + " at risk, a small amount" };
  }

  // 4. Ordinary work.
  if (REVENUE_MECHANISM.test(s)) return { priority: "medium", why: "revenue work that holds its value" };
  if (BOOKS_OR_PIPELINE.test(s)) return { priority: "medium", why: "a gap in the books or the pipeline" };

  // 5. Nothing matched. Fall back to what the author declared -- but a tier
  // alone can no longer reach High, because over-tiering is what the old board
  // was full of.
  if (tier === 1 || tier === 2) return { priority: "medium", why: "filed as T" + tier + ", nothing else matched" };
  return { priority: "low", why: "nothing matched" };
}

module.exports = { classify, largestAmount, guestCount, MONEY_HIGH, MONEY_LOW };
