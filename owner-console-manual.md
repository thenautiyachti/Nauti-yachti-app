# The Nauti Yachti — Owner Console Manual

For anyone using the admin dashboard at **thenautiyachti.com/admin**. Ask the owner
for the passcode — it is not in this manual.

Last updated 17 September 2026.

---

## How the console is laid out

Six groups run along the top. Clicking a group reveals its tabs underneath.

| Group | Tabs |
|---|---|
| **Overview** | The day at a glance, the bank balance, the board, and the crew |
| **Bookings** | Contacts · Bookings · Availability |
| **Money** | Income & expenses · Reconciliation · Tax Report · Gift certificates · Subscriptions & bills |
| **Marketing** | Media · Media Drafts · Comments · Messages · Testimonials · Photo Requests |
| **Setup** | Packages & pricing · Add-ons · Coupons |
| **Boat** | Maintenance |

A number in brackets after a tab name means **something is waiting on you**. No
number means nothing needs doing — it does not mean the tab is empty. Testimonials
holds every approved review and still shows no number, because none of them need
a decision.

---

# Bookings

## Contacts

People, and how to reach them. This tab was called Inquiries and used to list
them; it no longer does, because **every reservation lives in Bookings** —
inquiry, booked or completed, whether it came from Boatsetter, GetMyBoat, the
website or a text message. A lead that showed in one place and not the other is
exactly how one went missing.

Three lists, all collapsed until you open them:

- **Everyone we can contact** — people, not trips, so a repeat guest appears
  once. The count is the ones with a phone or an email; anyone with neither
  cannot be asked for a review or told about a glow night.
- **Extra guest contacts** — people who were on somebody else's charter and
  whose number is worth keeping. Deliberately not counted as inquiries.
- **Crew list** — emails captured from `/glow` and the on-boat QR code. This is
  the list to mail when a date is set. **Copy mailable emails** sits on the
  header so you do not have to open the panel to use it. To honour an
  unsubscribe set that person's status to lapsed and they drop out of the copy.

**The two lower panels are subsets of the top one, not additions to it.** Their
headings say so — *"2 of the 30 above"* — because the obvious arithmetic is
wrong: the contacts list already folds in crew-list signups and extra contacts,
and dedupes a person to one row however many lists they appear on. Adding 30 and
2 and 2 counts four people twice.

## Bookings

Every charter, from any source — Boatsetter, GetMyBoat, the website, cash, Zelle.
Add one with the form above the table.

### Three questions, three fields

These used to be one and a half fields, and the books paid for it. Each booking
now answers them separately, and they are genuinely different questions:

| field | the question | options |
|---|---|---|
| **Lead source** | Where did the enquiry come from? | Website · Text / WhatsApp · Phone · Walk-up · Instagram · Facebook · Repeat guest · Referral from a friend · Boatsetter · GetMyBoat · AI search (ChatGPT) · Other |
| **Booking channel** | Who took and processed it? | Boatsetter · GetMyBoat · Website · Direct |
| **How paid** | How did the money actually arrive? | Unpaid · Stripe (card) · Cash · Cash App · Zelle · Venmo · PayPal · Boatsetter payout · GetMyBoat payout · Gift certificate |

A GetMyBoat booking can come from a guest who found us on Instagram. That is the
interesting fact, and until now there was nowhere to put it.

**"How paid" is the one the system cannot work out for itself.** Stripe paying is
the single exception — that gets set on its own. Everything else has to be said
by you, because nothing anywhere proves cash changed hands except you saying so.
Leave it blank and the income row says so rather than guessing.

That guess is why this exists. The booking channel used to be read as the payment
method — anything taken directly was assumed to be cash — so the first card
payment on a text booking would have been filed in the cash column, the hardest
one to reconcile and the easiest place to lose a number.

The old `Other` channel is now **Direct**, which is what those bookings always
were: ones we took ourselves, by text, on the phone or at the dock.

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

### One charter, two rows — and they now stay in step

A website checkout leaves **two** records for the same charter: the Inquiry the
guest filled in, and the mirror booking above that blocks the date on the
calendar. Nothing used to join their statuses.

So marking a charter **completed** used to leave its inquiry record still
reading **booked and paid** — which is what happened to Oscar RoblesGil's
6 September charter. He was the first website checkout to produce such a pair, which is the
only reason nobody had seen it; every one after him would have done the same.

Changing the status updates both records, in both directions. Since 11 Sep 2026
there is only one place to do it — the Bookings list — but the rule still matters,
because the two rows are what the calendar and the ledger each read. Platform
bookings — Boatsetter, GetMyBoat, cash — have no inquiry behind them and are
unaffected.

Either record completing writes the income row, by the same rule as above. That
was worth being careful about: without it, which screen you happened to use would
have decided whether a charter's money got recorded.

### The same inquiry sent twice

Sarah Griffith sent the same glow-night inquiry **three minutes apart** on
12 September. Nothing was wrong with the first one. The form simply reset itself
and flashed a message for two and a half seconds, so thirty seconds later her
screen looked exactly like a form she had never filled in — and she filled it in
again. You got two rows and she got two acknowledgement emails for one charter.

Two separate things now stop that.

**The website confirms it on screen and leaves it there.** The form is replaced
by a panel that reads back what she asked for — charter, boat, date, guests,
quoted price — says where her confirmation email is going, and says plainly that
there is nothing else to do and no need to send it again. It does not time out.
There is a *Send another inquiry* button for anyone who genuinely wants a second.

**And the site refuses to write the duplicate anyway.** The panel only helps
somebody whose browser still has the page; a second tab, a phone after a laptop,
or a form reloaded later never sees it. So a submission that matches an inquiry
already sitting in the console is folded into that one instead of making a new row.

| | |
|---|---|
| Counts as the same inquiry | same email address, same requested date, same package, **same boat** |
| Within | 30 minutes of the first one |
| Only if | you have not touched the first one yet — it is still **new** |

Party size, phone number and message are deliberately **not** part of that test,
because those are exactly what somebody corrects on a second try, and a
correction is still the same charter.

**The boat is part of it, though, and that is the interesting one.** A group too
big for one deck books *two* — same person, same date, same package, two
vessels, very plausibly half an hour apart while they count heads. Leaving the
boat out of the test meant the second inquiry was folded into the first and the
different vessel filed as a "corrected boat": not a duplicate prevented, half a
booking gone. Including it costs the opposite case — somebody who changes their
mind about the boat and resubmits gets a second row, which is the old behaviour
and one click to delete. Those two are not comparable, so the tie goes to never
losing the booking.

The 30 minutes is not a guess at how fast people double-click — it is how long
"I am trying to book this one charter" lasts as a single sitting. Someone who
fills the form, goes to check a date with a friend and comes back twenty minutes
later is on the same errand. It is deliberately not a whole day: two inquiries
for the same date a week apart are worth seeing separately, because by then
something has changed.

**What you get told.** Nothing, if they changed nothing — a double-click is not
news, and the email you already have is still correct. If they *did* change
something, the row is updated to the newer details and you get one email whose
subject begins **"Updated inquiry"** and whose first line says
*NOT A NEW INQUIRY* and names what changed. The guest gets no second
acknowledgement either way: a second email about one charter is what causes the
"do I have two bookings?" phone call this exists to prevent.

