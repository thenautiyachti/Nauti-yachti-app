# The Nauti Yachti — Owner Console Manual

For anyone using the admin dashboard at **thenautiyachti.com/admin**. Ask the owner
for the passcode — it is not in this manual.

Last updated 2 September 2026.

---

## How the console is laid out

Five groups run along the top. Clicking a group reveals its tabs underneath.

| Group | Tabs |
|---|---|
| **Bookings** | Inquiries · Bookings · Availability |
| **Money** | Income & expenses · Reconciliation · Tax Report · Subscriptions |
| **Marketing** | Media · Media Drafts · Testimonials |
| **Setup** | Packages & pricing · Add-ons · Coupons |
| **Boat** | Maintenance |

A number in brackets after a tab name means **something is waiting on you**. No
number means nothing needs doing — it does not mean the tab is empty. Testimonials
holds eight approved reviews and still shows no number, because none of them need
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

Social posts queued for review. **Nothing is ever posted automatically.**

Ordered by **when a post goes out**, soonest first. Anything whose moment has
passed — posted, denied, or dated in the past — sits in a collapsed group at the
top of the tab, newest first.

Buttons on a scheduled post:

- **Preview** — the caption as it will appear, with a copy button. Warns when
  there is no media, because Instagram and TikTok refuse a still.
- **Mark posted** · **Reschedule** · **Don't post**

A posted draft offers **Recall post** — remove it from the social account first;
this only records that it came down. A rejected one offers **Back to review** or
**Delete**.

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
| **⚡ Jarvis** | Sits beside the title. A mode you switch into, not an action. |
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

Four scheduled agents, none of which post or spend anything without a human:

| When | What it does |
|---|---|
| Daily | Executive review — reads the database and reports what needs attention |
| Daily | Media agent — drafts social posts into Media Drafts for review |
| Daily | Social publisher — publishes drafts already **approved** by a human |
| Weekly | Review reminder — emails the owner which guests to ask for a Google review |
| Weekly | Booking audit — reads Boatsetter/GetMyBoat email and reports anything missing from the ledger |

The booking audit **proposes only**. It never writes a booking or a ledger row.
Once it has been accurate for a while it can be switched to write directly.

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
