// What the trip page tells a guest about their charter. No database here: it
// takes the booking lookup/tripBooking.js assembled and decides what to say, so
// it can be tested without one (scripts/test-trip-info.js).
//
// ONE SOURCE FOR WHERE THE BOAT IS. The meeting point, the dock note and the
// glow night's times are read from the same places the confirmation email reads
// them (lib/email.js, lib/glowEvent.js). Two copies of "where to meet" is how a
// guest on 18 Sep 2026 was emailed a gated house across the lake from the ramp
// his boat left from; this page must not become the third copy.
//
// THE GATE CODE IS NOT HERE AND CANNOT BE. Nothing in this file reads
// DOCK_GATE_CODE. A link that is forwarded to a group chat is no place for the
// code to a private residence; it still goes by text, on the day.
const {
  GLOW_PACKAGE_ID, GLOW_MEETING_POINT, GLOW_START_TIME, GLOW_CHECK_IN_TIME,
  GLOW_RETURN_TIME, GLOW_END_NOTE, GLOW_INCLUDED, GLOW_BRING,
} = require("./glowEvent");
const { dockAddressFor, vesselKey, formatClock, DOCK_FACTS } = require("./email");
const { FAQ_ITEMS } = require("./faqContent");
const { lakeTodayKey } = require("./eventSeats");
const { GOOGLE_REVIEW_URL, FACEBOOK_REVIEW_URL } = require("./reviews");

// The FAQ answers worth having to hand once a trip is booked. Picked by
// question, so a reworded answer flows through and a deleted question simply
// drops off this page. "Where do we meet" is left out on purpose: this page
// shows the real meeting point for THIS boat, which the FAQ cannot.
const GOOD_TO_KNOW = [
  "What happens if the weather is bad on the day of my charter?",
  "Can I reschedule my booking?",
  "What is your cancellation policy?",
  "Can we bring our own food and alcohol?",
  "What happens if the boat breaks down during our charter?",
];
const BRING_QUESTION = "What should I bring on a Lake Conroe boat charter?";

function faq(q) {
  const item = FAQ_ITEMS.find((i) => i.q === q);
  return item ? { q: item.q, a: item.a } : null;
}

function isGlowTrip(t) {
  return t.packageId === GLOW_PACKAGE_ID || /glow/i.test(String(t.packageName || ""));
}

// The platform took the money, so the platform's numbers are the true ones.
// ExternalBooking.pricePaid on a Boatsetter row is what reached the owner, not
// what the guest was charged, and showing a guest a smaller figure than their
// own receipt reads as a mistake at best.
function platformThatTookPayment(platform) {
  const p = String(platform || "");
  if (/boatsetter/i.test(p)) return "Boatsetter";
  if (/getmyboat/i.test(p)) return "GetMyBoat";
  return null;
}

function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm == null ? "" : hhmm).trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) return null;
  return h * 60 + min;
}

function clockOf(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return formatClock(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));
}

function longDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function money(n) {
  return n == null || Number.isNaN(Number(n)) ? null : "$" + Number(n).toFixed(2);
}

// Before, on, or after the day -- and the two states where there is no trip to
// talk about yet, or any more.
function phaseOf(t, today) {
  if (t.status === "cancelled" || t.status === "refunded") return "cancelled";
  if (t.status === "inquiry" || t.status === "lapsed") return "unconfirmed";
  if (t.status === "completed") return "past";
  if (!t.date) return "upcoming";
  if (t.date > today) return "upcoming";
  if (t.date === today) return "today";
  return "past";
}

function directionsFor(t, env) {
  const contactPhone = env.CONTACT_PHONE || "(832) 948-2912";
  if (isGlowTrip(t)) {
    return {
      glow: true,
      meetingPoint: GLOW_MEETING_POINT,
      address: null,
      startTime: GLOW_START_TIME,
      arriveBy: GLOW_CHECK_IN_TIME,
      backAt: GLOW_RETURN_TIME + " (" + GLOW_END_NOTE + ")",
      note: "Scott's Ridge is a public ramp, so park in the lot and walk down to the boats. "
        + "We are your ride to Party Cove and back. There is no gate and no code for this one, "
        + "and it is not our usual dock, so do not set off for Pearl Bay.",
      gateByText: false,
      contactPhone,
    };
  }

  const start = minutesOf(t.startTime);
  const early = Number(env.ARRIVE_MINUTES_EARLY || 15);
  const address = dockAddressFor({ vesselId: t.vesselId, vesselName: t.vesselName });
  const facts = DOCK_FACTS[vesselKey({ vesselId: t.vesselId, vesselName: t.vesselName })] || {};
  return {
    glow: false,
    meetingPoint: null,
    // No address set for this boat: say so, never fall back to another dock.
    // See dockAddressFor in lib/email.js for why there is no fallback.
    address: address || null,
    startTime: start == null ? null : clockOf(start),
    arriveBy: start == null ? null : clockOf(start - early),
    backAt: start != null && Number(t.hours) > 0 ? clockOf(start + Number(t.hours) * 60) : null,
    note: facts.note || null,
    gateByText: Boolean(facts.gated),
    contactPhone,
  };
}