**Three things it will not do.** It will not merge two inquiries from the same
person for *different* dates, *different* packages or *different* boats. It will not touch an
inquiry you have already booked, lapsed or cancelled — if somebody asks again
after a cancellation, that is new intent and gets its own row. And an inquiry
with **no date** is never deduplicated, because there is nothing to identify it
by, and wrongly merging two "someday" inquiries loses a real lead — which is
much worse than a duplicate you delete.

## Where they came from, and how they paid

**These are two different questions and the books used to answer them in one
column.** A guest can find you on Instagram and hand you cash. They can come
through the website and pay by Venmo. Boatsetter and GetMyBoat always pay the
same way — a payout straight to the bank — but everything else is free to
combine however it likes.

| | Says | Lives on |
|---|---|---|
| **Lead source** | where the guest came from | the booking |
| **How paid** | how the money arrived | the booking |
| **Ledger origin** | how the money arrived | each income or expense row |

The ledger's origin had been doing both jobs, so income was filed under
**Instagram** ($775), **Friends** ($928.06), **Yolo Lake Conroe** ($2,400) and
**Website** — none of which is a way of paying. Worse, the income dropdown
offered only sources, so there was *literally no way* to record that a charter
was paid in cash. Both dropdowns are now built from the payment-method list, so
one cannot gain an option the other lacks.

Corrected 13 September 2026, across 24 rows. Totals did not move — this changed
what the money is filed under, never how much of it there is.

**Cash App is not Cash.** It leaves a statement that can be reconciled and can
charge a fee; cash in a hand does neither, and the whole point of the field is
telling those apart. It files to the ledger as *Cash App Statement*, the
spelling your expense rows already used.

**One charter can be paid two ways.** Rheya Palmer bought two hours by card and
topped up to three by Venmo; Nagdy's extra hour came by Zelle on top of a
Boatsetter payout. The booking's *How paid* holds the principal method and each
actual payment is its own ledger row, so the books can still say how every
dollar arrived.

**One thing spelled two ways is two things.** The expense side carried
"Gmail" and "Gmail Statement" for the same email receipts, and "T-Mobile"
and "Tmobile Statement" for the same phone bill — four totals split in half,
with neither figure the real one. Merged 13 September 2026; the totals did not
move, because renaming money never should.

Two origins were carrying a *detail* rather than a method — which bank a Venmo
came out of, who the cash went to. Those moved into the note, where they are
still readable, instead of splitting a total.

The morning check now watches for both faults: an origin the console cannot
display (which would silently refile a row the next time you edited it) and the
same origin spelled more than one way.

### When somebody tries to pay and it does not work

Sarah Griffith tried to pay $100 for two glow seats at **10:47pm on 12
September** and her bank declined it for insufficient funds. Her row read
**new / unpaid** — true, and exactly what it read before she ever opened the
link. The webhook only listened for success, so the attempt existed nowhere but
in Stripe's own dashboard. It was found because you went and looked.

A guest who tried and was stopped by her bank needs *"your seats are still
there, try another card"*. A guest who never opened the link needs a nudge.
Those are opposite messages, and until now both looked the same on screen.

So a declined payment is now recorded on the booking and shows in the Bookings
list as **⚠ TRIED TO PAY — DECLINED**, with the reason and the time on hover.
You also get one email naming what to say.

**Nothing is sent to the guest automatically.** Stripe already told them on the
spot, in their bank's own words, and an automatic second message from us an hour
later only causes the phone call. What you get instead is a **Text** button on
the row, which opens your own messaging app with the words already written — you
send it, from your phone, when you choose to.

That text leads with *your spot is still held* and **never says why the card was
declined**. We know the reason and the guest does not need it from us; "your
bank said insufficient funds" is a humiliating thing to receive from a boat
company, and it is their bank's business, not ours.

Every guest text now ends by saying a real person is on the other end and they
can reply — because they can, and a number that looks automated gets no answer
when you actually need one.

**Nothing is cancelled and no seat is released.** A Stripe checkout link stays
open for 24 hours, so most of the time the link they already have still works —
the email tells you whether it does, by its real expiry rather than by
assumption. Cancelling on a decline would turn a retryable moment into a lost
booking.

**It says when the fault is ours.** An expired API key or an amount Stripe will
not take is not something a guest can retry their way out of, and that email
arrives as **PAYMENT BROKEN OUR END** instead. An unrecognised decline code is
passed through in Stripe's own words and flagged as not understood rather than
being softened into "their card didn't work" — which could otherwise hide a
fault of ours while somebody sits there unable to pay.

The badge clears itself the moment a payment succeeds, so a paid booking never
wears an old decline.

## A charter that was paid for and never happened

Weather, a breakdown, a guest who cannot make it. They have paid, the day is gone,
and no new date has been agreed. That booking is **owed** — a status added on
5 September 2026 because there was no honest word for it.

It is not *cancelled*. Cancelled means money went out or is going out and the
relationship is finished. Owed means the opposite: their money is still here, they
still want to go, and the business owes them a boat. Christian Gehring sat marked
cancelled for two months for want of this distinction, and nothing ever put him on
a list.

What the status changes:

- **It does not hold the day.** An owed charter has no date, so it blocks nothing
  on the availability calendar. This is the one status where a real booking with
  real money behind it occupies no day at all.
- **It counts as active.** It shows under the Active filter on the bookings table,
  in amber, because it is work outstanding rather than history.
- **It is not a cancellation** in any count, so conversion figures stop being
  wrong in the business's favour.
- **Pearl reports it every morning** until it is settled. If there is no phone or
  email on the row she raises it as urgent, because a charter that cannot be
  rescheduled is money owed forever.
- **Money can still be attached to it** in the ledger. The payment is real.

When they pick a date, set it back to **booked**. Owed is a waiting room, not a
destination. The standing rule when you contact them is to offer a weekend, not a
refund — if they want the money back they will ask.

### Where to see them: Overview → Guests → "Charters we owe"

Each one shows the guest, what you are holding, how long it has been, and which
boat. Three buttons:

- **Text it** — opens your phone's messaging app with the message already
  written. On a desktop it says *"phone only"* and refuses, because a desktop has
  nothing to hand an `sms:` link to and a message you think you sent is worse
  than one you know you didn't.
- **Preview** — shows the exact wording, with **Copy** underneath for sending it
  another way.
- **Email** — only appears when there is an email on file.

The wording is not editable, on purpose. None of the drafts mention a refund and
none of them apologise at length, because opening with *"do you want your money
back?"* invites the answer that ends the relationship when what the guest wanted
was to go boating.

The section is **not there at all** when nobody is owed. That is the normal state.

## When a charter's money can't be found

The Overview also says *"N income rows are not tied to a charter."* That is not
the same as money going missing, and the difference matters more than the number:

- **Unlinked** — the money is on the books, but nothing joins it to the charter,
  so anything asked from the booking's side answers "no money". **Fix the link.
  Do not add a row.**
- **Missing** — nothing in the ledger matches it at all. Find out what happened,
  then write one.

