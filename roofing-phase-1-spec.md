# Phase 1 spec — Adjuster Meeting Command Center

Companion to `roofing-automation-research.md`. That document argues *why* this is the
first thing to build; this one says what it is.

**Scope of Phase 1:** a carrier notice arrives, and a prepared rep is standing on the
right roof inside the arrival window with a complete evidence packet — then leaves
with every photo the supplement will need.

**Target:** 4–6 weeks, one crew, one storm season of real use before anything else
gets built.

**Success is two numbers.** Zero missed adjuster meetings. A supplement filed on every
job. Both are instrumented from day one (§9) — if we can't show movement, the next
phase doesn't get built.

---

## 1. Non-goals

Naming these matters more than the feature list, because each one is a place this
project could quietly turn into a two-year build:

- **Not a CRM.** It sits beside JobNimbus/AccuLynx/whatever they run. It does not own
  the customer record.
- **Not a canvassing app.** No territory maps, no pin dropping. That's Phase 2.
- **No e-signature, no payments, no production scheduling.**
- **Nothing that negotiates.** See §8. This is a hard architectural boundary, not a
  preference.
- **No multi-tenant onboarding flow.** One crew. Tenant isolation exists in the schema
  (§3) because retrofitting it is expensive; the signup UI does not.

---

## 2. The pipeline

```
carrier notice          parse            match             dispatch
(email | phone)  ──▶  (LLM, typed)  ──▶  (to a job)  ──▶  (rep + homeowner)
                            │                 │
                            ▼                 ▼
                     low confidence      no match found
                            └────▶ human review queue ◀────┘

                                                              ┌──────────────┐
    packet build  ──▶  day-of capture  ──▶  post-meeting  ──▶ │  supplement  │
    (auto, T-24h)      (gated checklist)    (voice memo)      │   assembly   │
                                                              └──────────────┘
```

Five stages. Each is independently useful, which matters — if stages 4 and 5 slip,
stages 1–3 alone still eliminate missed meetings.

---

## 3. Data model

Prisma, Postgres, matching the stack already in this repo. Every table carries
`orgId`; queries are scoped through a single helper rather than by convention, so
tenant isolation is enforced in one place.

```prisma
model Job {
  id            String   @id @default(cuid())
  orgId         String
  externalRef   String?  // id in their existing CRM
  address       Address  // normalized + geocoded
  homeowner     Contact
  claim         Claim?
  inspections   Inspection[]
  appointments  AdjusterAppointment[]
  scopeItems    ScopeItem[]
  stormMatch    StormEvent?
  @@index([orgId, externalRef])
}

model Claim {
  claimNumber   String   // the primary match key for inbound notices
  carrier       String
  dateOfLoss    DateTime
  deductible    Decimal?
  status        ClaimStatus
  @@index([orgId, claimNumber])
}

model AdjusterAppointment {
  id             String   @id @default(cuid())
  orgId          String
  jobId          String
  windowStart    DateTime // carriers give ranges ("Tuesday 10-2"), never a time
  windowEnd      DateTime
  adjusterName   String?
  adjusterPhone  String?
  adjusterFirm   String?  // staff vs independent changes how the meeting goes
  noticeSource   NoticeSource  // EMAIL | VOICE | PORTAL | MANUAL
  noticeRaw      String   // the original text, always kept for audit
  parseConfidence Float
  assignedRepId  String?
  status         ApptStatus
  packetId       String?
  outcome        MeetingOutcome?
  @@index([orgId, windowStart])
}

enum ApptStatus {
  PARSED          // extracted, not yet matched
  NEEDS_REVIEW    // low confidence or no job match — human queue
  UNASSIGNED
  ASSIGNED
  REP_CONFIRMED
  HOMEOWNER_CONFIRMED
  IN_PROGRESS     // geofenced check-in fired
  COMPLETE        // photo gate satisfied (§6)
  MISSED          // the number we are driving to zero
}

model Photo {
  id          String   @id @default(cuid())
  orgId       String
  jobId       String
  storageKey  String
  elevation   Elevation?   // N | E | S | W | ROOF | INTERIOR | COLLATERAL
  slope       String?
  capturedAt  DateTime     // from EXIF, not upload time
  gps         Json?
  scopeItems  ScopeItem[]  // many-to-many: the binding that makes supplements work
}

model ScopeItem {
  id          String   @id @default(cuid())
  orgId       String
  jobId       String
  code        String?      // carrier line-item code where known
  description String
  quantity    Decimal
  unit        String
  origin      ScopeOrigin  // INSPECTION | ADJUSTER_APPROVED | ADJUSTER_DENIED | SUPPLEMENT
  photos      Photo[]
  codeCitation String?     // the local building-code requirement forcing this item
}
```

The `Photo ↔ ScopeItem` many-to-many is the spine of the whole product. "Every
Xactimate line item needs a photo — if the adjuster can't see it, it's hard to justify
paying for it." Every other feature is scaffolding around maintaining that link.

---

## 4. Ingestion and parsing

**Sources.** A dedicated address (`claims@…`) with Gmail API push notifications;
carriers who phone get a tracked number with a voice agent whose transcript enters the
same pipeline. Manual entry always available — someone will always paste one in.

**Parsing.** Anthropic API with a typed tool schema, returning the appointment fields
plus a per-field confidence. Two rules:

- The raw notice is stored verbatim, forever, and shown beside every parse.
- **Carrier email is untrusted input.** It is data to extract from, never instruction
  to follow. The prompt boundary is explicit and the parser's only output channel is
  the typed schema — it cannot trigger a send, a dispatch, or a write of its own.

