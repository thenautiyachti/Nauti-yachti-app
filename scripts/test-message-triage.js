// Does the DM triage let through only what it should?
//
//     node scripts/test-message-triage.js
//
// This is the test that matters most in the whole auto-reply feature, because
// it is the only thing standing between a regex and the business saying
// something binding to a named person without anybody reading it first.
//
// The three real messages sitting in the inbox on 17 Sep 2026 are the first
// three cases, verbatim. If a change to the rules ever lets the stock-tip pitch
// through or holds the seats question, this says so.
const { triage, rules } = require("../lib/messageTriage");

let pass = 0;
const failures = [];

function check(label, text, expected, opts) {
  const got = triage(text, opts);
  if (got.action === expected) {
    pass++;
  } else {
    failures.push({
      label,
      expected,
      got: got.action,
      rule: got.rule,
      reason: got.reason,
      text: String(text).slice(0, 70),
    });
  }
}

// --- the three actually in the inbox, word for word ------------------------
check("the cleanup offer (10 days old)",
  "Good morning. I will work with you guys to clean up. I don't take part in the after hours " +
  "in the water to many things can go wrong especially once the alcohol is involved. I have 2 " +
  "boats personally I can use to help and also can get in touch with others to help as well. " +
  "Not trying to make money or anything just want the lake taken care of.",
  "hold");

check("the seats question (2 hours old)",
  "Hey bub, you got any seats open for Saturday?", "reply");

check("the stock-tip pitch",
  "Hello! Are you currently following the U.S. stock market? We run a free WhatsApp group " +
  "centered around U.S. equities. We discuss selected stocks and market trends.",
  "hold");

// --- things it SHOULD answer ------------------------------------------------
check("plain availability", "Any seats left for saturday?", "reply");
check("price", "How much is the glow party per person?", "reply");
check("time", "What time does it start?", "reply");
check("what's included", "Do you provide tubes or do I bring my own?", "reply");
check("where", "Where do we meet?", "reply");
check("two questions is still fine", "How much is it and what time do you board?", "reply");
check("casual phrasing", "yo got any room friday night", "reply");

// --- things it MUST NOT answer ---------------------------------------------
check("injury", "My daughter hurt her ankle getting off the boat, who do I talk to?", "hold");
check("damage", "I think we damaged the ladder, what happens now", "hold");
check("refund", "I need a refund for the trip we missed", "hold");
check("reschedule", "Can I reschedule my booking to next month?", "hold");
check("haggling", "Any chance you can do a discount for 10 of us?", "hold");
check("lawyer", "My attorney will be contacting you about the waiver", "hold");
check("complaint", "The captain was rude and we want to complain", "hold");
check("photo takedown", "Take that picture of me down please", "hold");
check("NDA charter", "Were you the boat at Lake Bryan in June?", "hold");
check("marketing pitch", "Hi! We can grow your followers to 50k, DM me", "hold");
check("empty", "", "hold");
check("sticker only", "   ", "hold");
check("unrecognised chat", "hey", "hold");
check("unrecognised statement", "Cool boat man", "hold");
check("three questions", "How much? What time? Can we bring a dog? Do you do refunds?", "hold");
check("a wall of text", "Hi there ".repeat(45), "hold");

// --- the awkward middles ----------------------------------------------------
// A price question wrapped in a complaint is a complaint.
check("price question inside a complaint",
  "How much is it? Last time was terrible and the captain was rude.", "hold");
// Availability with no resolvable date is not answerable, however friendly.
check("availability with no date the caller can resolve",
  "Got any seats open?", "reply", { dateResolved: true });
check("availability, date could not be resolved",
  "Got any seats open?", "hold", { dateResolved: false });
// Money that has already moved, phrased as a simple question.
check("already paid", "I already paid, can you move it to Sunday?", "hold");

// --- CONFIRMING A TIME, which is how guests actually ask ------------------
//
// Facebook, 18 Sep 2026, 4:42pm: "So boats take off at 5?" Held as
// unrecognised, because the pattern knew "what time" and "when does" and
// nothing else. Nobody phrases it that way when they are checking something
// they have already read -- they quote the time back at you.
//
// It matters more than usual this month. The glow night moved from 7pm to 5pm
// on 17 Sep and posts saying 7 are still out there, so every guest who saw an
// old one asks in exactly this shape.
check("the message that was held", "So boats take off at 5?", "reply");
check("checking an old time", "Is it still 7pm?", "reply");
check("quoting the time back", "5pm right?", "reply");
check("confirming with a tag", "So we leave at 5 yeah?", "reply");
check("a departure verb", "Do the boats depart at 5?", "reply");
check("no punctuation, no am/pm", "are you still doing 7", "reply");
check("the nautical phrasing", "what time do you push off", "reply");
check("the other end of the night", "when are we back", "reply");

// AND THE MONEY TRAPS. A price question wearing the same clothes must not be
// answered with a departure time -- that is worse than holding it, because the
// guest gets a confident answer to a question they did not ask.
check("a price, not a time", "Is it still $50?", "hold");
check("a party size, not a time", "Can I bring 5 people?", "hold");
check("money already paid", "I paid $100 already", "hold");

const r = rules();
console.log("  " + r.hold.length + " hold rules, " + r.intents.length + " answerable intents");
console.log("  a message over " + r.longMessage + " chars or with more than " +
  r.manyQuestions + " questions is always held\n");

if (failures.length) {
  console.log("  " + pass + " passed, " + failures.length + " FAILED\n");
  for (const f of failures) {
    console.log("  FAIL  " + f.label);
    console.log("        expected " + f.expected + ", got " + f.got + " (" + f.rule + ": " + f.reason + ")");
    console.log("        \"" + f.text + "\"");
  }
  process.exitCode = 1;
} else {
  console.log("  " + pass + "/" + pass + " passed — the envelope holds.");
}