Adding an income row for money that was already recorded **doubles it on your tax
report**. Christian Gehring's $520 looked missing for exactly this reason: the
Zelle row had been there since 9 June and simply wasn't tied to his booking.

Pearl's morning check now reports this, and says which of the two it is rather
than leaving you to guess. Some unlinked income is perfectly correct and always
will be — the May 2026 Glow Party seats are real income with no booking to attach
to.

## Booking numbers never change

Every booking is `NY-YYYYMMDD-NN`. The date inside it is the date the charter was
**first booked for**, not where it ended up, and the `NN` is just the order it was
taken that day.

So when a charter is rescheduled, **the booking number stays exactly as it is** and
the date column moves instead. That is deliberate: the number is what a guest
quotes on the phone, what the ledger points at, and what an old email says. A
number that moves is a number that stops matching the paperwork.

There was one exception, made once, on 5 September 2026: `NY-20260711-GEHRING` was
written by hand and ended in a surname instead of a number. It became
`NY-20260711-02`, with its ledger entries moved in the same transaction. That was a
one-off correction to an id that never conformed — not a precedent.

## Availability

Block days per vessel. A day with bookings that do not fill it shows as partially
booked, calculated from the summed hours of that day's charters.

**A partly-booked day now says *when* it is taken.** A guest complained on
8 September 2026 that clicking a date told him it was partially booked and
nothing more — which hid the one fact that decides whether he can still come.
The day now reads its windows: `7–11pm`, `10am–2pm`.

The information was always there; the calendar was throwing it away and keeping
only the total hours, because all it needed to answer was whether the day was
full.

A booking with no start time on record is left out rather than guessed at.
Twelve of the forty-two are like that — mostly older ones taken by text — and an
invented window would be worse than a vague one, because a wrong time is
something a guest will act on.

**A booking you confirm by text now blocks its date.** Until 5 September 2026 the
public calendar only knew about charters paid for by card, because the Stripe
webhook was the only thing that wrote a diary entry. Anything you took over the
phone and marked **booked** left the day still on sale — you could have sold it
twice. Marking an inquiry booked is now enough.

Nothing else changed: an inquiry still blocks nothing, and a charter paid by card
is counted once rather than twice even though it exists in both lists.

---

# Money

## Income & expenses

Every dollar in or out. The form on the left adds an entry: Income or Expense, a
category, an amount, a date, and for income the origin it came from. Linking an
entry to a booking makes it appear in that booking's profit.

Below the list: breakdowns by category, profit per booking, and commission lost to
the platforms.

## What is actually in the bank

The ledger answers *did we make money*. It does not answer *will Thursday's bill
clear*, and those are genuinely different questions — on 31 August 2026 the
season was in profit while the business account sat at **minus $11.36** with two
rejected Optimum payments against it.

So the Money card on the Overview now opens with the account balance.

**It is a reading, not a live figure.** Nothing here is connected to Woodforest.
Somebody reads the app and records what it said, with the date it said it. The
age is shown beside the number for exactly that reason — `today`, `1d ago` — and
past a week it turns amber, because a stale balance read as current is worse
than no balance at all. The colour of the figure itself is the money: green,
amber below $250, red if it is negative.

**Readings are never edited.** A figure that was wrong is corrected by recording
a newer one; the old reading stays. That is the whole reason for keeping
readings rather than one number that gets overwritten — the 31 August overdraft
is only visible because it was kept, and a balance history that begins at a
healthy number hides the month that went wrong.

Two are on file, both taken from the same screenshot on 16 September 2026:

| As of | Balance | |
|---|---|---|
| 16 September 2026 | **$934.30** | after the $824.70 transfer in on the 14th, and the $45.32 Optimum payment out the same day |
| 31 August 2026 | **−$11.36** | overdrawn. A $12.00 service charge took it under; the Optimum payment had been rejected twice, on 12 and 18 August, and did not clear until 14 September |

### Wells Fargo is being retired

Your decision, 16 September 2026: **the business pays from Woodforest now.**

Filing an expense against *Wells Fargo Statement* dated on or after that day
raises a warning under the origin dropdown. It does **not** stop you. If the
money really did come out of Wells Fargo, file it truthfully — the warning's job
is to remind you to go and move whatever is still charging that account.

Rows dated before the cutover are ordinary history and say nothing. There are
171 of them going back to June 2025 and every one is correct.

**The morning check watches the same thing from the other side.** The warning
only covers rows you file by hand. A statement import, an agent recording a
cost, or an autopay you have forgotten is still pointed at the old account never
touches that form — and those are the ones that matter, because nobody chose
them. The check reports and does not block: moving direct debits takes weeks,
and a checker that shouted about a cable bill would be turned off by Thursday.

As of 16 September nothing has been paid from Wells Fargo since the decision.
The newest row on it is 25 August.

## Reconciliation

Answers one question per booking — is this charter's money actually on the books?
Matching is on the real foreign key between a booking and its ledger rows, not on
date and amount.

**Boatsetter pays in two legs**, the boat and the captain fee, often days apart.
Two income rows against one charter is normal, not a duplicate.

## Tax Report

Pick a year for totals, a CSV export, and breakdowns.

**Money held for a charter that never ran is not counted as income**, in this
report or in "Season in" on the Overview. It is a deposit against a trip that has
not happened — if the guest asks for it back, it goes back — so it becomes income
in the year the charter actually sails.

It is never just removed. Both places name the excluded amount, because your bank
statement will show that money arriving and the two figures have to be
reconcilable. The Overview shows it as **"Held, not earned"**; the Tax Report
shows an amber note above the totals saying how much and why. Anyone marked
**Owed** in Bookings is where it comes from.

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

## Subscriptions & bills

Every recurring cost the business carries, normalised to a monthly figure so
weekly, monthly and yearly items can be summed.

It used to hold software and boat storage only. On 13 September 2026 the
household accounts moved in beside them — electricity, gas, water, sewer, trash,
phone, internet, storage — because the office is at home and a bill you never
recorded is a deduction you never claimed. Bringing them in recovered
**$2,451.56** of payments that had been made and never entered anywhere.

### The four columns that decide what a bill is worth

**Where** — which address it belongs to. The move in April 2026 means most
services have one account at each, and several of the old ones ran on for
months afterwards. Two live accounts with the same supplier usually means the
old one was never closed, and the tab says so out loud when it sees one.

**Amount** — and **blank is not zero**. Blank means nobody has found out what it
costs yet; `0` means it is confirmed free. The two look identical in a total and
mean opposite things, so they are stored differently and shown differently: a
blank amount is listed by name under the totals as an open question, and adds
nothing until somebody answers it. Supabase and Vercel really are free. Microsoft
and ElevenLabs simply have not been looked up.

**Business %** — how much of that bill is the business's, and **blank means
nobody has decided**. It is not zero. A bill with no share set stays out of the
deductible total entirely rather than being guessed at in either direction.

**Ended** — the date the account closed. Setting it is what closes an account;
`Active` follows it automatically, so a closed bill can never keep counting
toward the monthly total because two fields disagreed.

### The two totals, and why they differ

The first is what leaves the bank every month. The second is **the business's
share of it** — the only figure that belongs on a tax return.

