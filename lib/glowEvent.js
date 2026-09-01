// Single source of truth for the Boatz & Glowz event's *practical* details —
// the things a guest needs to know that aren't already columns on the Package
// row (start time, meeting point, what to bring, policies).
//
// The date, price, duration and vessel list all still come from the live
// Package row (id "glowz") so the owner console stays the place to change
// them. Only edit this file for the logistics copy.
//
// NOTE: the date here is deliberately NOT hardcoded — read it from the
// package (`pkg.eventDate`). GLOW_EVENT_DATE is only a fallback for pages
// that render before the package is loaded.

const GLOW_PACKAGE_ID = "glowz";

// Fallback only — prefer the Package row's eventDate.
const GLOW_EVENT_DATE = "2026-09-19";

// Boarding/departure time. Sourced from the /events calendar entry
// ("Boatz & Glowz — Party Cove Glow Party, 7 PM").
const GLOW_START_TIME = "7:00 PM";
const GLOW_CHECK_IN_TIME = "6:30 PM";
// Confirmed by the owner 2026-09-01. Back at the ramp around midnight — say
// "around", because a cove night doesn't end on a stopwatch.
const GLOW_RETURN_TIME = "around midnight";

// Owner-confirmed policies for this event, 2026-09-01.
const GLOW_MIN_AGE = 21;
const GLOW_BYOB = true;

// The Nauti Explorer is sold out (8 seats, booking NY-20260919-01). Seats
// remain on the Nauti Yachti and the Nauti Islander. This is real scarcity,
// not a marketing device — say it plainly and keep it accurate.
const GLOW_SOLD_OUT_VESSELS = ["Nauti Explorer"];
const GLOW_AVAILABLE_VESSELS = ["Nauti Yachti", "Nauti Islander"];

// From the package blurb: "Let us be your taxi to & from Scott's Ridge."
const GLOW_MEETING_POINT = "Scott's Ridge boat ramp, Lake Conroe";

// From the package blurb + unit line — everything the ticket price covers.
const GLOW_INCLUDED = [
  "Round-trip ride from Scott's Ridge — we're your taxi to Party Cove and back",
  "Glow gear for the night (sticks, bands, the works)",
  "Sober, licensed captains on every boat",
  "Ice chest loaded with ice and water",
  "Secure storage for your bag and phone while you're aboard",
  "Fuel and all on-water festivities",
];

// Practical prep. Written from what the package already covers so nothing
// here contradicts the included list above.
const GLOW_BRING = [
  "Anything you want to drink — we bring the ice and the cooler, you bring the rest",
  "A towel and a change of clothes (there is usually foam involved)",
  "White or neon clothing — it lights up the best out there",
  "A waterproof phone pouch if you've got one",
  "Cash or card if you want to add anything on the night",
];

/** Turn "2026-09-19" into "Saturday, September 19, 2026". */
function formatGlowDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Short form: "Sat, Sep 19". */
function formatGlowDateShort(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Whole days from `now` until the event's local calendar day.
 * Positive = upcoming, 0 = it's today, negative = it's past.
 * Both sides are normalised to local midnight so the answer doesn't flip
 * depending on the time of day it's called.
 */
function daysUntilGlow(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const event = new Date(dateStr + "T00:00:00");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((event - today) / 86400000);
}

module.exports = {
  GLOW_PACKAGE_ID,
  GLOW_EVENT_DATE,
  GLOW_START_TIME,
  GLOW_CHECK_IN_TIME,
  GLOW_RETURN_TIME,
  GLOW_MIN_AGE,
  GLOW_BYOB,
  GLOW_SOLD_OUT_VESSELS,
  GLOW_AVAILABLE_VESSELS,
  GLOW_MEETING_POINT,
  GLOW_INCLUDED,
  GLOW_BRING,
  formatGlowDate,
  formatGlowDateShort,
  daysUntilGlow,
};
