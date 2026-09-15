# Lead pipeline — prototype

Signals in, scored leads out, and **consent decides what you are allowed to do with
each one**.

Built against the finding in `../roofing-automation-research.md` §15: Dayne paid
**$208 a lead** for twelve leads, none in a decent area, most of whom *"felt pressured
to schedule."* This is the shape of the thing that replaces that.

## Run it

```bash
node seed.js      # sample leads so there is something to look at
node server.js    # http://localhost:4317
```

Node 22.5+ only. No install step — `node:sqlite` and `fetch` are built in.

Two optional environment variables turn on the real versions of two things:

| Variable | Without it | With it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Keyword heuristic scoring | Claude reads each lead (`npm install` first) |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Anonymous Reddit (403s from most servers) | Official app-only OAuth |

```bash
npm install                       # only needed for Claude scoring
export ANTHROPIC_API_KEY=sk-ant-...
```

## Why consent is a column and not a checkbox

Every lead carries a `consent` value, and **the interface renders different buttons
for each**:

| Consent | What you get | Why |
|---|---|---|
| `opted_in` | Call, Text | They asked to be contacted. One-to-one consent is on file. |
| `public_thread_only` | "Open thread to reply" — no call, no text | They posted in public. That is not permission to contact them. |
| `none` | Nothing | Nothing recorded, so nothing offered. |

This is the whole point of the prototype, and it is not decoration. The January 2026
FCC one-to-one consent rule ended shared-lead texting: consent belongs to one named
business and cannot be transferred. A homeowner who posts *"my roof is leaking, who do
I call"* in a public forum and then gets a cold text from a company they never
contacted is having **exactly the experience Dayne is paying $208 a lead to avoid**.

So the rule lives in the data model, where a rushed afternoon cannot route around it.
If they hand over a number in the thread, you change the permission on the lead and
the call button appears — deliberately a decision someone makes, not a default.

## Why Reddit and not Facebook

Reddit is implemented because it is the one public intent source with an **official,
documented read API and no login wall** in front of the content. Monitoring public
subreddits by keyword is what the API is for.

Facebook groups are not implemented, and shouldn't be. Group posts sit behind
authentication, Meta's Automated Data Collection Terms prohibit collecting them
without a recognized API, and the exposure runs to account bans and
cease-and-desists. The research document covers this in §15.

**Be honest about Reddit's yield, though.** Residential roofing intent on Reddit is
thin and poorly geo-located — homeowners aged 35–70 in Spring, Texas are not posting
there in volume. This is a legitimate source, not a good one. It earns its place by
proving the architecture: the same signal → score → route pipeline takes Meta Lead
Ads, the web form, missed calls and storm-triggered campaigns, which are where the
volume actually is.

## What is real and what is stubbed

**Real** — SQLite persistence; the Reddit adapter including OAuth, pagination-free
search, and dedupe by permalink; Claude scoring with structured output and a keyword
fallback; the scoring rubric; consent gating; status pipeline; audit trail.

**Stubbed** — `meta_lead_ad`, `web_form` and `missed_call` exist as sources with
seeded examples, but nothing receives their webhooks yet. Those are the next build,
and they are where the $10–22 leads come from.

**Untested** — the live Reddit call. This container's egress policy blocks
reddit.com, so `fetchReddit` has never run against the real API. The URL building and
response mapping are unit-verifiable; the network round trip is not. **Expect to debug
that first on a machine with open egress.**

## The scoring rubric

`hot` is an owner with active damage who wants someone out now. `warm` is a planned
replacement, a request for a recommendation, or an open claim. `mild` is researching.
`cold` is not a prospect — and the heuristic is deliberately harsh about renters,
DIYers, and other contractors talking shop, because those are what fill a bad lead
list.

The keyword fallback is crude by design. It gets the obvious cases right (a tenant
asking about a landlord scores 0) and misses tone — the seeded missed-call lead scores
warm when a human would call it hot. That gap is the argument for the Claude path, not
a reason to keep tuning keywords.

## Layout

```
server.js            HTTP + routes
seed.js              sample leads and a starter signal
lib/db.js            schema and queries
lib/score.js         Claude scoring + heuristic fallback
lib/sources/reddit.js  the one implemented source
public/index.html    the interface
```

## Next

1. Meta Lead Ads webhook — the real volume, with consent captured at source.
2. Storm trigger: NOAA fires an event, a geo-fenced campaign goes live inside the
   72-hour window where leads cost $10–22.
3. Twilio, so texting happens in the app and revocation is matched on phone number
   across every channel rather than per campaign.
4. Calendar booking.
5. Move this out of the yacht repo — see `../roofing-HANDOFF.md`.
