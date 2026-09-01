// Everything about asking a past guest for a Google review lives here, so the
// link and the wording are edited in exactly one place.
//
// WHY THIS EXISTS: 53 charters have been run and the Google Business Profile
// has a single review. No guest email address is stored on any booking row
// (Boatsetter and GetMyBoat both relay messages instead of exposing an
// address), so an automated email chase is impossible today. What IS possible
// is making the manual ask a 10-second job: the owner console drafts the
// message, the owner pastes it into the platform's own message thread.

// The Nauti Yachti's Google Business Profile — "Boat rental service",
// Montgomery TX, (832) 948-2912. Place ID confirmed against Google Maps on
// 2026-09-01; the matching CID is 0x77bcafb14c9907de / 8627964162164197342.
const GOOGLE_PLACE_ID = "ChIJ615Sj10p5UwR3geZTLGvvHc";

// /local/writereview drops the guest straight into the star-rating box.
// Sending them to the map listing instead makes them hunt for "Write a
// review", and that extra step is where most people give up.
const GOOGLE_REVIEW_URL = `https://search.google.com/local/writereview?placeid=${GOOGLE_PLACE_ID}`;
const GOOGLE_LISTING_URL = `https://www.google.com/maps/place/?q=place_id:${GOOGLE_PLACE_ID}`;

const SIGNATURE = "— Austin & Brooke, The Nauti Yachti";

// Where the owner actually has to go to reach this guest. Nothing here sends
// anything; it's a reminder of which inbox to paste the draft into.
const PLATFORM_CHANNEL = {
  Boatsetter: "Boatsetter message thread",
  GetmyBoat: "GetMyBoat inbox",
  Facebook: "Facebook DM",
  Instagram: "Instagram DM",
  Site: "Email",
  Other: "Wherever you booked them",
};

function channelFor(platform) {
  return PLATFORM_CHANNEL[platform] || PLATFORM_CHANNEL.Other;
}

function firstName(name) {
  if (!name) return "";
  return String(name).trim().split(/\s+/)[0];
}

function greeting(name) {
  const f = firstName(name);
  return f ? `Hi ${f}` : "Hi there";
}

// "the Nauti Explorer" — falls back to a generic phrase when the row has no
// vessel recorded, so the draft never reads "on the undefined".
function vesselPhrase(vesselName) {
  return vesselName ? `the ${vesselName}` : "the boat";
}

