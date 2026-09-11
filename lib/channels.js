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
const PAYMENT_METHODS = [
  "Unpaid",
  "Stripe (card)",
  "Cash",
  "Zelle",
  "Venmo",
  "PayPal",
  "Boatsetter payout",
  "GetMyBoat payout",
  "Gift certificate",
];

// What a payment method is called in the ledger's origin column, so the books
// keep the vocabulary they already have while the booking keeps the precise one.
const LEDGER_ORIGIN = {
  "Stripe (card)": "Website",
  "Cash": "Cash",
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
