// WHICH DIRECT MESSAGES MAY BE ANSWERED WITHOUT THE OWNER, AND WHICH MAY NOT.
//
// Owner's decision, 17 Sep 2026: "messages should be auto reply unless it's too
// difficult to answer... The only time you shouldn't auto reply is when the
// question doesn't pertain to anybody, nobody, or if it's too difficult of a
// question that answer meaning I would need to step in."
//
// His reasoning is right and worth writing down, because it is the thing that
// makes this different from the comment queue: a DM goes to ONE person. A wrong
// comment is published under the business's name to everyone who reads the
// thread; a wrong DM is a sentence to a single human being who can be corrected
// in the next sentence. And a booking question that waits two hours is a
// booking that goes to whoever answered first. Speed is worth more here than
// caution is.
//
// THIS FILE IS THE WHOLE SAFETY ARGUMENT, so it is built the pessimistic way
// round: a message is HELD unless something here positively recognises it. An
// unrecognised message is not a safe message, it is a message nobody has
// understood, and the failure mode of guessing is the business saying something
// binding to a named person in writing.
//
// The comment queue already has the cautionary tale. On 7 Sep 2026 a confident
// suggested reply — that a guest's photo was AI-generated — was flatly wrong;
// the file still carried Samsung camera Exif. It was caught because a person
// read it before it went out. Nothing will catch the equivalent here, so the
// envelope has to be narrow enough that being wrong inside it is cheap.

// ---------------------------------------------------------------------------
// HOLD TRIGGERS. Any one of these and the owner answers it himself.
//
// Ordered roughly by how badly an automatic answer would go.
// ---------------------------------------------------------------------------
const HOLD_RULES = [
  {
    id: "safety",
    why: "someone may have been hurt, or something was damaged",
    // An injury, a damaged boat, a near miss, the authorities. The right reply
    // to any of these is a phone call from a person, and anything automatic
    // reads as the business not taking it seriously — which is also how it will
    // read later, in writing, to somebody's lawyer.
    re: /\b(hurt|injur|accident|crash|collid|damag|broke|broken|sank|sink|capsiz|drown|emergenc|ambulance|hospital|police|sheriff|game warden|coast guard|citation|ticketed)\b/i,
  },
  {
    id: "legal",
    why: "legal, insurance, liability or a refund is in it",
    // Never negotiate a claim or a refund automatically. The owed-charter rule
    // already says the standing answer is to offer a weekend, not a refund, and
    // that is a judgement about a relationship, not a lookup.
    re: /\b(lawyer|attorney|legal|liabilit|insuranc|claim|sue|suing|lawsuit|refund|chargeback|dispute|waiver|nda|non.?disclosure|contract|subpoena)\b/i,
  },
  {
    id: "complaint",
    why: "it reads as a complaint or a grievance",
    // A complaint answered by a machine is a complaint made worse. This is the
    // same instinct behind the comments tab existing at all: the litter thread
    // on 6 Sep 2026 drew four challenges and the first sat twenty-three hours.
    re: /\b(complain|unhappy|disappoint|unaccept|terrible|awful|worst|rude|ripped off|rip.?off|scam|refus|never again|report you|bbb|review bomb)\b/i,
  },
  {
    id: "money-change",
    why: "it asks to change money that has already moved",
    // Repricing a paid booking is not a lookup. The pay page itself carries the
    // rule: charge from priceQuoted, never from pricePaid, or a guest is billed
    // twice for what they have already settled.
    re: /\b(already paid|i paid|discount|deal|cheaper|lower the|match the price|price match|negotiat|payment plan|deposit back|cancel my|reschedul)\b/i,
  },
  {
    id: "solicitation",
    // The owner's own words: "the question doesn't pertain to anybody, nobody".
    // The Instagram inbox currently holds a stock-tip pitch. Answering a
    // solicitation teaches the sender the account is live and answers.
    why: "a pitch or spam, not a guest",
    re: /\b(whatsapp group|stock|equities|crypto|bitcoin|forex|invest|trading|seo|grow your (followers|account|business)|promote your|marketing servic|web ?design|collaborat(e|ion) (offer|opportunit)|sponsorship|brand deal|dm me|click the link|check my bio)\b/i,
  },
  {
    id: "nda",
    why: "it touches the charters under NDA",
    // Lake Bryan, 6 and 13 June 2026. No media and no discussion, ever.
    re: /\b(lake bryan)\b/i,
  },
  {
    id: "media-request",
    why: "it is about photographs or taking something down",
    // "That's my photo" is exactly the case that went wrong in the comment
    // queue. Takedowns and photo requests both need a person.
    re: /\b(take (it|that|this) down|takedown|remove (the|that|my) (photo|picture|video|post)|my (photo|picture|face)|copyright|without (my )?permission)\b/i,
  },
];

