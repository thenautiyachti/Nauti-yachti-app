// The FAQ, as one shared source of truth.
//
// This array feeds BOTH the visible page and the FAQPage structured data that
// Google reads. Google requires that FAQ structured data contain only text
// actually visible on the page, so these must never diverge -- which is why
// there is one array and not two.
//
// THREE WORKED EXAMPLES, then blanks.
//
// WHAT TO WRITE. These are not the questions you wish people asked. They are
// the questions that stop someone booking, and you already know what they are
// because you answer them by text message every week. Fuel, licences, what
// happens if the weather turns, whether they can bring drink, what the deposit
// is. Every one you answer here is a message you do not have to send.
//
// AND THE PROVENANCE RULE APPLIES HERE TOO: a policy answer must match your
// actual terms page. An FAQ that is more generous than your terms is the one a
// guest will screenshot.

const FAQ_ITEMS = [
  // ------------------------------------------------------------- EXAMPLE 1
  // A legal answer. The example is TEXAS law -- if you operate anywhere else,
  // this answer is WRONG and must be replaced with your own state's rule. Left
  // in because it shows the shape: state the rule, say who it applies to, then
  // say what to do if it applies to them.
  {
    q: "Do I need a boating licence to rent a boat on <YOUR LAKE>?",
    a: "For captained charters, no -- a licensed captain operates the boat and you are a passenger. " +
       "It only matters for self-drive options. <STATE YOUR OWN STATE'S RULE HERE. In Texas, anyone " +
       "born on or after 1 September 1993 must complete a Parks & Wildlife approved boater education " +
       "course before operating a motorboat over 15 horsepower, and must carry proof and photo ID " +
       "aboard.> If that applies to whoever is driving, book a captained charter instead -- it is the " +
       "simpler option.",
  },

  // ------------------------------------------------------------- EXAMPLE 2
  // The single most-asked question in this industry. Answer it precisely and
  // it removes an entire category of email.
  {
    q: "What is included in the price?",
    a: "<List it exactly, and match prisma/seed.js. Fuel? Equipment? Ice and water? Decorations on " +
       "party packages?> The price you are quoted is for the whole boat for the whole charter, not " +
       "per person.",
  },

  // ------------------------------------------------------------- EXAMPLE 3
  // The one most operators leave vague, and the one people most want answered
  // before they hand over a deposit. Vagueness here costs bookings.
  {
    q: "What happens if the weather is bad?",
    a: "<Your real policy. What counts as bad enough to call it off, who decides and when, whether " +
       "you reschedule or refund, and what happens if the weather turns mid-charter.> Say the real " +
       "thing, even if the real thing is 'the captain decides on the morning' -- a clear answer you " +
       "might not love beats no answer.",
  },

  // Add your own. Ten to fifteen is a good target. Write them as somebody
  // would actually ask them, not as headings.
];

module.exports = { FAQ_ITEMS };
