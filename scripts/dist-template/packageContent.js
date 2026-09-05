// Editorial copy for the per-package landing pages.
//
// ONE WORKED EXAMPLE, then blanks. Copy it, change every word, add one block
// per package you sell.
//
// THE PROVENANCE RULE, and it is the reason the original of this file was worth
// copying at all: every factual claim here must already be true somewhere else
// in the system -- the package's own `unit` and `blurb` from prisma/seed.js, a
// vessel row, the live price table, or your terms page. This file RE-WORDS and
// STRUCTURES those facts so they read well and rank. It never invents an
// inclusion, a location, a policy or a guarantee.
//
// That sounds like bureaucracy until the first time a guest arrives quoting a
// sentence from a landing page that nobody ever agreed to. Marketing copy that
// drifts from the booking terms is not a writing problem, it is a refund.
//
// Keyed by the package `id` in prisma/seed.js, so renaming a package in the
// console does not orphan its copy.

const PACKAGE_CONTENT = {
  // ---------------------------------------------------------------- EXAMPLE
  // Delete this whole block once you have written your own.
  watersports: {
    // The visible headline. Lead with what it IS, then where. People search
    // for the activity and the water, in that order.
    h1: "Tubing & Wakeboarding Charters on <YOUR LAKE>",

    // The browser tab and the search result title. Roughly 60 characters
    // before it gets cut off. Worth including your town.
    metaTitle: "Tubing & Wakeboarding Boat Charter on <YOUR LAKE>, <ST>",

    // The grey text under the search result. Around 155 characters. Include a
    // real starting price if you have one -- it filters out the people who were
    // never going to book, which is a kindness to both of you.
    metaDescription:
      "Book a tubing and wakeboarding charter on <YOUR LAKE> from $<PRICE>. " +
      "Equipment, fuel and ice included, with a captain who knows the water. " +
      "Up to <N> guests.",

    // A note to yourself about who this page is for. Never rendered.
    intent: "For people searching for tubing, wakeboarding and watersports boat rental on <YOUR LAKE>.",

    // Two or three paragraphs. The first answers "what am I actually buying".
    // The second answers "what will the day be like" -- and this is the one
    // that converts, because everyone else's site only has the first.
    //
    // NAME YOUR PLACES. The coves, the sandbar, the bridge, the restaurant you
    // pull in at. Those names are what people search for and what makes the
    // page read like it was written by somebody who goes there.
    intro: [
      "One paragraph on what is included and why the price is the whole price.",
      "One paragraph on what the day feels like, naming the places you actually go.",
    ],

    // Three or four. Each answers an objection you have heard out loud.
    highlights: [
      {
        title: "Answer the objection in the title",
        body: "Two sentences. Concrete, checkable, and drawn from something already true in seed.js or your terms.",
      },
    ],

    // Page-level FAQs, distinct from the site-wide ones in faqContent.js. Put
    // the questions here that are specific to THIS package.
    faqs: [
      { q: "A question you are genuinely asked about this package", a: "The real answer, in your own words." },
    ],
  },

  // Add one block per package id in prisma/seed.js.
};

// A package with no entry here still gets a working page built from its seed
// data -- it is just thinner. Missing copy degrades; it does not break, which
// is why returning null is correct rather than throwing.
function contentFor(id) {
  return PACKAGE_CONTENT[id] || null;
}

// BOTH exports are required. app/packages/page.js and app/packages/[slug]/page.js
// import contentFor; dropping it from a template is how a stripped package ships
// a site that will not build.
module.exports = { PACKAGE_CONTENT, contentFor };