function parseDay(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// e.g. "Sat, Aug 29"
function fmtShortDate(dateStr) {
  const d = parseDay(dateStr);
  if (!d) return "your charter";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// e.g. "back in July" / "back in July 2025" once it's a different year
function fmtLooseDate(dateStr, today) {
  const d = parseDay(dateStr);
  if (!d) return "your trip with us";
  const now = today || new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return `back in ${d.toLocaleDateString("en-US", sameYear ? { month: "long" } : { month: "long", year: "numeric" })}`;
}

// Whole days between the charter date and today, both taken as LOCAL calendar
// days — never via toISOString(), which would shift the date in US timezones.
function daysSince(dateStr, today) {
  const d = parseDay(dateStr);
  if (!d) return null;
  const now = today || new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((midnight - d) / 86400000);
}

// How warm the ask is. The first few days after a charter convert far better
// than a cold ask months later, so the console sorts and colours by this
// rather than presenting 53 rows as equally worth chasing.
const ASK_WINDOWS = {
  upcoming: { label: "Not yet sailed", color: "var(--muted)" },
  now: { label: "Ask now", color: "#7FE0B8" },
  good: { label: "Good window", color: "#4FA8E8" },
  late: { label: "Late but fine", color: "#E8934A" },
  cold: { label: "Cold", color: "var(--muted)" },
};

function askWindow(days) {
  if (days == null) return "cold";
  if (days < 0) return "upcoming";
  if (days <= 3) return "now";
  if (days <= 14) return "good";
  if (days <= 90) return "late";
  return "cold";
}

// Three drafts, because the right words genuinely differ by situation:
//  - fresh:   the charter is still a recent memory
//  - catchup: months later, so it leads with honesty rather than nostalgia
//  - nolink:  Boatsetter/GetMyBoat message threads sometimes strip or flag
//             outbound URLs. This variant carries no link at all and tells the
//             guest what to search for instead.
//
// None of these offer a discount, a gift, or anything else in exchange for a
// review, and none ask for "a 5-star review" — Google's policies prohibit
// incentivised and gated reviews, and a filtered review helps nobody.
const TEMPLATES = [
  { id: "sms", label: "Text message (recommended)" },
  { id: "fresh", label: "Fresh (0–14 days)" },
  { id: "catchup", label: "Catch-up (older)" },
  { id: "nolink", label: "No link (platform-safe)" },
];

// Guests hand over a phone number far more readily than an email address, so
// SMS is the realistic channel here — and it converts better regardless: the
// review link opens on the phone already in their hand, with no "log into
// email on a laptop" step in between.
//
// Written short on purpose. The email drafts below run to five paragraphs,
// which reads as a newsletter in a text thread and gets ignored. One or two
// sentences, one link, no signature block — a text is expected to be brief,
// and brevity is what gets it read.
const SMS_MAX_SEGMENTS = 3; // ~480 chars; beyond this carriers split it awkwardly

// SMS is the default because it matches how guests actually hand over their
// details: a phone number at the dock, not an email address. The email
// templates remain for the rare row that carries a real address.
const DEFAULT_TEMPLATE_FOR_DAYS = () => "sms";

// Strip a phone number down to digits and render the tel/sms target.
// Returns null for anything that isn't plausibly dialable, so the UI can hide
// the button rather than offer a link that silently does nothing.
//
// Not every guest is American — Lake Conroe draws visitors, and a number
// written with its country code has to survive. A leading "+" is taken at its
// word and kept as E.164; a bare 10 or 11 digits is assumed to be US, which is
// what almost everything typed here will be.
function normalizePhone(raw) {
  const s = String(raw || "").trim();
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) {
    // E.164 allows up to 15 digits; below 8 it is not a real subscriber line.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// `sms:` deep link. iOS and Android disagree about the separator before the
// body parameter; "?&body=" is the form both accept, and it is what every
// cross-platform implementation settles on.
function smsHref(phone, body) {
  const to = normalizePhone(phone);
  if (!to) return null;
  return `sms:${to}?&body=${encodeURIComponent(body)}`;
}

function reviewMessage(templateId, booking, today) {
  const b = booking || {};
  const hi = greeting(b.name);
  const boat = vesselPhrase(b.vesselName);

  if (templateId === "sms") {
    const days = daysSince(b.date, today);
    // Fresh trips can reference "the other day"; older ones would sound odd
    // pretending the trip just happened, so they say so plainly instead.
    const opener =
      days != null && days <= 14
        ? `${hi}! Austin from The Nauti Yachti — thanks again for coming out on ${boat}${b.date ? ` on ${fmtShortDate(b.date)}` : ""}.`
        : `${hi}! Austin from The Nauti Yachti — hope you've been well since your trip on ${boat}.`;
    return [
      opener,
      "",
      "If you had a good time, would you mind leaving us an honest Google review? We're a small family-run outfit on Lake Conroe and it's how new guests find us — takes about 30 seconds:",
      "",
      GOOGLE_REVIEW_URL,
      "",
      "Thanks either way!",
    ].join("\n");
  }

  if (templateId === "catchup") {
    return [
      `${hi} — Austin here from The Nauti Yachti. Hope you've been doing well since your day out on ${boat} ${fmtLooseDate(b.date, today)}.`,
      "",
      "We're a small family-run operation on Lake Conroe and we're trying to build up our Google reviews so more folks can find us. If your trip was a good one, would you mind leaving us an honest review? It takes about 30 seconds:",
      "",
      GOOGLE_REVIEW_URL,
      "",
      "No worries at all if you'd rather not — thanks again for booking with us either way.",
      "",
      SIGNATURE,
    ].join("\n");
  }

  if (templateId === "nolink") {
    return [
      `${hi} — Austin here from The Nauti Yachti. Thanks again for coming out on ${boat} on ${fmtShortDate(b.date)}!`,
      "",
      "If you enjoyed the day, an honest Google review would mean a lot to us — we're a small local outfit and reviews are how new guests find us. Just search \"The Nauti Yachti\" on Google or Google Maps and tap the stars.",
      "",
      "Thanks again, and we'd love to have you back on the water.",
      "",
      SIGNATURE,
    ].join("\n");
  }

  // "fresh" — the default
  return [
    `${hi} — Austin here from The Nauti Yachti. Thanks again for coming out on ${boat} on ${fmtShortDate(b.date)}! It was a pleasure having you aboard.`,
    "",
    "If you had a good time, would you mind leaving us an honest Google review? We're a small family-run operation on Lake Conroe, and reviews are genuinely how new guests find us. It takes about 30 seconds:",
    "",
    GOOGLE_REVIEW_URL,
    "",
    "Thanks either way — and we'd love to have you back out on the water.",
    "",
    SIGNATURE,
  ].join("\n");
}

// Subject line for the one channel where a subject exists (site bookings,
// which are the only rows that ever carry a real email address).
function reviewSubject() {
  return "Thanks for sailing with The Nauti Yachti";
}

// Said out loud at the dock while the guests are still smiling. This converts
// better than any message thread, costs nothing, and needs no email address —
// it's shown as a fixed script in the console rather than per-booking.
const DOCK_SCRIPT = [
  "\"Hey, so glad y'all had a good time — quick favor if you don't mind:",
  "we're a small local operation and Google reviews are how people find us.",
  "If you get a sec tonight, search 'The Nauti Yachti' on Google and leave an",
  "honest review. Means the world to us. Thanks again!\"",
].join(" ");

module.exports = {
  GOOGLE_PLACE_ID,
  GOOGLE_REVIEW_URL,
  GOOGLE_LISTING_URL,
  PLATFORM_CHANNEL,
  TEMPLATES,
  ASK_WINDOWS,
  DOCK_SCRIPT,
  channelFor,
  firstName,
  daysSince,
  askWindow,
  reviewMessage,
  reviewSubject,
  DEFAULT_TEMPLATE_FOR_DAYS,
  normalizePhone,
  smsHref,
  SMS_MAX_SEGMENTS,
};
