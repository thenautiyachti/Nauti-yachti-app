# The agency platform

Management for creator accounts: who we run, what media we are waiting on, what
everybody is owed, and what clause 4 of the Inner Wifi Sales Agreement takes off
the top before the two partners split the rest.

Console: **`/admin/agency`**, behind the same admin session as `/admin`.

---

## It is a second business in the same database

Everything agency lives in `Agency*` tables and `lib/agency/`. Nothing in it
reads a `LedgerEntry`, a `Booking` or anything else belonging to the charter
business, and nothing in the charter console reads an `Agency*` row.

That separation is contractual, not cosmetic. Clause 4 takes 2.5% of agency
revenue monthly and expressly excludes ventures unrelated to model management.
Charter income is one of those ventures, so a query that ever swept a charter
dollar into an agency total would be handing over 2.5 cents of it, forever.

## The waterfall

A $100 subscription, on a 50/50 net deal:

| | |
|---|---:|
| Fan pays | $100.00 |
| OnlyFans takes 20% | −$20.00 |
| **Reaches the account** | **$80.00** |
| Creator's 50% | −$40.00 |
| **Agency commission** | **$40.00** |
| Agency costs (chatters, ads, software) | −$12.00 |
| **Agency net profit** | **$28.00** |
| InnerWifi royalty, 2.5% | −$0.70 |
| **Divides between the partners** | **$27.30** |

`lib/agency/split.js` computes it. Money is integer cents and percentages are
basis points throughout — a dollar is multiplied by a percentage four times
before it lands, and float drift across that chain produces statements whose
lines do not add up to their own totals.

### `splitBasis` is the term people get wrong

A creator's percentage attaches to either the **net** (after OnlyFans' cut) or
the **gross**. A "50/50 deal" written on gross pays the creator $50 of the $80
that arrived — 62.5% — and leaves the agency $30, not $40. Set it per creator
and check it against what was actually signed.

## Clause 4 is unresolved, and the console says so monthly

The agreement reads *"2.5% Net Profit Share Of Agency Revenue"*, which names two
different numbers. The platform computes both every month and shows the gap.

Set which one you pay on with `royaltyBasis` (`net_profit` or `gross_revenue`);
it defaults to `net_profit`. `royaltyEndsOn` exists for one outcome — an
addendum putting a term on a royalty which, as signed, has none. Leave it null
until there is a signed writing, because clause 19 means nothing else counts.

Accounts that do not use InnerWifi's resources can be excluded from the royalty
with `royaltyCovered: false`, which **requires a written reason**. That reason
is the evidence if the carve-out is ever questioned.

Background: `docs/inner-wifi-agreement-review.md`.

## Paperwork gates payouts

Nothing publishes and nobody is paid without a verified government ID, age
verification, a model release, a content licence, and a tax form. 18 U.S.C.
§ 2257 puts the record-keeping duty on the producer, which in an agency
arrangement is this business, not the creator.

Two separate checks:

- **The creator** — documents on file, verified, unexpired; over 18 today.
- **The content** — the performer was over 18 on the day it was **produced**.
  A creator who is 19 now does not clear a clip shot at 17, and the production
  date is the only thing that catches it. Approval is refused with a 422.

`AgencyComplianceRecord` stores a **reference** to a document, never the
document. ID scans and tax forms belong in a secure store; the route rejects
anything that looks like an embedded file.

A held payout is not a lost one. Held and below-minimum amounts carry into the
next period and pay out when the blocker clears.

## Earnings are imported, not synced

OnlyFans publishes no third-party management API, and its terms do not permit
automating an account you do not own. Every "OnlyFans API" on offer is a browser
session driven with borrowed credentials, and when it is noticed the account is
terminated — which in this business is somebody's whole income.

So: export the statement, upload the CSV, `POST /api/agency/earnings`. The
parser handles quoted commas, US and ISO dates, accounting parentheses, and
files that print any two of gross/fee/net. Rows it cannot read come back with
line numbers rather than being dropped.

Re-uploading the same file imports nothing. Rows with a transaction id dedupe on
it; rows without dedupe on account + day + amounts, **counted** — so two genuine
$20 tips on one afternoon both import, and a re-upload of a file containing them
adds neither. Every import gets a batch id, and
`DELETE /api/agency/earnings?importBatch=…` undoes one as a unit.

## API

All routes require an admin session and live under `/api/agency`.

| Route | Methods | Notes |
|---|---|---|
| `/report?period=YYYY-MM` | GET | Everything the console needs, in one call |
| `/creators` | GET POST PATCH | |
| `/accounts` | GET POST PATCH | Royalty carve-out needs a reason |
| `/content-requests` | GET POST PATCH | Approval runs the age-at-production check |
| `/compliance` | GET POST | References only, never documents |
| `/earnings` | GET POST DELETE | POST takes `csv`; `dryRun: true` to preview |
| `/expenses` | GET POST | |
| `/payouts` | GET POST PATCH | POST writes the run; PATCH needs a transfer reference |
| `/royalty` | GET POST PATCH | POST closes a month and freezes its inputs |
| `/partners` | GET PUT POST PATCH | Shares must total exactly 100% |
| `/settings` | GET PUT | |

## Monthly close

1. Import each account's statement.
2. Record the month's expenses — every one left out is royalty paid for nothing.
3. Check **Compliance** and clear what you can.
4. **Payouts → Write this run**, then send each and record its reference.
5. **InnerWifi → Close this month**, then remit and record the reference.
6. Partner draws — refused while a creator payout is held, unless you pass
   `acknowledgeHolds: true`. Creators come before partners in the waterfall.

## Tests

```
node scripts/test-agency-split.js        # the waterfall, 53 checks, no database
node scripts/test-agency-compliance.js   # gate, pipeline, payouts, 66 checks
node scripts/test-agency-store.js        # end to end — needs a THROWAWAY DATABASE_URL
```

The first two run on hand-built objects and need nothing. The third seeds a real
schema and **deletes every `Agency*` row before it starts** — never point it at
anything real.

## What this deliberately does not do

- **No automated chasing.** It produces the list; a person sends the message.
  Creators are self-employed people whose income depends on this relationship,
  and three automated reminders to somebody in hospital costs more than the
  posts were worth.
- **No platform automation.** See above.
- **No document storage.** References only.
- **Nothing from InnerWifi's materials.** Clause 9.2 bars derivative works. This
  is written from the business requirements and contains none of their SOP text,
  templates or course material. Keep it that way.