// What they paid, what is left, and nothing invented. Website and direct
// bookings carry their own numbers; platform bookings point at the platform.
// A SHARED CHARTER on a partner's boat (10 Oct 2026, Robert Snow on YOLO Lake
// Conroe's): the guest paid the partner, and what the booking records is OUR
// share of that. Showing it as "Paid $480" would tell the guest a number that is
// not what they paid. The page names who took their payment instead.
const PARTNERS = { "partner-yolo-lake-conroe": "YOLO Lake Conroe" };

function moneyFor(t) {
  const partner = PARTNERS[String(t.vesselId || "")];
  if (partner) return { platform: null, partner, lines: [], balance: null, payPath: null };
  const platform = platformThatTookPayment(t.platform);
  if (platform) return { platform, lines: [], balance: null, payPath: null };

  const quoted = t.priceQuoted != null ? Number(t.priceQuoted) : null;
  const discount = Number(t.discountAmount || 0);
  const gift = Number(t.giftAmount || 0);
  const due = quoted != null ? Math.max(0, quoted - discount - gift) : null;
  const lines = [];
  if (quoted != null) lines.push({ label: "Charter", value: money(quoted) });
  if (discount) lines.push({ label: "Discount" + (t.couponCode ? " (" + t.couponCode + ")" : ""), value: "-" + money(discount) });
  if (gift) lines.push({ label: "Gift certificate", value: "-" + money(gift) });

  if (t.paymentStatus === "refunded") {
    lines.push({ label: "Refunded", value: t.refundAmount != null ? money(t.refundAmount) : "yes" });
    return { platform: null, lines, balance: null, payPath: null };
  }
  if (t.paymentStatus === "paid") {
    // pricePaid is what was actually received when the owner logged it; the
    // computed figure is what checkout charged. Prefer the logged one.
    const paid = t.pricePaid != null ? Number(t.pricePaid) : due;
    if (paid != null) lines.push({ label: "Paid", value: money(paid), strong: true });
    return { platform: null, lines, balance: null, payPath: null };
  }
  // Unpaid. The link is the /pay/<id> page, never a raw Stripe URL.
  const balance = due != null && due > 0 ? due : null;
  return {
    platform: null,
    lines,
    balance: balance != null ? money(balance) : null,
    payPath: balance != null && t.payId ? "/pay/" + t.payId : null,
  };
}

/**
 * Everything the trip page renders, from one merged booking.
 * `opts.now` and `opts.env` exist for the tests.
 */
function tripView(trip, opts = {}) {
  const t = trip || {};
  const env = opts.env || process.env;
  const today = lakeTodayKey(opts.now || new Date());
  const phase = phaseOf(t, today);
  const glow = isGlowTrip(t);
  const bringFaq = faq(BRING_QUESTION);

  return {
    ref: t.ref,
    phase,
    firstName: String(t.name || "").trim().split(/\s+/)[0] || null,
    when: longDate(t.date),
    date: t.date || null,
    packageName: t.packageName || null,
    vesselName: t.vesselName || null,
    hours: Number(t.hours) > 0 ? Number(t.hours) : null,
    partySize: t.partySize != null && String(t.partySize).trim() !== "" ? String(t.partySize) : null,
    seatsLabel: glow ? "Seats" : "Guests",
    directions: directionsFor(t, env),
    bring: glow ? { list: GLOW_BRING } : { text: bringFaq ? bringFaq.a : null },
    included: glow ? GLOW_INCLUDED : (Array.isArray(t.packageBullets) && t.packageBullets.length ? t.packageBullets : null),
    goodToKnow: GOOD_TO_KNOW.map(faq).filter(Boolean),
    money: moneyFor(t),
    // The photo box is there for any confirmed booking, before the day as well
    // as after. It first opened only on the trip day, and the owner, looking at
    // an upcoming trip, could not find it at all: "That's where their photo
    // upload should be, where they can specifically upload their own content."
    // (2 Oct 2026.) Not for a cancelled booking, nor one not yet confirmed.
    canUpload: phase === "upcoming" || phase === "today" || phase === "past",
    // No review ask before they have been out. Same no-incentive, no-gating
    // rule as /thanks: the button goes to Google, whatever they thought.
    review: phase === "past" ? { google: GOOGLE_REVIEW_URL, facebook: FACEBOOK_REVIEW_URL } : null,
    canMessage: true,
  };
}

module.exports = { tripView, phaseOf, moneyFor, directionsFor, isGlowTrip, platformThatTookPayment, clockOf, minutesOf };
