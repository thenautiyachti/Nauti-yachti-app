// Sample leads so the pipeline is demonstrable before any source is connected.
// Written to look like what the Reddit adapter returns, plus one of each of the
// consented sources, so the consent gating in the UI is visible immediately.
import { insertLead, insertSignal, listSignals } from './lib/db.js';

const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();

const LEADS = [
  {
    source: 'reddit', source_ref: 'https://reddit.com/r/houston/demo1', author: 'u/spring_homeowner',
    raw_text: "Storm last night took shingles off the back slope and now there's water coming in through the ceiling in the back bedroom. Spring TX. Need someone out ASAP — who do you all use?",
    posted_at: ago(0.2), location_text: 'r/houston',
    consent: 'public_thread_only', consent_note: 'Public Reddit post. Reply in the thread.',
  },
  {
    source: 'reddit', source_ref: 'https://reddit.com/r/houston/demo2', author: 'u/katy_dad',
    raw_text: 'Looking for a trusted roofer near Katy. Insurance adjuster is coming out next week after the hail and I want someone there with me. Roof is 14 years old.',
    posted_at: ago(1), location_text: 'r/houston',
    consent: 'public_thread_only', consent_note: 'Public Reddit post. Reply in the thread.',
  },
  {
    source: 'reddit', source_ref: 'https://reddit.com/r/HomeImprovement/demo3', author: 'u/renter_woes',
    raw_text: "My landlord won't fix the leak over my kitchen. I'm a tenant, what are my rights here?",
    posted_at: ago(2), location_text: 'r/HomeImprovement',
    consent: 'public_thread_only', consent_note: 'Public Reddit post. Reply in the thread.',
  },
  {
    source: 'reddit', source_ref: 'https://reddit.com/r/Roofing/demo4', author: 'u/tx_contractor',
    raw_text: 'Fellow roofers — what are you charging per square in DFW right now? My company is bidding a large subdivision.',
    posted_at: ago(45), location_text: 'r/Roofing',
    consent: 'public_thread_only', consent_note: 'Public Reddit post. Reply in the thread.',
  },
  {
    source: 'meta_lead_ad', source_ref: 'meta:demo:8841', name: 'Marcus Webb',
    phone: '+12815550147', email: 'mwebb@example.com',
    raw_text: 'Storm damage inspection request. "Roof is 12 years old, saw granules in the gutters after the hail last week." The Woodlands, TX.',
    posted_at: ago(0.05), location_text: 'The Woodlands, TX',
    consent: 'opted_in',
    consent_note: 'Meta Lead Ad, one-to-one consent captured 2026-09-15. Brand shown: Synergy Roof Systems.',
  },
  {
    source: 'missed_call', source_ref: 'call:demo:2210', name: 'Unknown caller',
    phone: '+19365550188',
    raw_text: 'Missed call, 41 seconds on voicemail: "...hail came through yesterday and my neighbor said y\'all did his roof. Give me a call back."',
    posted_at: ago(0.01), location_text: 'Spring, TX',
    consent: 'opted_in', consent_note: 'Inbound caller. They initiated contact.',
  },
  {
    source: 'web_form', source_ref: 'form:demo:551', name: 'Dana Ruiz', email: 'dana.r@example.com',
    raw_text: 'Requested a quote for a full replacement. Notes: "Planning for spring, no rush, want to budget for it." Cypress, TX.',
    posted_at: ago(6), location_text: 'Cypress, TX',
    consent: 'opted_in', consent_note: 'Submitted the site quote form with the consent box ticked.',
  },
];

let added = 0;
for (const l of LEADS) if (insertLead(l)) added++;

if (!listSignals().length) {
  insertSignal({
    title: 'Houston metro — someone asking for a roofer',
    platform: 'reddit',
    subreddits: 'houston,HomeImprovement,Roofing',
    keywords: 'trusted roofer, good roofer, roof leak, need a roofer, roofing company, roof replacement',
    geo_terms: 'houston,spring,katy,cypress,tomball,the woodlands,pearland,league city,conroe,humble',
    window: 'week',
  });
  console.log('Created starter signal.');
}
console.log(`Seeded ${added} leads.`);
