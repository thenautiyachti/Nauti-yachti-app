# Roofing project — handoff

Written for whoever picks this up next, including a fresh Claude session with no
memory of the conversation that produced it. Read this first, then the two documents
it points at.

## What this is

Software for **Synergy Roof Systems LLC** (Pearland TX, Greater Houston) — and more
immediately for **Dayne Krejci**, their Sr. Project Manager, who runs a personal brand
page as "Daynetheroofer" out of Spring, TX and fronts the company's storm response on
his own number.

The original ask was "software that door-knocks for them." The research says don't
build that.

## The three documents

| File | What it holds |
|---|---|
| `roofing-automation-research.md` | The full research, §1–§14. Market, funnel, legal constraints, the Storm Shield finding, the corrections. |
| `roofing-phase-1-spec.md` | Engineering spec for the adjuster-meeting build: data model, pipeline, photo gate, compliance. |
| this file | Orientation and current state. |

There is also a shareable summary published as an Artifact:
<https://claude.ai/artifact/58krqn682QXffzsU2zoBww>

## The thesis in four lines

1. Canvassing software is a commodity — $19/user/month, and it doesn't move close rates.
2. The money leaks downstream: the adjuster meeting, and the 20–40% of job revenue lost
   when a carrier's 30-minute first estimate goes uncontested.
3. Synergy already sells **Storm Shield**, a membership promising a "digital roof
   history, accessible anytime." That product doesn't exist yet. Building it is the
   wedge — and its pre-loss photos are what kill the wear-and-tear denial later.
4. In Texas, a contractor who negotiates a claim is adjusting without a licence, and
   the penalty lands on the contract. **Nothing we build may negotiate. It documents.**

## What has been established

- Storm Shield is the lead build; adjuster machinery is claim-mode over the same data
  (research §11)
- `Photo ↔ ScopeItem` is the load-bearing relationship — an undocumented line item is
  an unpaid one (spec §3)
- Capture must be hands-free and offline-first; the crew already uses Meta Ray-Ban
  glasses, and camera-roll ingestion is the path that ships today (research §12)
- They deploy out of market to hail — a Fort Worth campaign is on record — so
  per-jurisdiction permit and building-code tables get exercised constantly (§13)
- Build for Dayne first, not the company: the bench is 1099, and in a 1099 shop reps
  choose their tools (§11)
- Residential membership pricing anchors around $200–350/yr in Texas (§14)

## Blocking question

**What were Storm Shield members promised in writing** — price, tiers, enrollment
count, exact commitments. It is not public. That document is the portal's
specification and nothing substitutes for it.

Three smaller ones: what powers the "Storm Tracker" in the site nav; whether the
drone inspections emit structured output or just image files; who writes the annual
roof health report today and in what.

## Why this lives in the yacht repo

It was researched in a session rooted at `thenautiyachti/Nauti-yachti-app`, so the
documents landed here. Fine for research; wrong for a build. **Before writing any
code, move these three files into their own repository.** Nothing here depends on the
yacht app.

## First moves on a local machine

1. Split into a new repo (above).
2. Get the Storm Shield member agreement and write the portal spec against it.
3. Confirm the unauthorized-public-adjusting rules for every state Synergy works —
   research §3 and §10 cover Texas; deployment work means others apply too. Blocking
   item, not launch-week cleanup.
4. Then build, in the order set out in research §11.