**Matching,** in order: exact claim number → normalized address → homeowner name +
carrier. Anything that doesn't land cleanly goes to the review queue.

**The review queue is the product's conscience.** Ambiguity must cost a human thirty
seconds, never cause a silent wrong dispatch. A meeting sent to the wrong rep is worse
than one flagged for a human, because the flagged one still gets covered.

---

## 5. Dispatch

On a confident match:

1. **Candidates** = reps whose calendar is free across the window, within drive time
   of their prior appointment, and carrying whatever certification the job needs.
2. **Notify** the top candidate by SMS + push. Calendar invite with the window, the
   address, the adjuster's name and firm, and a link to the packet.
3. **Confirm the homeowner** by text — they need to be home, and they're the ones who
   get surprised by a four-hour window.
4. **Escalate** on silence: no rep ack in 30 minutes → next candidate. Nobody assigned
   at T-24h → phone the owner. Nobody at T-4h → phone again, and loudly.

The escalation ladder is the feature. A notification that can be ignored is how
meetings get missed today; the ladder is what makes "zero missed" structural rather
than aspirational.

---

## 6. The packet and the photo gate

**Packet** builds automatically at T-24h, regenerates on demand, renders to one PDF:

1. **Storm verification** — NOAA SPC reports within a radius of the property for the
   date of loss, with hail size and time. Free data, and the most persuasive page in
   the folder: it moves the conversation from "this roof looks worn" to "1.75-inch
   hail fell on this address at 4:12pm on the date of loss."
2. Inspection photos grouped **by elevation**, not by timestamp.
3. Measurements — the EagleView/Hover report, or Solar API geometry for a preliminary.
4. Preliminary scope, itemized, in the carrier's own line-item vocabulary.
5. **Local code requirements** for the jurisdiction, from a seeded table. This is how
   drip edge, ice-and-water shield and ventilation stop being arguments and start
   being citations.

**The photo gate.** A guided capture checklist during the meeting, with a required
set: four elevations wide, roof overview, each slope, every penetration, test squares
with chalk and a scale reference, ridge and hip, valleys, flashing, gutters, and
collateral damage — AC fins, window screens, soft metals — which is what corroborates
hail when the roof itself is arguable.

An appointment **cannot be marked COMPLETE** until the required set exists and every
`ScopeItem` has at least one bound photo. This is the one place the app is deliberately
obstinate, and it is the entire reason it pays for itself.

**Capture should be hands-free where it can be.** The crew is already using Meta
Ray-Ban glasses on inspections, and §12 of the research explains why that matters: a
rep on a roof has no spare hand for a phone, and the tap burden is what kills the gate.
Target POV capture plus narration, transcribed and bound to scope items automatically,
with phone stills retained for close-up line-item proof. Build camera-roll ingestion
first — it works today and needs nobody's approval; the live SDK path is a later
upgrade, not a dependency.

**Offline-first is non-negotiable.** Reps are on roofs, in storm-damaged
neighborhoods, holding a phone with one bar. Capture writes to local storage and syncs
opportunistically; nothing in the capture flow may block on the network. Getting this
wrong means the app gets abandoned in week two — and a tool reps abandon is exactly
the failure mode the research found in every incumbent.

**Post-meeting:** a 90-second voice memo in the truck, transcribed and structured into
approved / denied / needs-supplement per line item, presented for one-tap correction.

---

## 7. Supplement assembly

Everything marked `SUPPLEMENT` assembles into a document where each item arrives with
its photo, its measurement, and its code citation already attached. The owner reviews
and sends.

The point is not that the software writes it better than they would. It's that it
exists at all, on every job, instead of being reconstructed from memory at 11pm on the
jobs somebody happened to remember.

---

## 8. Compliance, in code

From §3 of the research: in most states a contractor who negotiates a claim is
practicing public adjusting without a license, and in Iowa that voids the repair
contract outright. So:

- **A per-state rules table gates output.** Not documentation, not a policy — a table
  the generator reads.
- **Generated documents state facts.** "Documentation of observed conditions." Never
  "demand", never "we require", never a settlement position.
- **No outbound message to a carrier or adjuster is ever auto-sent.** Dispatch and
  homeowner confirmations automate freely; anything pointed at a carrier is composed
  for a human to review and send.
- **Full audit log** — who generated what, when, from which evidence.

Before Phase 1 ships, the rules for every state the crew works get confirmed. That's a
blocking item, not a launch-week cleanup.

---

## 9. Instrumentation

Built in from the first commit, because the whole case for Phase 2 rests on these:

| Metric | Baseline needed |
|--------|-----------------|
| Missed adjuster meetings | Ask them for last season's count — see research §9 Q4 |
| Minutes from notice arrival to rep assigned | Currently unmeasured; likely hours |
| % of meetings closed with a complete photo set | Currently ~0 measured |
| % of jobs with a supplement filed | Their current rate |
| Supplement dollars requested vs. recovered | The number that justifies everything |

---

## 10. Decisions still open

These change the build, so they're worth resolving in the Phase 0 ride-alongs:

1. **Notice mix — email vs. phone vs. carrier portal.** If it's mostly portal, the
   ingestion story is scraping or manual entry and the estimate moves. This is the
   single biggest unknown in the spec.
2. **Photo storage** — Supabase storage or S3. Volume and cost per job decide it.
3. **CRM read path** — does theirs have a usable API, or is this CSV import plus
   manual job creation?
4. **Who owns the review queue** day to day? The escalation ladder needs a name at
   the end of it.
5. **Measurement source** — order EagleView per job, or start with Solar API geometry
   and only buy a report once the claim is live?
