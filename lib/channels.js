// THREE QUESTIONS, THREE ANSWERS. They were one and a half.
//
// Written 11 Sep 2026, after the owner spotted the ledger calling a Stripe
// payment "Cash": "If Jim pays on stripe, his platform shouldn't be other ...
// The only way to capture cash payments would be me telling u they paid in
// cash, no other way to confirm it really."
//
// That is the whole principle. A payment method is ASSERTED, never inferred —
// there is no signal anywhere in this system that proves cash changed hands
// except the owner saying so. Guessing it from the booking channel is how card
// income ended up filed in the one column that is hardest to reconcile.
//
// The three questions, which used to share two columns and a lot of overlap:
//
//   LEAD SOURCE      where the enquiry came from        referralSource
//   BOOKING CHANNEL  who took and processed the booking platform
//   PAYMENT METHOD   how the money actually arrived     paymentMethod  (new)
//
// Before this, `LedgerEntry.origin` answered all three at once — it held
// payment methods (Cash, Zelle, Venmo), lead sources (Instagram, Friends) and,
// on five rows, a customer's name. Nothing could be summed from it.

// --- where the enquiry came from -------------------------------------------
// Never inferred from the booking channel. A GetMyBoat booking can come from a
// guest who found us on Instagram, and that is the interesting fact.
const LEAD_SOURCES = [
  "Website",
  "Text / WhatsApp",
  "Phone",
  "Walk-up",
  "Instagram",
  "Facebook",
  "Repeat guest",
  "Referral from a friend",
  // A charter run for another business we trade work with -- YOLO Lake Conroe,
  // who have a listing on our site. Both Lake Bryan trips were filed as
  // "Referral from a friend", which is not what that is: a partner sends work
  // repeatedly and is worth counting as a channel, a friend does it once.
  "Partner business",
  "Boatsetter",
  "GetMyBoat",
  "AI search (ChatGPT)",
  "Other",
];

// --- who took the booking ---------------------------------------------------
// "Other" was 19 of 77 rows and meant "we took it ourselves" — a text, a phone
// call, someone at the dock. "Direct" says that; "Other" said nothing, and the
// ledger read it as cash.
const BOOKING_CHANNELS = ["Boatsetter", "GetMyBoat", "Website", "Direct"];

// --- how the money arrived --------------------------------------------------
// Unpaid is a real answer and the default. Nothing here may be guessed.
//
// CASH APP IS NOT CASH. Added 13 Sep 2026, when the owner filled in the 2025
// backlog and Anari Smith's $495 turned out to have arrived that way. Folding it
// into "Cash" would have been convenient and wrong in the direction that
// matters: Cash App leaves a statement that can be reconciled and can charge a
// fee, and cash in a hand does neither. The whole point of this field is that
// the books can tell those apart.
const PAYMENT_METHODS = [
  "Unpaid",
  "Stripe (card)",
  "Cash",
  "Cash App",
  "Zelle",
  "Venmo",
  "PayPal",
  "Boatsetter payout",
  "GetMyBoat payout",
  "Gift certificate",
];

// What a payment method is called in the ledger's origin column, so the books
// keep the vocabulary they already have while the booking keeps the precise one.
//
// CORRECTED 13 Sep 2026. This used to map Stripe (card) to "Website", which is
// a SOURCE, not a way of paying -- the owner's ruling that day: "Where they came
// from and how they paid are different means. They could go to our website and
// pay via stripe, or pay in person with cash." A website booking paid in cash
// was therefore filed as "Website" income and read as card, and a cash charter
// that came from Instagram was filed under "Instagram", which is not a payment
// method at all.
const LEDGER_ORIGIN = {
  "Stripe (card)": "Stripe",
  "Cash": "Cash",
  // "Cash App Statement", with the space, is the spelling 13 expense rows
  // already use and therefore the one that wins.
  //
  // The AdminView dropdown said "CashApp Statement" without it, so the code and
  // the books had disagreed for as long as both existed -- harmless only because
  // no income row had ever been Cash App. Writing Anari's as the code's spelling
  // created the first collision, and two spellings of one channel is exactly
  // what this map exists to prevent. Same reason PayPal maps to "Paypal
  // Statement" rather than to itself: match the books, do not tidy them.
  //
  // It is its OWN origin and not "Cash" for the same reason it is its own
  // method: an origin of Cash against a Cash App payment makes the one channel
  // that cannot be reconciled look bigger than it is.
  "Cash App": "Cash App Statement",
  "Zelle": "Zelle",
  "Venmo": "Venmo",
  "PayPal": "Paypal Statement",
  "Boatsetter payout": "Boatsetter",
  "GetMyBoat payout": "GetMyBoat",
  "Gift certificate": "Gift certificate",
};

// --- migrating what is already there ----------------------------------------
// Old values, mapped once. Anything unrecognised is left ALONE rather than
// forced into "Other" — a wrong specific value is worse than an honest null.

const CHANNEL_ALIASES = {
  other: "Direct",
  direct: "Direct",
  getmyboat: "GetMyBoat",
  boatsetter: "Boatsetter",
  website: "Website",
};

const LEAD_ALIASES = {
  website: "Website",
  direct: "Text / WhatsApp",
  friends: "Referral from a friend",
  "repeat guest": "Repeat guest",
  "word of mouth": "Referral from a friend",
  instagram: "Instagram",
  facebook: "Facebook",
  getmyboat: "GetMyBoat",
  boatsetter: "Boatsetter",
  "chatgpt.com": "AI search (ChatGPT)",
  other: "Other",
  // 53 rows said this. It means "it came from wherever it was booked", which is
  // not a lead source at all — it is the booking channel repeated. Mapped to
  // null so the field stops claiming to know something it never did.
  platform: null,
};

const key = (v) => String(v == null ? "" : v).trim().toLowerCase();

function normaliseChannel(value) {
  const k = key(value);
  if (!k) return null;
  return Object.prototype.hasOwnProperty.call(CHANNEL_ALIASES, k)
    ? CHANNEL_ALIASES[k]
    : (BOOKING_CHANNELS.find((c) => c.toLowerCase() === k) || value);
}

function normaliseLeadSource(value) {
  const k = key(value);
  if (!k) return null;
  if (Object.prototype.hasOwnProperty.call(LEAD_ALIASES, k)) return LEAD_ALIASES[k];
  return LEAD_SOURCES.find((s) => s.toLowerCase() === k) || value;
}

/** The ledger origin for a booking, from what it says rather than from a guess. */
function ledgerOriginFor(booking) {
  const m = booking && booking.paymentMethod;
  if (m && LEDGER_ORIGIN[m]) return LEDGER_ORIGIN[m];
  // No payment method recorded. Fall back to the booking channel, which is what
  // this did for every row before the field existed — a platform payout really
  // is how that money arrived.
  const channel = normaliseChannel(booking && booking.platform);
  if (channel === "Boatsetter" || channel === "GetMyBoat" || channel === "Website") return channel;
  return null;
}

module.exports = {
  LEAD_SOURCES, BOOKING_CHANNELS, PAYMENT_METHODS, LEDGER_ORIGIN,
  normaliseChannel, normaliseLeadSource, ledgerOriginFor,
};