Boat storage and software are 100%. Whole-home utilities are a proportion: the
office is a 10 × 10 room in a 1,900 sq ft home, which by floor area is **5.26%**.
You chose to claim **10%**. Both numbers are written into every bill's note on
purpose, because a percentage in a tax record is only worth the basis somebody
can point at a year later, and an accountant should see the measurement as well
as the figure claimed.

Three bills are not apportioned by floor area, because floor area is the wrong
test for them: T-Mobile (a business account in the LLC's name, 13 lines),
Optimum and AT&T. Those are set to 100% on your instruction. The note on each
records that the 100% is your account of how the line is used and is not
something the bill itself establishes — which is exactly what an accountant will
ask about first.

### Personal subscriptions, and why they are here at all

Netflix, Hulu, Spotify, Xbox Game Pass, the car note, renters insurance. You
wanted one place to see everything you pay for monthly so duplicates and waste
could be found across the lot — and the very first look found two identical
Google One subscriptions on two different Google accounts.

**They are counted nowhere near the business.** Not at 0%, which would still put
Netflix inside the monthly cost and merely leave it out of the deductible half.
The split happens before any arithmetic: personal rows have their own line with
their own total, they never enter the business figures, and they are stripped out
of the subscriptions CSV that the Tax Report exports for a bookkeeper.

The **Side** button on each row moves a bill between the two. It is a button
rather than a fixed property because the answer can genuinely change — Meta One
Advanced looked personal until its billing screen showed it subscribed to The
Nauti Yachti page, at which point it was a marketing cost.

### Grouped, and folded shut

Thirty-odd rows in one run is a wall, not a list. Bills sit under their category
— Utilities, Storage, Software, Hosting, Other, then Personal last — and every
heading carries that group's own count, monthly total, business share, how many
have no amount yet and how many are closed.

**Groups start closed.** Click a heading to open it. Inside a group the biggest
bill sorts first, because that is the one worth arguing about, and anything
unpriced sinks to the bottom where it reads as a question rather than as a cheap
item.

### The calendar

A total says how much. It does not say how much *this week*, which is the
question you actually ask when deciding whether something can be paid now. The
calendar draws the month, with each bill on the day it lands.

**It will not pretend.** Only the bills whose due date came off a receipt are on
it; the rest are named underneath as bills it cannot place. An empty Tuesday has
to mean nothing is due on Tuesday, not that nobody has looked. A monthly bill
repeats on its day and is drawn every month; a yearly one appears only in the
month it actually falls, because spreading Peacock across twelve squares would
turn one $79.99 charge into an imagined $960.

It earns its place immediately: Blotato, Claude Max and ElevenLabs all fall due
on the 28th — $159.53 in one morning, which no list sorted by name would show
you.

### On a phone

The table stacks into one card per bill, each row labelled by the column it
lost. Nothing scrolls sideways, and the calendar scrolls inside its own box
rather than widening the page.

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

### On a card

- The photo or clip it goes out with, or **No media attached** with a link to
  add one. Instagram and TikTok refuse a post without one, so a scheduled card
  showing that warning will fail on the day.
- The caption in full, so you are approving the words against the picture.
- The platform and when it goes out.
- **I posted it myself** · **Don't post**

Posted, denied and past drafts sit in a collapsed group above the days —
a record, not a to-do list.

### What goes out on its own, and what does not

**A post marked SCHEDULED will publish by itself.** Siren runs each morning and
puts out whatever is due that day. Giving a draft a date *is* the permission to
post it, so she does not ask again — there is no second confirmation, and no
message the morning it happens.

**Approving a post that already has a date is the same permission.** Siren puts
those on the schedule herself at the start of each run, then publishes them when
their time comes. You do not have to press anything a second time.

That was not always true, and it cost a post. On 12 September 2026 the Facebook
copy of a Boatz & Glowz post went out at its 10:30 slot and the Instagram and
TikTok copies of the same post did not — identical date, identical time, and
those two were sitting at APPROVED rather than SCHEDULED. Nothing errored and
nothing logged it; it was spotted by looking at the feed.

Permission still stops there. Nothing else is ever published: not a draft Coral
has proposed, not one you have approved **without a date**, and not one you have
rejected.

So the queue is safe to leave alone **until a post's date arrives**. Up to that
morning you have as long as you like to read it. Once the date is today, the
next thing to touch it is Siren.

To stop one, press **Don't post**. That is the only thing that takes it out of
her way.

### Saying what is wrong with a post

**Discuss** is on every card, at every stage — including after it is scheduled,
which is exactly when "not that clip" tends to get noticed. It replaced
**Preview** on 8 September 2026, which showed the caption and the media a second
time underneath the ones already on the card, and so cost a click to learn
nothing.

Pick what is wrong from the list, then say whether the post survives it:

| Reason | Means |
|---|---|
| **Wrong photo or clip** | It does not match the post — wrong guest, wrong trip, wrong thing happening |
| **Find a better one** | Right footage, weak shot. There is better in the same folder |
| **Caption needs work** | Wording, tone, hashtags or a wrong detail |
| **Wrong day or time** | Right post, wrong slot |
| **Too similar to another post** | Same clip, angle or message as something already queued |
| **Guest or privacy problem** | Someone in it should not be, or it names the wrong guest |
| **Not right for us** | Wrong message for the business, whatever the media |
| **Something else** | Say what in the note |

**Wrong photo or clip** and **Find a better one** are deliberately separate.
Wrong means find the *right* one, and sends whoever picks the replacement to a
different folder; better means find a *stronger* one, usually from the same
shoot. Both offer **Swap the media now** so you can replace it without leaving
the card.

Then either:

- **Keep it — send back for changes.** The post stays in the queue and moves to
  *Needs work*.
- **Don't post it at all.** It moves to *Rejected*.

**Neither of these deletes anything.** Rejected is not gone: **Back to review**
brings it straight back. Deleting is a separate button that only appears on a
rejected card, behind a confirm. The note is optional — "wrong clip" is already
a complete answer.

### Why the reason is a fixed list

A rejected post used to record nothing at all. It vanished from the queue and
the reason lived only in your head, so the same mistake could be proposed again
the following week and nothing could count how often that happened.

The list is short and fixed because the point is counting. *"Six of the last ten
were killed for the wrong clip"* is a fact that changes what Coral does next
week; ten sentences roughly saying that are not. The free-text note still
exists — the two are written together, and both show on the card afterwards,
including on rejected posts, so a post you killed still says why when you come
back to it.

### "I posted it myself"

This button used to say **Mark posted**, which did not explain when to use it.
For anything Siren publishes you never touch it — she marks her own as posted
and records the live URL. It is only for posts that go out by hand, which is
still most of TikTok.

### What each account will actually take

| | photo | video |
|---|---|---|
| **Facebook** | yes | yes — publishes as a **Reel** |
| **Instagram** | **no** | yes |
| **TikTok** | **no** | yes |

**A still cannot be published to Instagram or TikTok at all.** The publisher
reaches Instagram only as reels and stories, and both need video. Siren treats
an Instagram or TikTok draft with a still as blocked: she will not attempt it,
and reports it instead.

So a photo-only post can go to Facebook, and if you want it on the other two it
has to be posted by hand from your phone. Facebook takes either, freely.

### Every Instagram post tags your personal account

Instagram posts carry a **Collaborator** tag on `austinhefty` and
`brookeashley_05_`. A collab is not a repost: Instagram puts the one post on all
three profiles' feeds and grids, and the likes and comments pool rather than
splitting across separate copies.

You each get a notification to accept, once per post. Nothing fails if you don't
— the post publishes to the business account regardless and simply doesn't appear
on your profile.

Instagram caps this at **three** collaborators, so there is room for one more.
The list lives in `lib/socialPosting.js`, not in an agent's brief, so it cannot
be forgotten on a run.

**There is no equivalent on the other platforms, and there cannot be.** Meta
removed the ability for apps to post to personal Facebook profiles in 2018, and
TikTok's API writes only to the authorised account. Snapchat has no organic
posting API at all and is not a platform the publisher supports. On those three,
sharing to your own Story is a manual tap — and worth doing, because your Story
reaches local friends who might book or refer.

### Five hashtags, never six

Blotato rejects an Instagram post with more than five: *"Instagram allows a
maximum of 5 hashtags per post."* It does not trim, warn or retry — the draft
stays marked **scheduled** and looks perfectly healthy.

The sober-captains video failed this way on 4 September 2026 and again on the
5th with the caption untouched. On the 8th an audit found **seventeen of
twenty-one** Instagram drafts over the limit at once — the better part of a
fortnight of Instagram silently not posting, with nothing to say so until each
day came and went.

The limit is now applied to every platform, because nothing this business has
ever published carried more than five on any account, and a dropped generic
hashtag costs less than a post that never goes out. `drafts.js --check` reports
any caption over five as **T1**.

### Where a clip came from

Every draft cut since 8 September 2026 records its source in the photo hint —
which charter folder, which file, which second of it.

That exists because of a real confusion: a night-cruise clip was read as coming
from one guest's folder when it was another's, and nothing on the card said
otherwise. Older drafts whose media predates this are left blank rather than
guessed at.

### Approved with no date

An approved post with no date **will never go out**, and that is the one gap
still left on purpose. Approved with a date means "yes, and then" — Siren
schedules those herself. Approved with NO date means you have said yes but not
when, and nothing invents a date for you.

Coral now proposes a date for each of these in her daily status, and raises one
as a board item if it has been waiting more than three days. The Overview also
flags them under **Needs attention**. Set the date with **Reschedule**.

## Comments

The queue of comments nobody has answered, from Facebook and Instagram.

It exists because of one day. On 6 September 2026 a Boatz & Glowz post drew four
comments challenging the operation — liability, life jackets, drink-driving,
litter on the shoreline — and the first sat **twenty-three hours** before anyone
saw it. The people reading a thread like that are the ones who never comment, and
an unanswered accusation reads as conceded.

A thread is colour-coded by how long it has waited: **fresh** under six hours,
**waiting** past six, **overdue** past twenty-four.

**Nothing here posts on its own.** Siren writes a suggested reply and it sits in
the box; you can send it, edit it, or empty the box and write your own. A reply
is public, immediate and attributed to the business — every other agent in this
system proposes and you decide, and a comment thread composed in response to
something hostile is the last place to break that.

**TikTok comments are not here**, because the publishing API does not expose
them. They remain a manual job in the TikTok app. Saying otherwise would leave
you believing a channel was covered while nothing was watching it.

---

## Messages

The direct-message inbox, from Facebook and Instagram.

**Nothing read these before it existed.** There was a comments tab and no
messages tab, and not one of the scheduled crew had DMs in their brief — so a
message arrived, sat there, and there was no point at which anybody found out.

The first look at the real data found two unread messages from 7 September, a
day and a half old, from the man who had posted publicly about litter on the
shoreline. He was offering two of his own boats to help clean up after the glow
party.

It is built to the same shape as Comments on purpose. They answer the same
question on different channels, and two panels that disagreed about what
"waiting" means would be worse than one.

**This is no longer true of sending, and that changed on 17 September 2026.**
Nothing YOU see here sends on its own — but most DMs are answered by an
automatic reply seconds after they arrive, before this tab is ever opened. See
*Messages answer themselves* below.

---

### Messages answer themselves. Comments do not.

Your decision, 17 September 2026, and it is the one place in this system where
something goes out without you reading it first — so it is worth knowing exactly
how far that goes.

**The difference is the size of the audience.** A comment is published under the
business's name to everyone reading the thread. A DM goes to one person and can
be corrected in the next sentence. Speed is worth more in an inbox; caution is
worth more in a thread.

**No agent sends any of it.** The automatic reply is a Blotato automation, which
is a platform feature rather than a crew member. Nothing Siren or anyone else
runs sends a message to a person — that rule is intact.

**What actually goes out.** Within seconds of a DM arriving, on any platform, at
any hour:

> Thanks for the message 🤙
>
> Easiest way to get you sorted is a text — drop your number here and we'll send
> you dates, prices and a link to lock it in.
>
> Or have a look at the site below. A real person reads these, so ask away.
>
> — The Nauti Yachti

It asks for the number because a number turns a DM into a text thread, and the
pay link goes by text. It is a fixed string: **it never quotes a price, a date
or a seat count**, because it cannot know any of them.

**It fires on keywords, and the list was nearly useless.** It held thirteen
words — book, booking, price, prices, pricing, cost, available, availability,
rent, rental, glow, tube, tubing. On 17 September a guest wrote *"Hey bub, you
got any seats open for Saturday?"* and matched **none of them**: the single most
common question this business gets, missed by one word. He sat for two hours and
was found by eye, not by the system. It now holds forty, including seat, spot,
room, space, open, the days of the week, "how much" and "what time".

**The hazard, and what watches it.** A keyword match is blind. *"Your prices are
a scam and I want a refund"* contains `price`, so the machine sends that person
the packages link. Nothing stops it — the automation cannot read.

So every waiting thread is now checked against a set of rules after the fact,
and the Messages tab flags any the machine answered that it should not have, in
red: **"Answered automatically, and should not have been"**, with the reason.
Read what went out before you reply to one of those.

**What is never the machine's to answer** — these always come to you, and they
are the reasons you will see on a card:

| Held because | Meaning |
|---|---|
| **safety** | someone may have been hurt, or something was damaged |
| **legal** | lawyers, insurance, liability, a refund or a chargeback |
| **complaint** | it reads as a grievance |
| **money already moved** | it asks to change, refund or reschedule something paid for |
| **solicitation** | a pitch, not a guest |
| **NDA** | it touches the Lake Bryan charters |
| **photographs** | somebody's picture, or a request to take one down |

Plus three structural ones: anything over 320 characters, anything asking more
than two questions, and anything matching nothing the system can answer from its
own data. That last is the important default — **an unrecognised message is not
a safe message, it is a message nobody has understood.**

A price question wrapped in a complaint is treated as a complaint.

**Siren drafts the held ones.** Her reply appears in the box the same way it
does on Comments, with her name on it, and you send it or type over it. If they
write again before you get to it, the draft is marked stale and will not
pre-fill — an answer to a question that has been overtaken is worse than an
empty box.

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

## Testimonials

Reviews shown on the public site, plus the panel for **asking past guests for a
Google review**.

Neither booking platform hands over contact details, so every number was typed in
by hand — a guest with no number is a review that never gets asked for.

**Text it** opens your phone's messaging app with the message already written and
ticks the charter off. **It does nothing on a desktop** — this has to be done from
a phone.

---

## Photo Requests

Guests who asked for their photos and have not been sent them. The badge counts
what is still **owed**, not the total, so once the queue is clear it says
nothing.

**Longest wait first, deliberately not newest first.** The guest at the top is
the one most likely to have given up on us. The days-waiting figure beside each
name is counted in whole days from the day they asked.

**The link cannot be filled in from here.** The files are on your machine, not in
this database, so the button opens the message with the greeting already written
and leaves you to paste the album link — the whole job reduced to one tap and one
paste. Marking it sent is what clears it from the queue.

---

# Setup

## Packages & pricing

Per-package prices, per-guest rates, and the hourly grid per vessel for weekday
and weekend. Every change is logged to price history.

## Add-ons · Coupons

Extras that can be attached at checkout, and discount codes with optional expiry
and usage limits.

**What comes free with what, and what is charged:**

| Add-on | Price | Free with |
|---|---|---|
| Balloon Package | $40 | Birthday Party |
| Champagne on Ice | $25 | Bachelor / Bachelorette |
| Full Decoration Package | $60 | — *(contains the balloons and the champagne)* |
| Grill Service | $25 | Night Cruise |

The **Full Decoration Package is the other two plus table setup and themed
decor**. Bought separately the balloons and champagne come to $65, so the bundle
saves $5 — and a guest who ticks all three is charged $60, not $125. That is
enforced in code, not by remembering.

**Grill Service is the cooking only — the guest brings the food.** It is a small
electric grill, about two steaks at a time or four burgers at a time, and the
boat has to be at anchor, so allow twenty to thirty minutes. It can be added to
any charter; anchoring off mid-trip is normal.

**A charter with no stated occasion is a Tubing / Wakeboarding charter.** That is
the default, not a guess.

These rules live in `lib/addOns.js` and are the single source for the booking
form, the price quoted and the FAQ. Change them there, not in the copy, and run
`node scripts/test-addons.js` afterwards — 51 assertions cover the pricing.

---

# The top bar

| Button | What it is |
|---|---|
| **The version badge** | The version of the whole system, top left beside OWNER CONSOLE. The same number appears under the **Owner console** button on the public site. Both read it from `package.json`, so they cannot disagree with each other. See **Versions and going back** below. |
| **🔊 what Pearl last said** | Appears only when she has said something. The words are shown; the speaker button reads them aloud in her voice, and pressing it again stops her. The **×** dismisses that message — the next one brings the strip back. There used to be an **Enable Pearl** button here whose only job was to satisfy the browser's rule that audio needs a click first. Any click now does that, so it is gone. |
| **📱 On the dock** | The phone page: ask for reviews, log engine hours. Everything on it needs a phone — a text link has nothing to open on a desktop, and an hour reading is taken at the boat. Worth adding to your home screen. |
| **📖 Manual** | This document. |
| **← Back to site** | The public website. |
| **Log out** | Ends the session. |

The waiver draft link is gone. The Release and Waiver is published in the
**Terms & Conditions** tab on the public site, and booking now records that a
guest accepted it.

---

# A booking that came in by text

Most bookings do not arrive through the website. They arrive on WhatsApp, by
text, or on the phone — and that channel is the biggest and the worst tracked.
The 8 Aug 2025 charter was never written down at all and had to be reconstructed
from photographs a year later.

This is the route that stops it happening again.

1. **Send the message to Claude** — a screenshot is enough.
2. **It gets logged straight away** as an inquiry with a real reference
   (`NY-YYYYMMDD-NN`), before anything is promised. Availability, boat capacity
   and the price are checked against the live data, not from memory.
3. **You get a reply to send**, written for what that guest actually asked.
4. **If they say yes**, you get a link: `thenautiyachti.com/pay/<id>`. It shows
   them the charter on our own site and hands off to Stripe from there. Never
   paste a raw `checkout.stripe.com` link into a text — it looks exactly like a
   scam, and the more careful the customer the less likely they are to tap it.
5. **When they pay, the rest happens on its own:** the booking is marked paid,
   the calendar closes that day for that boat, and a confirmation goes to the
   guest with you copied in. A website inquiry also gets a booking row created
   at this point; a booking taken by text already is one, so nothing is
   duplicated.

## Doing it yourself, from the phone

From v2.4.0 you do not need to ask for the link. Open **Bookings** on your phone
and each row carries the text it needs:

- **Text payment link** — a lead with a price on it. Sends them their own
  `/pay/<id>`, already filled in.
- **Text to confirm** — a lead with no price yet. Asks them to confirm so you can
  price it and send the link after.
- **Text reminder** — a booking that is already paid. Day, departure time and
  where to meet. Boatz & Glowz says Scott's Ridge by name; every other charter
  meets wherever that one was arranged, so it stays general.
- **Text about owed** — a charter paid for that never sailed.

These only work on a phone. A desktop has nothing to hand an `sms:` link to, so
it tells you that rather than appearing to send.

**A lead only gets a payment link if its row has a package and a price.** That is
what the link charges for. A booking logged by text with neither falls back to
*Text to confirm* until you add them.

**The one gap to know about.** Between "yes" and "paid", nothing holds the date.
The calendar only closes on a real booking, so a second party could still take
that boat. If the charter is soon or the date is in demand, block it by hand in
**Bookings → Availability** and unblock it if they never pay.

## Capacity counts the captain

The vessel capacities INCLUDE the captain. The Nauti Yachti's 12 seats **11
guests**. A party of 12 needs the Explorer. This is the easiest thing on the
whole site to get wrong when quoting quickly.

## If a payment and the console ever disagree

A guest says they paid and the booking still reads unpaid — ask Claude to resync
it. That re-reads Stripe's own record and repairs whatever is missing. It only
ever copies from Stripe, so it cannot invent a payment that did not happen.

---

# Versions and going back

The number beside OWNER CONSOLE says which release you are looking at. It exists
for one moment: something is wrong and you need to know what to go back to.

## What earns a new number

**The crew doing their job is not a revision.** Coral drafting posts, Siren
publishing, Pearl filing a brief, a booking landing, a photograph being tagged —
none of that moves the version. That is the system running, not changing.

| Size | Moves | What it means |
|---|---|---|
| **Small** | 1.5.0 → **1.5.1** | Formatting, wording, a colour, a label. Nothing behaves differently. |
| **Moderate** | 1.5.1 → **1.6.0** | The logic of an agent, or a workflow. A status meaning something new. |
| **Large** | 1.6.0 → **2.0.0** | A whole layout changed, or a completely new large-scale idea. |

Three numbers, always — `1.5.1`, never `1.5`. Unsure between two sizes? **Take
the smaller one.** A small change that turns out to have been moderate costs
nothing; a moderate one recorded as large makes the history lie about how much
moved, and the history is the entire point.

## Nobody cuts a release without asking you

A revision draws a line under a batch of work, and only you know where the batch
ends. The rule is to finish the work, say what changed, say what size it looks
like, and **ask** — because it was broken twice on the day it was written.

**This manual is re-read at every release.** Two checks stand behind that. One
compares the tab names in it against the tabs the console actually has, so a
rename can't quietly leave this document describing a screen that no longer
exists. The other records which version the manual was last read against, and
complains as soon as the code moves past it.

The second one exists because the first cannot do everything. On 13 September
this manual said *"The guest gets nothing"* about a declined payment. That was
true when it was written at one in the morning and false by six that evening,
when the Text button arrived — and no checker reads English for truth. A
sentence that quietly stops being true is caught by a person re-reading it, and
the release is the moment anyone reliably does.

## What you actually get

One `.zip` in `AI & Website/releases/`, and only ever the newest one: the crew
briefs, the protocol, the schedules, the permission rules, the hand-written
skills and the shared scripts — everything git does not version. Older *release
folders* are deleted; **every git tag is kept forever**, so the code for each
version is still on GitHub.

The skills were added on 14 September 2026 and had been missing the whole time.
They live in `.claude\skills`, a different folder from the crew's
`.claude\scheduled-tasks`, so nothing was picking them up — which meant
**`/watch`**, the tool that turns a video into timestamped frames and a
transcript, would simply not have existed after a restore, despite the whole
media pipeline being built on it. Skills synced down from claude.ai are skipped:
those are somebody else's copy and come back on their own.

## Where the files live, and why it is split

Two places, and the split is about what Google Drive can back up.

| | Where | Backed up by |
|---|---|---|
| **Business files** — Photos, Finance, Legal, releases, this manual | `Documents\_MyFiles\_The Nauti Yachti LLC` | **Google Drive**, which mirrors that folder |
| **The app** — code, dependencies, build output | `Documents\Nauti-yachti-app` | **GitHub**, off-machine and stronger for code |

**Drive cannot sync a working tree.** Until 15 September 2026 the app lived
inside the mirrored folder, and Drive had quietly given up on the whole thing
and marked it with a red X — 1.5 GB of build output and 755 MB of dependencies
were more than it would take. Nothing announced it. The folder looked normal
while nothing in it was being backed up, and it holds 53 GB of charter footage.

So the app moved to the local disk. **This is not a gap in your backups.** The
code is on GitHub, tagged at every version, which is better protection than
Drive gives it. Drive still holds everything git does not version — the photo
library, the finance records, the release zips, this manual.

**A checker enforces it now.** `check-consistency.js` walks the business folder
for `.git`, `node_modules`, `.next` and `.turbo`, and refuses to let a release
through if it finds any. It is deliberately about backup coverage rather than
correctness: the point is that nothing can drift back in unnoticed. It found
three stale pointers in old distributable test builds the day it was written.

One consequence worth knowing: a file that git ignores AND that lives on the
local disk is in no backup at all. There is one — `conf\token.txt`. Its
contents were exposed in a working session on 15 September 2026, and the file
now holds a note saying so rather than a token. **That credential still needs
rotating.** Nothing in the app or the crew scripts reads the file, so nothing
is broken by it sitting there — which is exactly why it would be forgotten.

`CHANGELOG.md` carries one entry per version, written to be read on a bad day.
If an entry cannot tell you whether to restore that version, it was not written
properly.

The full reasoning, including why this is deliberately **not** SemVer, is in
`AI & Website/VERSIONING.md`.

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
| Daily 9:04 | **Nauti Siren** · Publishing & Brand Safety | The last gate before anything is public, then publishes what passes. Drafts replies for unanswered comments and for the DMs the auto-reply held back. |
| Mon 9:26 | **Nauti Joy** · Guest Relations | Who to ask for a review, and who was left hanging without one. |
| Mon 9:41 | **Nauti Reef** · Revenue Growth | Money the business is not collecting. |
| Mon 10:04 | **Nauti Shelly** · Accounts Payable | What is being paid for against what is actually used. |
| Mon 10:29 | **Nauti Nova** · Market Research | The outside world. Reports nothing most weeks, by design. |
| Daily 10:51 | Crew Standup | Files a one-screen status for all eight. |
| Daily 11:18 | **Nauti Pearl** · Chief of Staff | Reads everything, decides what reaches you. |

## The email the site sends

Four things a guest can do on the website send mail, and **every one of them now
emails both the guest and you**. Three of the four used to be one-sided: an
inquiry and a crew-list signup told only you, and a gift certificate told only
the recipient — so a guest who typed their details into the form got silence,
and a certificate could be bought without the business hearing about it.

| What the guest did | They get | You get |
|---|---|---|
| Sent an inquiry | acknowledgement, "we'll come back to you personally" | CC of the same message |
| Paid for a charter | booking confirmation with the details | CC of the same message |
| Joined the crew list | welcome, with the unsubscribe line | CC of the same message |
| Bought a gift certificate | the certificate and how to redeem it | your own copy |

**You are CC'd on the guest's copy rather than sent a separate notification.**
That is deliberate, and it is a workaround. On 7 September a crew-list signup
was accepted by Resend, returned an ID, and never arrived — the business's own
sending domain silently stopped delivering while everything else kept working.
Being on the guest's copy means you see the message they actually got, and it
travels by the route that demonstrably works.

**`bookings@thenautiyachti.com` cannot receive mail.** The domain has no MX
record, so anything sent to it is accepted and evaporates. It is still fine as a
*from* address, and replies go to the Gmail address instead. This is unfixed —
if anything ever assumes a reply can reach that address, it will fail.

### How they sign off

Every one closes as **The Nauti Yachti LLC**, through a single setting, so the
four cannot drift apart. A templated email is sent by the business, and a first
name on it promises a named human is waiting at the other end of a reply.

The text messages are the opposite and stay that way: the review asks and the
owed-charter messages read **"Austin & Brooke"**, because you paste those into a
thread and send them from your own phone. The rule is who is really doing the
thing, not which channel it went down.

### Crew list

A phone number is now **required** to join. Corey signed up on 7 September with
no number, which left email as the only way to reach him about a seat.

Joy also reads the signups on every run and puts new names in her status,
because an email you cannot see fail is not a notification.

## Why some things still say "Jarvis"

The Jarvis tab was retired on 3 September 2026. Six of its seven panels had
become worse copies of what the Overview already showed; the seventh was the
media pipeline, which moved to **Marketing -> Media Drafts** where it belonged.
Speaking aloud moved to the top bar, where her last message appears with a
speaker on it. Pearl is the one you talk to now. (There was briefly an
**Enable Pearl** button; it is gone — see the top bar above.)

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

All eight now carry their crew member's name — `nauti-pearl`, `nauti-coral`,
`nauti-siren`, `nauti-joy`, `nauti-penny`, `nauti-reef`, `nauti-shelly` and
`nauti-nova`, alongside `crew-standup`. The renaming is finished; what follows is
why it had to be done carefully, and it still applies to any future one.

A task ID cannot be renamed — only deleted and recreated — and connector
approvals are stored **on the task**. Siren publishes through Blotato, so
recreating her throws that approval away and her next run stops, waiting for a
permission nobody is there to give. She is the one agent whose silence is
invisible until an event has already gone unannounced.

So she was renamed only just after a publish run, when nothing was due and a
**Run now** to bank the approval was a harmless no-op. Renaming her before one
either loses that morning's posts to a prompt, or fires them at whatever hour
you pressed the button.

Coral and Penny were renamed this way on 4 Sep 2026 — rename, **Run now**,
approve once. Their approvals are Blotato and Gmail respectively. **If a routine
ever starts skipping, a missing approval is the first thing to check.**

A folder name never tells you a cadence. `nauti-penny` runs daily and
`nauti-shelly` runs weekly, and nothing in either name says so. **The schedule
table above is what is true.**

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
card is never blank. A card that shows a date instead means she has not filed
today.

**Click her face to hear her read it.** The small speaker mark on an avatar
means she has something filed; clicking plays it in her own voice, clicking
again stops her, and clicking again starts her from the beginning. Clicking a
different agent stops whoever is talking first, so you never get two at once.
Hovering enlarges the face, which is only there so you can see it properly.

Nothing in the console ever speaks on its own. If you did not click it, it will
not make a sound.

**Each click costs a little money.** Speech is billed per character to
ElevenLabs — roughly 350 characters a click, and $10 buys about ten thousand.
Clicking the same unchanged status twice is free; it replays from memory rather
than being bought again.

A card reading **"Stopped mid-run"** means the run was killed partway, usually
by a permission prompt nobody was there to answer. Open Routines and hit **Run
now** to clear it.

### When a card says an agent failed and she did not

A card is a row in the activity log, and that row carries one of four values.
Three are what you would expect. The fourth is not a state at all:

| Value | Means |
|---|---|
| `running` | started and has not closed yet |
| `completed` | finished |
| `failed` | genuinely went wrong |
| `status` | **not a lifecycle state** — the daily status card the standup files for each agent, even on days she does not run |

`status` is why the table holds far more rows than there have been runs: eight
agents filing one card a day. They are correct and should never be "cleaned up".

**A card can report a failure that never happened.** On 14 September Nauti Joy's
card read failed for a day over a run that had succeeded four minutes earlier.
The cause was in how agents record themselves: the script read its arguments by
position, and the closing command passes an empty `""` for the title. PowerShell
silently drops an empty argument to a program, so every later value slid one
slot left and the status word landed in the title column.

Two things now stop it. The script refuses any status it does not recognise
rather than writing a row it cannot vouch for, and closing a row uses named
flags — `--status`, `--detail`, `--id` — so nothing has to survive being empty.

**So if a card says failed, read its detail before believing it.** A real
failure explains what went wrong. An artefact usually has a status word sitting
where the task title belongs, or says outright that it was a duplicate. Four
such rows existed and were repaired on 16 September 2026; one of them had also
had a genuine accounts-payable report overwritten on top of it, which was
recovered from the duplicate before that duplicate was deleted.

## The eight voices, and how each one writes

Every agent has her own voice and her own register, so you can tell who is
speaking without looking at the name.

| | Voice | How she writes |
|---|---|---|
| **Pearl** | Alice | Dry and unhurried. She tells you the thing you would rather not hear |
| **Coral** | Jessica | Keen, and hardest on her own work — she audits the queue she built |
| **Siren** | Charlotte | Flat and literal on purpose. She is the gate |
| **Joy** | Lily | Warm, and a little wounded on the guests' behalf |
| **Penny** | Matilda | Charming and teasing, openly proprietary about the books |
| **Reef** | Laura | The enthusiast. She is selling you an idea |
| **Shelly** | Sarah | Dry and sceptical — she asks why you pay for things you do not use |
| **Nova** | River | Sparse. She speaks rarely and it should feel like it cost her something |

**There is one hard limit on all of it: tone lives in the framing, never in the
finding.** Anything serious — money held for a charter that never ran, a booking
at risk, anything with a legal, insurance or safety edge — is said straight,
with no colour at all. That contrast is deliberate. A voice you enjoy, that goes
flat the instant something is genuinely wrong, is a voice you look up for.

Their statuses are also now written to be **heard**, not only skimmed: full
month names rather than "Sept", "4 September" rather than "9/4", "7pm" rather
than "19:00", and no raw database ids or file paths. A checker runs whenever any
of them files and warns her if she slips; it never blocks, because a badly
written status is still worth more than no status.

## What none of them may do

Every brief forbids the same things, and the shared protocol overrides any
brief that disagrees:

- No agent writes to any table except the todo board and its own activity log.
- No agent contacts a guest. (The automatic DM reply is a Blotato platform
  feature, not a crew member — see *Messages answer themselves*.)
- No agent spends, refunds or changes a price.
- No agent publishes except Siren, and only drafts you have already scheduled.

The full rulebook lives at
`C:\Users\immex\.claude\scheduled-tasks\_crew-protocol.md`. If a rule is not in
there, it is not a rule.

---

## Quick reference — where do I…

| I want to… | Go to |
|---|---|
| See a new lead, from anywhere | Bookings |
| Log a Boatsetter/GetMyBoat charter | Bookings → Bookings |
| Record that a charter happened *(this logs the income too)* | Bookings → Bookings, set to completed |
| Block a day off | Bookings → Availability |
| Log a receipt | Money → Income & expenses |
| Check a charter's money is on the books | Money → Reconciliation |
| Pull tax numbers, or see per-charter and per-hour | Money → Tax Report |
| Add a photo to the public gallery | Marketing → Media |
| Approve or reschedule a social post | Marketing → Media Drafts |
| Say what is wrong with a post, or stop one | Marketing → Media Drafts → **Discuss** |
| See when a partly-booked day is actually taken | Bookings → Availability |
| Reply to a Facebook or Instagram comment | Marketing → Comments |
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
- **`Party Cove / 2025-09-27` is footage from The Dam.** Mis-filed. The theme
  folder is the only thing that says where a clip was shot — the filenames are
  bare timestamps — so until it is moved, treat that date as The Dam. It had
  already become the opener and closer of a Party Cove compilation before you
  spotted it.
- **One glow clip is withdrawn for nudity:** `Boatz and Glowz / 2025-09-20 First
  run - promo event / 20250920_211850_303ad61a.mp4`. The whole clip, not just the
  part that was used, because it cannot be reviewed reliably at any size that
  makes screening practical.
- **"Don't post" does not delete.** It moves the draft to Rejected, and *Back to
  review* brings it back. Deleting is a separate button behind a confirm.
- **Six hashtags is a failed post, not a style note.** The publisher rejects it
  outright and the draft still looks scheduled. Five, on every platform.
- **A photo on Instagram or TikTok is untested.** Both accounts have only ever
  published video. Facebook takes either.
- **"I posted it myself" is only for posts you published by hand.** Siren marks
  her own and records the link.
- **`bookings@thenautiyachti.com` cannot receive mail.** Fine to send *from*,
  never somewhere to expect a reply.
- **A reply under a DM may not be yours.** Most are answered automatically
  within seconds. Do not read one as a conversation you have had.
- **A red flag on a message thread means a machine answered something it
  should not have.** Read what went out before you reply.
- **The bank balance is typed in, not fetched.** If it says `9d ago` in amber,
  nobody has looked in nine days and the figure is a guess with a date on it.
- **A Wells Fargo warning does not stop you filing the row.** File it if it is
  true. The thing to act on is whatever is still charging that account.
