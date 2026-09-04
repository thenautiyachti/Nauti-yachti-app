# The Nauti Yachti — Owner Console Manual

For anyone using the admin dashboard at **thenautiyachti.com/admin**. Ask the owner
for the passcode — it is not in this manual.

Last updated 2 September 2026.

---

## How the console is laid out

Six groups run along the top. Clicking a group reveals its tabs underneath.

| Group | Tabs |
|---|---|
| **Overview** | The day at a glance, the board, and the crew |
| **Bookings** | Inquiries · Bookings · Availability |
| **Money** | Income & expenses · Reconciliation · Tax Report · Subscriptions |
| **Marketing** | Media · Media Drafts · Testimonials |
| **Setup** | Packages & pricing · Add-ons · Coupons |
| **Boat** | Maintenance |

A number in brackets after a tab name means **something is waiting on you**. No
number means nothing needs doing — it does not mean the tab is empty. Testimonials
holds every approved review and still shows no number, because none of them need
a decision.

---

# Bookings

## Inquiries

Enquiries submitted through the website form. Each shows the guest, package, date
and party size, and can be marked new / pending / booked / completed / cancelled.

Two separate lists live on this tab and are deliberately **not** counted as
enquiries:

- **Crew list** — name and email captures from the `/glow` page and the on-boat QR
  code. This is the list to mail when a glow date is set. To honour an
  unsubscribe, set that person's status to **lapsed** and they drop out of the
  copy button.
- **Extra guest contacts** — people who were aboard *someone else's* booking and
  whose number is worth keeping, for a follow-up or a second review ask. Every
  actual guest is already under Bookings, so this list is only ever the extra
  people.

## Bookings

Every charter, from any source — Boatsetter, GetMyBoat, the website, cash, Zelle.
Add one with the form above the table.

**Marking a booking "completed" now writes its income row automatically.** That
was the single biggest hole in the system: the two records were only ever joined
by hand, and six charters' income went missing that way. Two rules govern it:

- It will not create a second row if one already exists, so re-saving a completed
  booking is safe.
- **No price means no income row.** It refuses to guess, because a made-up number
  in the ledger is worse than an obviously missing one.

A booking paid through the website checkout now appears here on its own, created
from the Stripe webhook as **booked** (not completed — the trip has not happened
yet).

## Availability

Block days per vessel. A day with bookings that do not fill it shows as partially
booked, calculated from the summed hours of that day's charters.

---

# Money

## Income & expenses

Every dollar in or out. The form on the left adds an entry: Income or Expense, a
category, an amount, a date, and for income the origin it came from. Linking an
entry to a booking makes it appear in that booking's profit.

Below the list: breakdowns by category, profit per booking, and commission lost to
the platforms.

## Reconciliation

Answers one question per booking — is this charter's money actually on the books?
Matching is on the real foreign key between a booking and its ledger rows, not on
date and amount.

**Boatsetter pays in two legs**, the boat and the captain fee, often days apart.
Two income rows against one charter is normal, not a duplicate.

## Tax Report

Pick a year for totals, a CSV export, and breakdowns.

Income is split **by vessel** and **by origin** rather than by category — every
reservation is logged under the single category "Reservation", so a by-category
panel would be one row totalling everything.

It also shows **average per charter** and **average per hour**, which are the two
numbers pricing actually turns on. These come from bookings rather than ledger
rows, because a Boatsetter charter produces two income rows and counting rows
would halve the apparent value of a trip.

If income has no vessel recorded, an amber note says how much. That is a prompt to
fill it in, not a rounding error.

## Gift certificates

Certificates bought from the public site, and what has been redeemed against
them. The tab sits under **Money** because that is what one is: money taken now
for a charter owed later.

Each shows its code, who bought it, the face value, what is left on it, and its
state. A certificate that has been paid for and not yet redeemed is a
**liability** — the money is in the account but the trip has not been given. It
is the same shape as a charter someone paid for and never took, and it should be
read the same way.

To redeem one, apply its code at checkout or against a booking. Partial
redemptions leave the remainder on the certificate.

**They do not expire on their own.** Nothing in this system voids one for age,
so an old certificate is still owed unless you decide otherwise — and that is a
decision to make deliberately, not to discover when someone turns up with it.