// ---------------------------------------------------------------------------
// ANSWERABLE INTENTS. What the system can look up and state as fact.
//
// Every one of these resolves against LIVE DATA — the availability for a date,
// the Package table's price, the vessel capacities. None of them is a judgement
// call, and that is the entire test for whether something belongs on this list.
// ---------------------------------------------------------------------------
const INTENTS = [
  {
    id: "availability",
    why: "asking whether we have room on a date",
    re: /\b(seats? (open|left|available)|any (room|space|seats|spots)|got (room|space|any seats)|openings?|availabilit|are you (open|running|doing)|still (have|got) (room|seats|space)|book(ing)? (for|on)|how many (seats|spots))\b/i,
  },
  {
    id: "price",
    why: "asking what it costs",
    re: /\b(how much|what.{0,12}(cost|price|rate)|price|pricing|per (person|seat|head)|rates?)\b/i,
  },
  {
    id: "schedule",
    why: "asking when it runs",
    // THREE SHAPES, because guests only use one of them and it was the one
    // missing. Facebook, 18 Sep 2026, 4:42pm: "So boats take off at 5?" — held
    // as unrecognised, because the pattern knew "what time" and "when does" and
    // nothing else.
    //
    //   1. the open question   "what time do you leave"
    //   2. a departure verb    "take off", "push off", "lines off"
    //   3. CONFIRMING a time   "at 5?", "still 7pm?", "5pm right?"
    //
    // The third is the one that matters most this month. The glow night moved
    // from 7pm to 5pm on 17 Sep and posts saying 7 are still out there, so the
    // guests who saw the old ones all ask in exactly that shape — and every one
    // of them was being held for a human who might not look until morning.
    //
    // The money guards are not decoration. "Is it still $50?" is a price
    // question wearing the same clothes, and answering it with a departure time
    // is worse than holding it.
    re: new RegExp([
      // 1 — asking outright
      "\\b(?:what time|when (?:do|does|did|is|are|will|should)|start time|board(?:ing)? time|how long|duration|hours?)\\b",
      // 2 — the boat moving, in the words people actually use
      "\\b(?:takes?\\s?off|taking\\s?off|leaves?|leaving|departs?|departing|departure|push(?:es|ing)?\\s?off|lines?\\s?off|rope\\s?off|heads?\\s?out|set\\s?sail|shove\\s?off|get(?:ting)?\\s?back|be\\s?back)\\b",
      // 3a — an explicit clock time, never a dollar amount
      "(?<![$\\d])\\b\\d{1,2}(?::\\d{2})?\\s?(?:am|pm|a\\.m\\.|p\\.m\\.)\\b",
      // 3b — "still 7", "so ... at 5", "5 right?"
      "\\bstill\\s+(?:doing\\s+)?(?<![$])\\d{1,2}\\b",
      "\\b(?:so|it'?s|we|you)\\b[^?$]{0,40}\\bat\\s+(?<![$])\\d{1,2}\\b",
      "(?<![$])\\b\\d{1,2}\\s*(?:right|yeah|yea|yep|correct)\\b",
    ].join("|"), "i"),
  },
  {
    id: "whats-included",
    why: "asking what comes with a charter",
    re: /\b(what.{0,10}(included|come with|get)|do (you|we) (provide|supply|have)|bring (my|our) own|byob|cooler|tub(e|ing)|wakeboard|grill|decorat|balloon|champagne)\b/i,
  },
  {
    id: "where",
    why: "asking where to meet",
    re: /\b(where (do|are|is|should)|meet(ing)? (point|spot|place)|which (dock|ramp|marina)|address|location|scotts? ridge)\b/i,
  },
];

// A wall of text is a conversation, not a lookup. Somebody who writes four
// sentences is telling you something, and an answer to the one clause a regex
// matched will read as not having been read at all.
const LONG_MESSAGE = 320;

// More than one question mark usually means more than one question, and the
// reply will answer one and ignore the other.
const MANY_QUESTIONS = 2;

/**
 * Decide what to do with one inbound direct message.
 *
 * Returns { action: "reply" | "hold", intents: [...], reason, rule }.
 * "reason" is written to be shown to the owner verbatim, on the card, so he can
 * see WHY a thread was held without reading this file.
 */
function triage(text, opts) {
  const body = String(text == null ? "" : text).trim();
  const o = opts || {};

  if (!body) {
    return { action: "hold", intents: [], rule: "empty", reason: "there is no text to read — it may be an image or a sticker" };
  }

  // Hold rules run FIRST and win outright. A message can perfectly well ask
  // about price and be a complaint at the same time, and when it is both, it is
  // a complaint.
  for (const r of HOLD_RULES) {
    if (r.re.test(body)) {
      return { action: "hold", intents: [], rule: r.id, reason: r.why };
    }
  }

  if (body.length > LONG_MESSAGE) {
    return {
      action: "hold", intents: [], rule: "long",
      reason: "it is " + body.length + " characters — long enough to be a conversation rather than a question",
    };
  }

  const questions = (body.match(/\?/g) || []).length;
  if (questions > MANY_QUESTIONS) {
    return {
      action: "hold", intents: [], rule: "many-questions",
      reason: "it asks " + questions + " separate questions, and a single reply will miss one",
    };
  }

  const intents = INTENTS.filter((i) => i.re.test(body)).map((i) => i.id);
  if (!intents.length) {
    return {
      action: "hold", intents: [], rule: "unrecognised",
      reason: "nothing in it matches a question the system can answer from its own data",
    };
  }

  // An answerable question about a date we cannot resolve is not answerable.
  // Saying "yes we have room" without knowing which day is the one mistake in
  // this whole file that costs a real seat.
  if (intents.includes("availability") && o.dateResolved === false) {
    return {
      action: "hold", intents, rule: "no-date",
      reason: "it asks about availability but no date could be worked out from it",
    };
  }

  return {
    action: "reply",
    intents,
    rule: intents[0],
    reason: INTENTS.find((i) => i.id === intents[0]).why,
  };
}

/** Every hold rule and intent, for the console to display and for tests. */
function rules() {
  return {
    hold: HOLD_RULES.map((r) => ({ id: r.id, why: r.why })),
    intents: INTENTS.map((i) => ({ id: i.id, why: i.why })),
    longMessage: LONG_MESSAGE,
    manyQuestions: MANY_QUESTIONS,
  };
}

module.exports = { triage, rules, HOLD_RULES, INTENTS, LONG_MESSAGE, MANY_QUESTIONS };
