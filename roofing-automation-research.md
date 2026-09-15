# Roofing sales automation — research and build plan

**Date:** 2026-09-15
**Question asked:** can we build software that door-knocks for a roofing crew, and
handles the roof evaluations, adjuster meetings, and everything else that makes
getting to a signed contract a grind?

**Short answer:** yes, but not the thing that first comes to mind. "Automated door
knocking" as a product already exists, costs $19–29 per rep per month, and is not
where their money is leaking. The leak is downstream — between the knock and the
signature, and specifically around the **insurance adjuster meeting**. That part is
almost entirely unautomated, it is where 20–40% of job revenue disappears, and it is
the piece we could own.

This document is the research behind that claim and a concrete build plan.

---

## 1. The funnel we are actually automating

A storm-work roofing job runs through ten steps. Worth writing out, because the
software opportunity is invisible until you see where the steps break.

| # | Step | Who does it now | Breaks because |
|---|------|-----------------|----------------|
| 1 | Storm hits | — | — |
| 2 | Figure out which streets took damage | Owner, squinting at a hail map | Guesswork at the block level |
| 3 | Knock doors | Reps, all day | 2–3% of knocks become a sale |
| 4 | Free inspection, photograph damage | Rep on a ladder | Photos land in a phone camera roll |
| 5 | Get contingency agreement signed | Rep at the kitchen table | Signed later by email = ⅓ the close rate |
| 6 | Homeowner files the claim | Homeowner | Homeowner stalls, forgets, or gets talked out of it |
| 7 | **Carrier schedules the adjuster meeting** | **Nobody — it just lands** | **Covered below. This is the wound.** |
| 8 | Adjuster writes the scope | Adjuster, in ~30 min | Line items get missed |
| 9 | Supplement the missed items | Owner, at night, from memory | No photo per line item = no payment |
| 10 | Build, invoice, chase depreciation | Production | — |

Steps 2–5 have a crowded software market. Steps 6–9 have almost nothing built for
the field, and that is where the margin lives.

### The numbers that matter