## Subscriptions

Recurring costs, normalised to a monthly figure so weekly, monthly and yearly
items can be summed.

---

# Marketing

## Media

The public gallery, grouped by package — bachelor, birthday, corporate, glowz,
night, partycove, tubing. Grouping makes it obvious which package is thin.

Captions edit in place. **+ Add** adds a tile to that category.

New images belong in the site's `public/gallery/` folder and are referenced as
`/gallery/name.jpg`. They are then served from our own repository. Most of the
older tiles still point at BrandCrowd, a logo-design service — if that account
ever lapses, those images disappear, which is why new ones go in our own folder.

## Media Drafts

Every post Coral has drafted, laid out as cards and boxed by the day it goes
out. Two days side by side, soonest first.

### What goes out on its own, and what does not

**A post marked SCHEDULED will publish by itself.** Siren runs each morning and
puts out whatever is due that day. Giving a draft a date *is* the permission to
post it, so she does not ask again — there is no second confirmation, and no
message the morning it happens.

That permission stops at SCHEDULED. Nothing in any other state is ever
published: not a draft Coral has proposed, not one you have approved without
giving it a date, and not one you have rejected.

So the queue is safe to leave alone **until a post's date arrives**. Up to that
morning you have as long as you like to read it. Once the date is today, the
next thing to touch it is Siren.

To stop one, press **Don't post**. That is the only thing that takes it out of
her way.

### Approved with no date

An approved post with no date **will never go out**. Siren only publishes what is
already scheduled, and nothing else in the system assigns a date — so until you
set one, it sits.

Coral now proposes a date for each of these in her daily status, and raises one
as a board item if it has been waiting more than three days. The Overview also
flags them under **Needs attention**. Set the date with **Reschedule**.

## Asking for Google reviews

The panel at the top of **Testimonials** lists everyone who could be asked, with
the freshest charter first.

Four filters: **Still to ask**, **Already asked**, **Not asking**, and **Every
charter** — which means every charter, archived ones included.

| Button | What it does |
|---|---|
| **Text it** (green) | Opens your messaging app with the message already written, and ticks them off. Phone only — a desktop has nothing to hand an `sms:` link to. |
| **Preview** (blue) | Shows the wording first, and can copy it for pasting into a platform message thread. |
| **Don't ask** (amber) | Takes them off the list for good. |

**Don't ask** is for the guest you will never ask — one who damaged something,
or who you would rather not hear from. They move to **Not asking**, come out of
the counts, and can be restored with **Put back**. Nothing is deleted. Before
this existed the only way to clear such a guest was to mark them asked, which
puts something untrue in the record and then hides it behind a tick.

**Ask via** only appears for guests with no phone number. Those cannot be texted
at all, so the platform thread is the only way to reach them, and the column is
the instruction. A guest with a number just says *Text*.

Two rows say **extra contact** instead of a charter reference. Those are people
who sailed on somebody else's booking and whose number you kept — see *Extra
guest contacts* under Bookings. They can be asked like anyone else.

### On a card

- The photo or clip it goes out with, or **No media attached** with a link to
  add one. Instagram and TikTok refuse a post without one, so a scheduled card
  showing that warning will fail on the day.
- The caption in full, so you are approving the words against the picture.
- The platform and when it goes out.
- **Mark posted** · **Don't post**

Posted, denied and past drafts sit in a collapsed group above the days —
a record, not a to-do list.

## Testimonials

Reviews shown on the public site, plus the panel for **asking past guests for a
Google review**.

Neither booking platform hands over contact details, so every number was typed in
by hand — a guest with no number is a review that never gets asked for.

**Text it** opens your phone's messaging app with the message already written and
ticks the charter off. **It does nothing on a desktop** — this has to be done from
a phone.

---

# Setup

## Packages & pricing

Per-package prices, per-guest rates, and the hourly grid per vessel for weekday
and weekend. Every change is logged to price history.

## Add-ons · Coupons

Extras that can be attached at checkout, and discount codes with optional expiry
and usage limits.

---

# The top bar

