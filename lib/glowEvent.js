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

// Boarding/departure time. Moved two hours earlier on the owner's call,
// 17 Sep 2026: "we may want to untie sooner. We are now thinking 430 rope
// off by 5". It was 6:30 / 7:00.
//
// WORTH KNOWING WHAT THIS COSTS, because nothing else records it: sunset at
// Lake Conroe on 19 Sep 2026 is 7:22pm, so the first two hours and twenty
// minutes of a 5pm departure are in daylight, on a night sold as Party Cove
// after dark. That was put to him and it is the trade he chose.
const GLOW_START_TIME = "5:00 PM";
const GLOW_CHECK_IN_TIME = "4:30 PM";
// Confirmed by the owner 2026-09-01. Back at the ramp around midnight — say
// "around", because a cove night doesn't end on a stopwatch.
//
// THIS WAS RIGHT AND UNREAD FOR SIXTEEN DAYS. It sat here, correct, while every
// page, caption and automation said "four hours" and "back the same night" —
// because those came from the Package row's fixedHours (4), and 7pm plus four
// hours is eleven. Three answers to one question, and the one a person had
// actually confirmed was the one nothing rendered. Anything that states the end
// of the night now reads from here.
const GLOW_RETURN_TIME = "around midnight";

// How the night actually ends, owner's wording 17 Sep 2026: "until midnight or
// until the majority votes that they're ready to go".
//
// Both halves earn their place. "Around midnight" is the answer to the question
// people need settled before they book a sitter or agree a lift home. The
// second half sets the expectation that it can run on, WITHOUT promising it —
// a stated finish that gets exceeded is a happy boat; a promised one that gets
// missed is a complaint.
const GLOW_END_NOTE = "or whenever the boat decides it's had enough";

// The one sentence, so the site, the captions, the DM automations and any agent
// that mentions the timing all say it the same way. The glow copy has already
// drifted into three versions once.
const GLOW_TIMING_LINE =
  "Lines off at 5, back " + GLOW_RETURN_TIME + " — " + GLOW_END_NOTE + ".";

// Owner-confirmed policies for this event, 2026-09-01.
const GLOW_MIN_AGE = 21;
const GLOW_BYOB = true;

// Which vessels are sold out is NOT recorded here any more. It used to be, as
// two hardcoded arrays saying the Nauti Explorer was full — nothing ever
// rendered them, and by 11 Sep 2026 they were simply wrong: the Explorer seats
// 14 and had 9 people on it. A seat count that cannot go stale has to be
// counted from the bookings on the date, not typed into a constant.
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
  GLOW_END_NOTE,
  GLOW_TIMING_LINE,
  GLOW_MIN_AGE,
  GLOW_BYOB,
  GLOW_MEETING_POINT,
  GLOW_INCLUDED,
  GLOW_BRING,
  formatGlowDate,
  formatGlowDateShort,
  daysUntilGlow,
};
