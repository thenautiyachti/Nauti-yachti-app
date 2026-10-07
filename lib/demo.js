// Demo mode: the same code, run as a separate Vercel project against a separate
// database full of invented data, so a prospect can click through the real site
// and console without seeing anything of this business.
//
// WHY A SEPARATE DEPLOYMENT AND NOT A /template PATH (owner, 7 Oct 2026). Hosting
// the demo under thenautiyachti.com/template meant rewriting about 40 absolute
// links and API calls in the live code, which is exactly the change that could
// break the real site. A second project with its own address needs none of that.
//
// THE SAFETY MODEL. The demo project is configured with:
//   NEXT_PUBLIC_DEMO_MODE=1            turns this file on
//   NEXT_PUBLIC_DEMO_SITE_URL=<url>    the demo's own address
//   DEMO_DATABASE_REF=<ref>            the demo Supabase project's ref
//   DATABASE_URL / DIRECT_URL          the demo database
//   STRIPE_* test keys only, and no Resend, Blotato, ElevenLabs or Jarvis keys
// The live project never sets NEXT_PUBLIC_DEMO_MODE, so everything here is
// inert there. And in demo mode the database client refuses to start unless its
// address POSITIVELY matches the demo ref and does NOT match the live ref --
// a misconfigured demo fails closed instead of opening the real data.
//
// THIS FILE MUST STAY FREE OF SERVER-ONLY IMPORTS. lib/guestTexts.js uses it and
// the console (a browser component) uses guestTexts, so anything required here
// ends up in the browser bundle. The outbox, which needs the database, lives in
// lib/demoOutbox.js.

// The live Supabase project. Not a secret (it is in every connection string's
// hostname); written here so a demo can recognise it and refuse.
const LIVE_DB_REF = "txztgmvdekyzsceafvnt";
const LIVE_SITE = "https://www.thenautiyachti.com";

function isDemo() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "1";
}

// Throws unless both database URLs point at the demo project. Called by
// lib/db.js before any client exists, and again by the reset before deleting.
function assertDemoDatabase() {
  const ref = (process.env.DEMO_DATABASE_REF || "").trim();
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean);
  if (!ref) throw new Error("[demo] DEMO_DATABASE_REF is not set; refusing to connect.");
  if (ref === LIVE_DB_REF) throw new Error("[demo] DEMO_DATABASE_REF is the LIVE database; refusing.");
  if (!urls.length) throw new Error("[demo] no database URL; refusing.");
  for (const u of urls) {
    if (u.includes(LIVE_DB_REF)) throw new Error("[demo] a database URL points at the LIVE database; refusing.");
    if (!u.includes(ref)) throw new Error("[demo] a database URL does not point at the demo database; refusing.");
  }
}

// Base URL for links the code builds (payment links, trip links, Stripe return
// pages, texts drafted in the console). The demo's own address, so a test
// checkout returns to the demo rather than to the real site.
function siteBase() {
  if (isDemo()) return (process.env.NEXT_PUBLIC_DEMO_SITE_URL || "").replace(/\/+$/, "") || LIVE_SITE;
  return LIVE_SITE;
}

module.exports = { LIVE_DB_REF, LIVE_SITE, isDemo, assertDemoDatabase, siteBase };