| Button | What it is |
|---|---|
| **🔈 Enable Pearl** | Lets Pearl speak out loud in this browser. Turns into **🔊 Pearl** once she can; hover it to see the last thing she said. A browser will not play audio until you click something, which is the only reason this button exists — it is not a mode, and there is nothing behind it. |
| **📱 On the dock** | The phone page: ask for reviews, log engine hours. Everything on it needs a phone — a text link has nothing to open on a desktop, and an hour reading is taken at the boat. Worth adding to your home screen. |
| **📖 Manual** | This document. |
| **← Back to site** | The public website. |
| **Log out** | Ends the session. |

The waiver draft link is gone. The Release and Waiver is published in the
**Terms & Conditions** tab on the public site, and booking now records that a
guest accepted it.

---

# Boat

## Maintenance

Service items per vessel against elapsed months or engine hours, plus engine-hour
readings and fuel fill-ups. Items flip to overdue automatically.

**Nothing here can judge anything until engine hours are logged.** Thirteen items
are configured against hour intervals and the panel will keep reporting "nothing
overdue" while it has no readings — which looks identical to a healthy fleet. Log
a reading after each outing from **On the dock** (see below); the intervals then
work on their own.

**Logging fuel writes the expense for you** — the one other place besides
completed bookings where the ledger fills itself in.

---

# What runs on its own

Nine scheduled tasks: eight named crew members and the standup that files their
status. **None of them post, spend or send anything to a guest without you.**
Only one acts outside the business at all.

They run in dependency order, so the summary comes after the things it
summarises:

| When | Who | What she does |
|---|---|---|
| Daily 8:19 | **Nauti Penny** · Accounts Receivable | Money in. Payouts against the ledger, and anything paid for that never ran. |
| Daily 8:38 | **Nauti Coral** · Content Producer | Drafts a post from real fleet photos, audits the queue, and checks what Siren actually published. |
| Daily 9:04 | **Nauti Siren** · Publishing & Brand Safety | The last gate before anything is public, then publishes what passes. |
| Mon 9:26 | **Nauti Joy** · Guest Relations | Who to ask for a review, and who was left hanging without one. |
| Mon 9:41 | **Nauti Reef** · Revenue Growth | Money the business is not collecting. |
| Mon 10:04 | **Nauti Shelly** · Accounts Payable | What is being paid for against what is actually used. |
| Mon 10:29 | **Nauti Nova** · Market Research | The outside world. Reports nothing most weeks, by design. |
| Daily 10:51 | Crew Standup | Files a one-screen status for all eight. |
| Daily 11:18 | **Nauti Pearl** · Chief of Staff | Reads everything, decides what reaches you. |

## Why some things still say "Jarvis"

The Jarvis tab was retired on 3 September 2026. Six of its seven panels had
become worse copies of what the Overview already showed; the seventh was the
media pipeline, which moved to **Marketing -> Media Drafts** where it belonged.
Speaking aloud moved to the **Enable Pearl** button in the top bar. Pearl is the
one you talk to now.

Nothing you can see says Jarvis any more. Four things under the floor still do,
and they were left alone deliberately:

| Still called | What it is | Why it stays |
|---|---|---|
| `JarvisTodo` | the database table behind The Board | renaming it means a migration against the live database to change a word |
| `JARVIS_SERVICE_KEY` / `x-jarvis-key` | how the crew scripts prove who they are | it is set in Vercel and in the secrets store; renaming means changing both in exact step or every agent stops being able to write |
| `/api/jarvis-todos` | the address The Board reads from | an address only has to be stable, not pretty |
| `Jarvis-Voice-UI` | the folder holding the crew scripts | hard-coded in fifteen scripts and nine agent briefs |

Same rule as the task folders below: **rename what people read, leave what
machines depend on.** If you see one of these in an error message, it is not a
leftover anyone forgot.

## Why the routines are named as they are

Six of the nine routines now carry their crew member's name in the sidebar —
`nauti-pearl`, `nauti-joy`, `nauti-reef`, `nauti-shelly`, `nauti-nova` and
`crew-standup`.

One deliberately does not: `nauti-siren`, which is Siren.

A task ID cannot be renamed — only deleted and recreated — and connector
approvals are stored **on the task**. Siren publishes through Blotato, so
recreating her throws that approval away and her next run stops, waiting for a
permission nobody is there to give. She is the one agent whose silence is
invisible until an event has already gone unannounced.