- **2–3%** of doors knocked convert to a sale for a competent rep; **4–6%** for elite
  reps. ([d2du](https://d2du.com/post/door-to-door-sales-statistics))
- Door-knocked / cold leads close at **15–25%**; inbound leads at **30–50%**. Industry
  blended average is **~27%**.
  ([SubcontractorHub](https://www.subcontractorhub.com/blog/roofing-sales-close-rate),
  [VA Horizon](https://www.vahorizon.site/roofing/guides/close-rate-improvement/))
- A proposal **signed at the appointment closes at 2–3× the rate** of one emailed
  afterward. ([VA Horizon](https://www.vahorizon.site/roofing/guides/close-rate-improvement/))
- **~85%** of people who can't reach a business on the first call don't leave a
  voicemail — they dial the next roofer.
  ([Bullseye](https://www.bullseyemarketingconsultants.com/marketing/ai-voice-agents-for-contractors-2026-lead-capture-guide/))
- Supplements are worth **20–40% of job revenue** that goes uncollected when the
  carrier's first estimate goes uncontested.
  ([IA Solutions](https://www.iasolutions.claims/blog/roofing-insurance-supplements-2026-guide-independent-adjusters))
- An ESX roof sketch saves an estimator **45–90 minutes per project**.
  ([1ESX](https://www.1esx.com/streamlining-claims-a-guide-to-roof-measurement-reports-with-xactimate-esx-in-2026/))

Read those together and the strategy writes itself. Improving the knock rate from 2%
to 3% is a 50% lift on a small number. Recovering the supplement money is a 20–40%
lift on every job they already won. Same engineering effort. Go downstream.

---

## 2. What already exists (so we don't rebuild it)

### Canvassing and territory

| Product | Price | What it does |
|---------|-------|--------------|
| SalesRabbit | from $19/user/mo annual, $29 monthly; free "Lite" tier | Territory maps, pin status, rep tracking. Acquired Roofle Jan 2026 for instant estimates |
| SPOTIO | quote only | Same category, stronger enterprise reporting |
| Knockbase | quote only | Canvassing with a HailTrace integration |

### Storm data

| Product | What it gives |
|---------|---------------|
| HailTrace | Street-level hail swaths, in-house meteorologists, forensic-grade reports |
| Interactive Hail Maps / Hail Recon | Swaths within minutes, 15+ years of history |
| NOAA SPC storm reports | **Free.** Raw hail/wind reports, CSV, daily |

### Roof measurement

| Product | Price |
|---------|-------|
| EagleView | $13–87/report; "Bid Perfect" flat $18 residential / $49 commercial |
| Hover | Photogrammetry from phone photos → 3D model; quote only |
| Roofr | Transparent per-report pricing; Verisk-certified ESX export as of Apr 2026 |
| Google Solar API `buildingInsights` | **10,000 free calls/mo**, then usage-based. Roof area, pitch, azimuth, segment geometry |

### CRM and claims

AccuLynx (deepest native supplement workflow + ESX export), JobNimbus, Roofr,
ClaimStack (supplement-specific), CompanyCam (photo documentation).

### The consistent complaint about all of it

Two things come up over and over in the reviews, and both are seams, not features:

> "Rep buy-in is the #1 reason canvassing apps fail in roofing — not software quality.
> … for them, it's a checkbox."

> "A door marked 'inspection booked' in one app is not a scheduled job in the other."

([SubcontractorHub](https://www.subcontractorhub.com/blog/best-roofing-canvassing-software),
[GhostRep](https://www.ghostrep.ai/blog/best-canvassing-apps-roofing-contractors))

A canvassing app is a logistics tool for the *manager*. It tracks where the rep was.
It does nothing for the rep and nothing for the claim. That is the opening.

---

## 3. The constraint that shapes the whole product

**In most states it is illegal for a roofing contractor to negotiate or settle an
insurance claim.** That is licensed public-adjuster work, and doing it while also
holding the repair contract is unauthorized public adjusting.

- Texas: the Texas Supreme Court upheld the prohibition on the dual
  contractor/adjuster role.
  ([WSHB](https://www.wshblaw.com/experience-texas-supreme-court-to-roofer-stick-to-shingles-not-settlements))
- Arizona: individual licensure required to adjust or negotiate for an insured; DIFI
  has pursued unlicensed staff.
  ([The Arizona Roofer](https://thearizonaroofer.com/the-roofer-said-they-have-an-adjuster-on-staff-is-that-legal/))
- Iowa: unlicensed adjusting is a class D felony, **and the storm-repair contract
  itself is void** if the contractor negotiated the claim.
  ([JustClaims](https://justclaims.ai/blog/uppa-contractor-public-adjusting-compliance/))
- Even a validly licensed public adjuster may not adjust a claim on a property they
  are also contracting on.
  ([RIA](https://www.restorationindustry.org/restoration-blog/dont-become-accidental-adjuster-staying-within-lines-restoration-contractor))

This is not a footnote. It is the product spec.

We must **never** build a feature that negotiates, argues, demands, or settles. What
we build is a **documentation and evidence system**: it establishes what the damage
is, photographs it, measures it, ties every item to a code requirement or a
manufacturer spec, and hands the homeowner and the adjuster a complete factual
record. The contractor states scope and cost. The homeowner and carrier settle.

Framed that way this is a *feature*, not a limitation. A tool whose output is
"here is the documented condition of this roof" keeps the crew on the right side of a
line that a lot of their competitors are casually stepping over — and in Iowa, at
least, stepping over it voids the contract they just fought for.

**Action item before writing code: confirm the unauthorized-public-adjusting rules in
every state the crew works.** The rules differ enough that this has to be a
per-state configuration table in the product, not an assumption.

---

## 4. What to build

Five modules, ranked by pain × buildability. My recommendation is to build A first
and resist the urge to start with B, which is the fun one.

### A. Adjuster Meeting Command Center — *the wedge*

This is step 7, and nobody owns it.

Today: the carrier emails or calls with "the adjuster will be out Tuesday between 10
and 2." That message lands in an inbox or a voicemail. Somebody has to notice it,
match it to a job, find a rep who can be physically standing on that roof inside a
four-hour window, tell the homeowner, and show up with the right documentation. Miss
it and the adjuster writes the scope alone — which is how you get the 30-minute
estimate with no ridge cap, no drip edge, no ice-and-water shield, and a job that
either dies or eats its own margin.

What we build:

1. **Ingest.** Dedicated inbox + Gmail API, plus an AI voice agent on a tracked
   number for carriers that call. Parse out claim number, carrier, adjuster name and
   phone, date, arrival window, property address.
2. **Match and dispatch.** Auto-match to the job, check rep calendars and drive
   times, assign, and confirm with the homeowner by text — all inside a minute of the
   email landing.
3. **Auto-build the pre-meeting packet.** This is the high-value part:
   - Inspection photos organized by elevation, not by timestamp
   - NOAA storm verification for *that exact address on that exact date*, with hail
     size — free data, and it is the single most persuasive document in the folder
   - Measurements (EagleView/Hover report or Solar API geometry)
   - Preliminary scope, itemized, in the carrier's own line-item vocabulary
   - Local code requirements that force line items the adjuster may not know apply
4. **Day-of capture.** A guided photo checklist that will not let the rep mark the
   meeting complete until there is **at least one photo per line item**. Carriers
   don't pay opinions; the whole supplement game is won or lost here. Wide shots of
   all four elevations, close-ups with a scale reference, every penetration.
5. **Post-meeting.** Rep records a 90-second voice memo in the truck. We transcribe
   and structure it into approved / denied / needs-supplement.
6. **Supplement assembly.** Pre-fill the supplement request: each missed item with
   its photo, its measurement, and its code citation already attached. The owner
   reviews and sends instead of rebuilding it from memory at 11pm.

Nothing here negotiates. It documents, schedules, and assembles — and it attacks the
20–40% revenue leak directly.

### B. Knock-list targeting — *don't build another map*

The canvassing apps tell a rep where they *are*. They don't tell anybody which doors
are worth knocking. Joining four data sources fixes that:

- NOAA SPC hail/wind reports (free) → buffered swath polygons
- Parcel data — Regrid or ATTOM → owner name, owner-occupied flag, year built
- Google Solar API → roof area, pitch, segment count (10k free calls/mo)
- County permit records → has this roof already been replaced?

Output is not a heat map. It is a ranked list: *these 60 addresses*, because hail
≥1.25″, roof ≥12 years old, no reroof permit on file, owner-occupied, and nobody has
knocked it in 90 days. Knocking 60 qualified doors instead of 300 random ones moves
the 2–3% number by more than any script ever will.

Plus a **suppression layer**, which is really a compliance layer: national DNC scrub,
municipal do-not-knock registries, city-by-city permitted solicitation hours, and
prior "not interested" flags that persist across reps.

### C. Door to signature in one pass

At the door, on the rep's phone: type the address → satellite image, roof area and
pitch from the Solar API, the storm record for that address, and a damage-likelihood
read. Then the contingency agreement, e-signed on the spot.

Justification is the 2–3× number. Every step that pushes the signature to "I'll email
it tonight" costs two thirds of the deal.

### D. Speed-to-lead and consent-safe follow-up

Inbound call answered instantly (85% don't leave a voicemail). Sequenced follow-up
for the "come back later" doors — but only where consent was captured *at the door*,
written, timestamped and geotagged. See §6; this is the module most likely to get
them sued if built carelessly.

### E. The rep layer

Rep buy-in is the documented #1 reason these tools fail, so this is not optional
polish. Live earned-to-date commission, honest pipeline, and — the one that decides
everything — **zero double entry**. If a rep has to type the same thing into our app
and into their CRM, our app is dead in six weeks. Every integration we skip is a
place the product dies.

---

## 5. Stack and costs

| Need | Choice | Cost |
|------|--------|------|
| Storm reports | NOAA SPC CSV | Free |
| Forensic hail swaths | HailTrace / Interactive Hail Maps | Subscription; add only if free data proves too coarse |
| Parcel + owner | Regrid API, or ATTOM | ATTOM from ~$499/yr; Regrid quote-based, 30-day trials available |
| Roof geometry | Google Solar API `buildingInsights` | 10k/mo free, then usage |
| Survey-grade measurement | EagleView / Hover / Roofr | $13–87 per report, ordered per real job |
| SMS | Twilio, 10DLC registered | Usage |
| Voice agent | Vapi / ElevenLabs | Usage |
| Carrier email ingest | Gmail API | Free |
| E-signature | Dropbox Sign / DocuSign | Per envelope |
| Parsing, packet and supplement drafting | Anthropic API | Usage |
| App | Next.js + Postgres via Prisma | — |

Last line is deliberate: it is the stack already running in this repo, so the first
version starts from a known-good base rather than a blank directory.

Note that the expensive per-unit items (EagleView, forensic hail) are all *per real
job*, not per knock. Unit economics work out: a single recovered supplement line item
pays for a month of data.

---

## 6. Compliance — design it in, not on

Four separate regimes, all with teeth.

**1. Unauthorized public adjusting.** Covered in §3. Per-state config table. Never
ship a "negotiate" button.

**2. TCPA / FCC one-to-one consent.** As of January 2026, consent cannot be shared
across brands or bought as a shared lead — the homeowner must see *this specific
business name* and take an affirmative action for it alone.
([ActiveProspect](https://activeprospect.com/blog/fcc-one-to-one-consent/))
Practically: the consent checkbox lives in our door-side app, captures the business
name shown, and stores a timestamped, geotagged, immutable record. That record is the
defense, and no other product in this space is generating it properly.

**3. Revocation.** Consumers may revoke by *any reasonable means* — not just "STOP",
not just in caps. "please quit sending me these" in any channel is a revocation, and
it must be honored within **10 business days**. The broader "revoke-all" rule (a
revocation on one message type kills all future contact from that company) was pushed
to **31 January 2027**, so build for it now.
([ActiveProspect](https://activeprospect.com/blog/tcpa-revocation-of-consent/))
Implication: revocation has to be a first-class object matched on phone number across
every channel, not a per-campaign unsubscribe flag.

**4. Municipal solicitation law.** Varies city by city: permit applications,
background checks on every rep, per-rep badges, restricted hours, and do-not-knock
registries. ([MRSC](https://mrsc.org/explore-topics/business-regulation/types/mobile-vendors))
Model this as a per-jurisdiction rules table that the knock list honors
automatically. A rep who can't knock a street before 9am should simply not see that
street before 9am.

Every one of these is a reason to buy the product rather than a tax on building it.
A crew that can produce a geotagged consent record and a permit-compliant knock log
is a crew that doesn't get fined.

---

## 7. Build plan

**Phase 0 — two weeks, write no code.** Ride along. Time every step. Sit in on an
adjuster meeting. Read six months of their actual carrier emails and count how many
appointment notices arrived by email vs. phone, and how many got missed. Everything
above is desk research; this is the part that tells us if §4A is really the wound.

**Phase 1 — 4–6 weeks. Adjuster Meeting Command Center (§4A).** Deliberately thin:
sits beside whatever CRM they already run, does not replace it. Ships as email
ingest → parse → dispatch → auto-packet → photo-checklist capture. Success metric is
blunt: **zero missed adjuster meetings, and a supplement filed on every job.**

**Phase 2 — knock-list targeting (§4B),** starting with free NOAA data plus one
parcel source. Metric: knocks-per-appointment against their current baseline.

**Phase 3 — door to signature (§4C).** Metric: share of contingency agreements signed
on-site vs. emailed.

**Phase 4 — speed-to-lead and follow-up (§4D),** once the consent plumbing from
Phase 3 is real.

The rep layer (§4E) isn't a phase. It is a rule that applies to every phase: if a rep
has to enter it twice, we built it wrong.

---

## 8. The honest fork

Two different projects wear the same clothes here.

**Internal tool for the buddies' crew.** Fast, no sales cycle, no support burden,
tuned exactly to how they work. Worth doing regardless — the adjuster command center
pays for itself on a handful of recovered supplements.

**Vertical SaaS.** Storm-restoration roofers are a proven market with real budget and
an acute, expensive, currently-unsolved problem in exactly the spot we'd be building.
But it means multi-state compliance tables, carrier-format variety, CRM integrations
we don't control, and support during storm season, which is when everything breaks at
once.

Recommendation: build Phase 1 as an internal tool, honestly. Instrument it. If it
eliminates missed adjuster meetings and lifts supplement recovery on one crew over
one storm season, that is a real number to sell with — and the architecture decisions
that matter for SaaS (per-state rules tables, per-tenant data isolation) cost almost
nothing to make correctly now and a fortune to retrofit later.

---

## 9. Questions for the buddies

Every one of these changes what gets built:

1. Which states and cities do you work? (Drives the adjuster-law and solicitation
   tables.)
2. What's your actual split between storm/insurance work and retail cash work?
3. What CRM are you on today — JobNimbus, AccuLynx, Roofr, spreadsheets?
4. **How do adjuster appointments reach you — email, phone, carrier portal?** And
   honestly: how many got missed last season?
5. Do you file supplements on every job, or only when something obvious got left out?
6. Who writes the estimate, and in what — Xactimate, or something else?
7. How many reps, are they W-2 or 1099, and what do they get paid on?
8. What do you currently pay for, per month, across all of this?
9. What's your average job size and your current close rate? (Baseline for measuring
   whether any of this worked.)

---

## Sources

- [SubcontractorHub — best roofing canvassing software 2026](https://www.subcontractorhub.com/blog/best-roofing-canvassing-software)
- [SubcontractorHub — roofing sales close rate benchmarks](https://www.subcontractorhub.com/blog/roofing-sales-close-rate)
- [SubcontractorHub — the roofing insurance claim process in 2026](https://www.subcontractorhub.com/blog/roofing-insurance-claim-process)
- [GhostRep — best canvassing apps for roofing contractors](https://www.ghostrep.ai/blog/best-canvassing-apps-roofing-contractors)
- [IA Solutions — roofing insurance supplements 2026 guide](https://www.iasolutions.claims/blog/roofing-insurance-supplements-2026-guide-independent-adjusters)
- [IA Solutions — Xactimate supplement guide](https://www.iasolutions.claims/blog/xactimate-supplement-guide-roofing-contractors)
- [ClaimSupplementPro — contractor photo documentation checklist](https://www.claimsupplementpro.com/blog/the-contractors-photo-documentation-checklist-for-every-insurance-claim/)
- [Allstate Exteriors — insurance adjuster meeting checklist](https://www.allstateexteriorsinc.com/insurance-adjuster-meeting-checklist)
- [Local Roofing Help — adjuster meeting checklist](https://localroofinghelp.com/guides/insurance-adjuster-roof-meeting-checklist)
- [WSHB — Texas Supreme Court on roofers and settlements](https://www.wshblaw.com/experience-texas-supreme-court-to-roofer-stick-to-shingles-not-settlements)
- [JustClaims — unauthorized public adjusting, 2026 contractor rules](https://justclaims.ai/blog/uppa-contractor-public-adjusting-compliance/)
- [Restoration Industry Association — don't become an accidental adjuster](https://www.restorationindustry.org/restoration-blog/dont-become-accidental-adjuster-staying-within-lines-restoration-contractor)
- [The Arizona Roofer — "adjuster on staff", is it lawful?](https://thearizonaroofer.com/the-roofer-said-they-have-an-adjuster-on-staff-is-that-legal/)
- [ActiveProspect — FCC one-to-one consent rule](https://activeprospect.com/blog/fcc-one-to-one-consent/)
- [ActiveProspect — TCPA revocation of consent](https://activeprospect.com/blog/tcpa-revocation-of-consent/)
- [MRSC — regulation of peddlers and solicitors](https://mrsc.org/explore-topics/business-regulation/types/mobile-vendors)
- [Google — Solar API building insights](https://developers.google.com/maps/documentation/solar/building-insights)
- [Regrid — parcel API](https://regrid.com/parcel-api)
- [ATTOM — property data API](https://www.attomdata.com/solutions/property-data-api/)
- [EagleView — aerial roof measurements](https://www.eagleview.com/blog/aerial-roof-measurements/)
- [1ESX — roof measurement reports with Xactimate ESX](https://www.1esx.com/streamlining-claims-a-guide-to-roof-measurement-reports-with-xactimate-esx-in-2026/)
- [Ketterly — hail tracking software for roofing contractors](https://ketterly.com/blog/hail-tracking-software-roofing)
- [Bullseye — AI voice agents for contractors, 2026 lead capture](https://www.bullseyemarketingconsultants.com/marketing/ai-voice-agents-for-contractors-2026-lead-capture-guide/)
- [VA Horizon — improving roofing close rate](https://www.vahorizon.site/roofing/guides/close-rate-improvement/)
- [d2du — door-to-door sales statistics 2026](https://d2du.com/post/door-to-door-sales-statistics)