So she is renamed only just after a publish run, when nothing is due and a
**Run now** to bank the approval is a harmless no-op. Renaming her before one
either loses that morning's posts to a prompt, or fires them at whatever hour
you pressed the button.

Coral and Penny were renamed this way on 4 Sep 2026 — rename, **Run now**,
approve once. Their approvals are Blotato and Gmail respectively. **If a routine
ever starts skipping, a missing approval is the first thing to check.**


Two task folders are still named for their old cadence — `nauti-penny`
runs daily and `nauti-shelly` runs weekly. The names are historical and
were left alone on purpose: renaming a scheduled task means deleting and
recreating it, which loses its saved tool approvals. **The schedule above is
what is true.**

## Who checks whom

Everything routes through Pearl. Coral reports to Siren, and Siren reports to
Pearl. The one loop that runs backwards is Coral auditing what Siren actually
published the day before.

That loop exists because **Siren is the only agent that acts outside the
business.** Everyone else proposes, so a mistake costs a line on the board;
hers is live on three platforms. Joy, Reef and Nova are deliberately *not*
checked by anyone — putting a reviewer in front of an agent that only proposes
buys delay and no safety.

## The Board (To-do List)

The centre panel on Overview. It is the shared workspace between you and the
crew, not just your list — they write to it, read each other's items, and hand
work over by naming another agent in an item.

Items are ranked **High / Medium / Low**, not listed by date. Crew items carry
their own priority; the ones you typed yourself are ranked by what they say —
money being held, security, legal and overdue all go high. Anything falling due
within two days is promoted regardless of wording. Only High is expanded when
the page loads; Medium and Low fold open when you want them.

**Pearl keeps the board.** She closes what the data shows is done, folds
duplicates into the older entry, and rewrites anything Low that has sat
untouched. She never edits or closes an item you wrote unless it is genuinely
finished.

## Their status cards

Each agent files a status every morning **even on days she does not run**, so a
card is never blank. Each greets in her own voice — *"Morning, Captain"* from
Pearl, *"Books are open"* from Penny — and a card that shows a date instead
means she has not filed today.

A card reading **"Stopped mid-run"** means the run was killed partway, usually
by a permission prompt nobody was there to answer. Open Routines and hit **Run
now** to clear it.

## What none of them may do

Every brief forbids the same things, and the shared protocol overrides any
brief that disagrees:

- No agent writes to any table except the todo board and its own activity log.
- No agent contacts a guest.
- No agent spends, refunds or changes a price.
- No agent publishes except Siren, and only drafts you have already scheduled.

The full rulebook lives at
`C:\Users\immex\.claude\scheduled-tasks\_crew-protocol.md`. If a rule is not in
there, it is not a rule.

---

## Quick reference — where do I…

| I want to… | Go to |
|---|---|
| See a new website lead | Bookings → Inquiries |
| Log a Boatsetter/GetMyBoat charter | Bookings → Bookings |
| Record that a charter happened *(this logs the income too)* | Bookings → Bookings, set to completed |
| Block a day off | Bookings → Availability |
| Log a receipt | Money → Income & expenses |
| Check a charter's money is on the books | Money → Reconciliation |
| Pull tax numbers, or see per-charter and per-hour | Money → Tax Report |
| Add a photo to the public gallery | Marketing → Media |
| Approve or reschedule a social post | Marketing → Media Drafts |
| Ask a past guest for a Google review | **On the dock** → Reviews *(phone)* |
| Change a price | Setup → Packages & pricing |
| Log engine hours after an outing | **On the dock** → Engine hours *(phone)* |
| Log fuel, or set service intervals | Boat → Maintenance |

---

## Things that are easy to get wrong

- **A tab with no number is not empty.** The number means "waiting on you".
- **Two income rows on one Boatsetter charter is correct** — boat leg and captain
  fee.
- **The review "Text it" link does nothing on a desktop.** Use a phone.
- **A completed booking with no price gets no income row.** Fill the price in.
- **Filenames lie about dates.** A file named `19:43` may have been *saved* then
  and shot at midday. Trust the timestamp inside the file, not the name.
- **The Lake Bryan charters of 6 and 13 June 2026 are under NDA.** No media from
  those may be posted, ever.
