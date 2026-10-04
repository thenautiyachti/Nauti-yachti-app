# The Nauti Yachti — Website and Owner Console

How to run a charter business on this system: the public website, the owner console at thenautiyachti.com/admin, and the AI crew that watches over both.

Edition for version 2.16.0 · October 2026

[[TOC]]

# About this manual

## How to use this manual

This is an operations manual. It tells you what each part of the system is for, how the logic behind it works, and what to do, step by step, for the jobs that come up. It is written for the owner and for anyone the owner trusts to run the business with them.

It is organised the way the work is, not the way the system was built:

| Part | Read it when you need to… |
|---|---|
| 1 · The system at a glance | understand what the pieces are and find your way around the console |
| 2 · The public website | know what a guest sees and what happens when they book or pay |
| 3 · Bookings | take, change, charge, complete or untangle a booking |
| 4 · Money | record income and costs, reconcile, or produce tax figures |
| 5 · Guests | reach past guests, ask for reviews, answer photo requests |
| 6 · Photos, video and social media | find media, approve posts, answer comments and messages |
| 7 · The AI crew | understand the agents, their board and their limits |
| 8 · Fleet and on the water | use the phone page on the dock, log hours and maintenance |
| 9 · Running and protecting the system | releases, backups, files, and the checks that keep it honest |
| 10 · Troubleshooting | something looks wrong and you want the fix |
| Appendices | quick reference, glossary, this installation's specifics, and setting it up for another business |

New to the system? Read Part 1, then Part 3. Everything else can be looked up when it comes up.

## Conventions used in this manual

- **Bold** names a button, tab or label exactly as it appears on screen.
- **Group → Tab** gives a path through the console, for example **Bookings → Availability**.
- `Monospace` is a file, a script or a value typed exactly as shown.
- Numbered steps are a procedure: do them in order.

> **Why it works this way.** Boxes like this explain the reason behind a rule. Most rules in this system exist because something went wrong once. The box tells you what, so you can judge the edge cases the rule does not cover.

Facts that belong to this one business (its boats, docks, packages and accounts) are collected in [Appendix C](#appendix-c-this-installation-the-nauti-yachti). Everything else describes how the system works and holds for any business running it.

## Keeping this manual true

The manual lives in the app as `owner-console-manual.md`, and the **Manual** button in the console opens a PDF built from it. Three things keep the two honest:

- A check compares the tab names in [How the console is laid out](#1-4-how-the-console-is-laid-out) with the tabs the console really has, and fails the release if they differ.
- A check fails if the PDF no longer matches the text it was built from.
- The manual is re-read at every release, and a stamp records the version it was last read against.

If you notice something here that is no longer true, say so. A wrong sentence in a manual is worse than a missing one.

# Part 1 — The system at a glance

## 1.1 What the system is

The system has three parts that share one database.

| Part | Who uses it | What it does |
|---|---|---|
| **The public website** | guests | shows the boats, packages and prices, takes inquiries and card payments, sells gift certificates, collects crew-list signups and guest photos |
| **The owner console** | you | every booking, every dollar, every post and message, and the crew's to-do board, at `/admin` |
| **The AI crew** | runs on its own, on a schedule | eight agents and two routines that check the books, draft social posts, publish what you approved, chase reviews and report what needs you |

Around them sit outside services, each doing one job:

| Service | Its job |
|---|---|
| **Stripe** | takes card payments and tells the site when one succeeds or fails |
| **Resend** | sends the website's emails |
| **Blotato** | publishes posts to Facebook, Instagram and TikTok, and reads comments and messages |
| **ElevenLabs** | the crew's spoken voices, when you click an agent to hear her |
| **Supabase** | the database |
| **Vercel** | hosts the website and the console |
| **Google Drive** | backs up the business files, the photo library and the crew's instructions |
| **GitHub** | backs up the code, with every version tagged |

> **Why it works this way.** Every outside service holds one job, so a failure is easy to place. If posts stop, it is Blotato. If confirmations stop, it is Resend. If payments stop, it is Stripe.

## 1.2 How the pieces connect

A booking shows the whole chain:

1. A guest fills in the form on the website. The site prices it and writes an **inquiry** into the database.
2. The guest gets an acknowledgement email, and you get a copy.
3. You agree the details and send a payment link. The guest pays through Stripe.
4. Stripe tells the site. The site marks the booking paid, blocks the date on the calendar and emails a confirmation.
5. After the trip you mark it **completed**. The income is written into the ledger on its own.
6. The next morning the crew checks the money arrived, asks the guest for a review, and suggests a post from the photos.

Nothing in that chain needs you to copy a number from one screen to another. Where you do have to step in, the console tells you: that is what the numbers on the tabs are for.

## 1.3 Signing in and the top bar

Open `/admin` on the website and enter the passcode. The passcode is not written in this manual or anywhere in the system's files. If your session times out, the console says so and asks you to sign in again.

The bar along the top:

| Item | What it does |
|---|---|
| **Version badge** | The version of the whole system, for example `v2.13.0`. The same number sits under the Owner console link on the public site. Hover for details. See [9.1 Versions and releases](#9-1-versions-and-releases). |
| **📱 On the dock** | The phone page for the boat: weather, guests arriving, review asks, engine hours and fuel. See [Part 8](#part-8-fleet-and-on-the-water). |
| **📖 Manual** | Opens this manual as a PDF. |
| **← Back to site** | The public website. |
| **Log out** | Ends your session. |

A muted-speaker notice appears only if the crew's speech fails. Click it to dismiss it.

## 1.4 How the console is laid out

Six groups run along the top. Clicking a group shows its tabs underneath.

| Group | Tabs |
|---|---|
| **Overview** | the day at a glance: what needs you, money, guests, the fleet, the board and the crew |
| **Bookings** | Contacts · Bookings · Availability |
| **Money** | Income & expenses · Reconciliation · Tax Report · Gift certificates · Subscriptions & bills |
| **Marketing** | Media · Media Drafts · Comments · Messages · Testimonials · Photo Requests |
| **Setup** | Packages & pricing · Add-ons · Coupons |
| **Boat** | Maintenance |

**A number after a tab or group name means something is waiting on you.** No number means nothing needs doing. It does not mean the tab is empty: Testimonials can hold every approved review and still show no number. The number on **Overview** counts agents waiting for your answer.

If a panel cannot load, a pink **Some panels did not load** banner says so instead of showing blanks.

## 1.5 The Overview screen

The Overview is where to start every day. On a wide screen it has three columns; on a phone it stacks. Most panel headings are links to the tab that can act on them.

**Crew alerts** appear at the very top, only when there is something to say: an agent **Waiting on you**, or one that failed, stopped mid-run, has gone quiet, or has no standup filed. To restart an agent, open the scheduled routines in the Claude app and choose **Run now**.

| Panel | What it shows |
|---|---|
| **Needs attention** | Every item waiting on you, each a link to where it can be fixed: new inquiries, maintenance due, approved posts with no date, drafts to approve, completed charters with no price, posts going out in the next three days, guests never asked for a review, income not tied to a charter, bills due within two weeks, past guests with no phone. Urgent lines are bold orange. When it says *Genuinely nothing waiting*, there is nothing. |
| **Money** | The bank balance as last recorded and how old the reading is, income earned this season, money held for trips that have not happened, costs, net, monthly fixed costs, break-even in charters per month, and this month so far. |
| **Guests** | Reviews and the average rating, how many guests can be reached, and **Charters we owe** when anyone has paid for a trip that never ran. |
| **Pearl** | The lead agent's morning summary. Click her face to hear it. |
| **The Board (To-do List)** | The shared to-do list between you and the crew. See [7.3](#7-3-the-board). |
| **Research** | Anything the research agent has found that cleared her bar. Usually *Nothing has cleared the bar*, which is normal. |
| **The fleet** | The next charter out, trips and earnings per boat this season, and idle days. |
| **Going out next** | The next posts due, how far ahead the queue runs, and the last confirmed publish. |
| **Money on the table** | Open Saturdays in the next eight weeks, gift certificates sold and revenue ideas open on the board. |

Each panel carries the face of the agent who owns that area. At the bottom, a chart shows who reports to whom.

## 1.6 A day in the life

A routine that keeps everything current with the least effort.

**Every morning, five minutes:**

1. Open **Overview**. Work down **Needs attention** from the top.
2. Read Pearl's summary, or click her face to hear it.
3. Glance at **The Board** for anything marked High.
4. Open **Marketing → Media Drafts** if the badge shows posts waiting for approval, and approve, reschedule or reject them.

**On a charter day:**

1. Open **📱 On the dock** on your phone.
2. On **Arriving**, text each guest the dock details and gate code.
3. Before heading out, and whenever weather builds, check **Weather → Can I get back before it hits?**

**After every charter:**

1. In **Bookings**, set the charter to **completed**. That writes its income.
2. On the phone page, log engine hours (**Boat log**) and any fuel.
3. Text the guest for a review from **Reviews**, ideally the same day.

**Once a week:** reconcile platform payouts (**Money → Reconciliation**), file receipts (**Money → Income & expenses**), and record the bank balance.

# Part 2 — The public website

## 2.1 The pages and what each is for

| Page | What it is for |
|---|---|
| `/` (home) | the boats, the packages, the gallery, the reviews, and the booking form at the bottom |
| `/packages` | each package in full |
| `/glow` | the seat-sale event page: the date and the seats while it is on sale, the crew-list signup always. See [2.6](#2-6-seat-sale-events) |
| `/events` | upcoming events |
| `/faq`, `/about`, `/terms`, `/privacy-policy` | questions, the business, the terms and waiver, privacy |
| `/gift-certificates` | buying a gift certificate |
| `/share-your-photos` | anyone uploads photos and video from a trip; it points booked guests to Guest Login. No longer in the menu |
| `/trip/<booking number>/<key>` | the guest's own trip page: times, meeting point, payment, photo box, review and messages. See [2.8](#2-8-the-trip-page) |
| `/trip` | **Guest Login**, in the menu on every page: a guest signs in with their booking number and phone and lands on their trip page |
| `/thanks` | after a trip, from the on-boat QR code: ask for photos, leave a review |
| `/pay/<id>` | the payment page you text a guest, see [3.7](#3-7-charging-a-booking-and-payment-links) |
| `/booking-success` | where a guest lands after paying |

A link with `?package=<id>` opens the home page with that package already chosen in the form. A link with `?from=<source>` records where the guest came from, which ends up as the booking's lead source.

## 2.2 How a guest books

The booking form is at the bottom of the home page.

**The guest fills in:** name, email, phone, party size, the package, the boat (only boats that run that package are offered), the date, the hours (for hourly packages), any add-ons, an optional coupon code, an optional gift certificate code and a message, and ticks to accept the terms. For a fixed-date event the date is set for them, and once that date has passed the event is not offered at all (see [2.6](#2-6-seat-sale-events)).

The price updates as they choose. Then they pick one of two buttons:

| Button | What happens |
|---|---|
| **Book & pay now** | The site re-checks the price on the server, records the inquiry, and sends the guest to Stripe to pay. If card payments are switched off it falls back to sending an inquiry. |
| **Not ready to pay? Just send an inquiry** | The inquiry is recorded with status **new**, and both of you get an email. You follow up. |

**Either button first checks that the boat is free** (see [2.7](#2-7-the-availability-check)). If it is not, the guest is told why on the spot, for example that the boat only has three hours left that day, and nothing is recorded.

**The site confirms on screen and the confirmation stays there.** The form is replaced by a panel that reads back what they asked for and says no more is needed, so nobody fills the form in twice thinking it failed.

### The same inquiry sent twice

A plain inquiry that matches one already waiting is folded into it instead of making a second row. It counts as the same inquiry when all of these match:

| Must match | Within |
|---|---|
| email, requested date, package and **boat** | 30 minutes of the first, and only while the first is still **new** |

If they changed something (party size, phone, message), the row is updated and you get one email headed **Updated inquiry**. If they changed nothing, you hear nothing more. The guest never gets a second acknowledgement. An inquiry with no date is never merged.

> **Why it works this way.** The boat is part of the test because a large group sometimes books two boats for the same day, half an hour apart. Leaving the boat out would merge two real bookings into one. A second row you delete costs a click; a lost booking costs a charter.

**Known limit:** **Book & pay now** does not de-duplicate. Every press makes a new inquiry. See [3.8](#3-8-when-the-same-guest-appears-twice).

**Known limit, accepted:** one guest can be charged twice for one booking, by paying through two checkouts. Nothing stops it, by the owner's choice: the guest will notice and say so, and the fix is quick. Refund the second charge in Stripe, then cancel the extra row. The merge tool refuses a pair that both carry money, so this one is done by hand (see [3.8](#3-8-when-the-same-guest-appears-twice)).

## 2.3 How prices are worked out

**Every price lives in the database, in Setup → Packages & pricing.** The website, the payment page and the checkout all compute from it. A price written anywhere else, such as a flyer or an old price card, is only a copy.

Each package is priced one of four ways:

| Pricing type | How the price is found |
|---|---|
| **Hourly by vessel** | a grid per boat: hours × weekday or weekend. Saturday and Sunday are the weekend; holidays are not treated specially. |
| **Per guest** | party size × price per guest. Used for seat-sale events. |
| **Tiered by guests** | one flat price for the size band the party falls in |
| **Flat** | one price |

If a combination has no price (a boat or a number of hours missing from the grid), the site **refuses** rather than quoting $0.

**The server re-prices every checkout.** If the server's price is higher than what the guest's screen showed, the checkout stops with a "the price changed" message. If it is lower, the lower price is charged.

### Add-ons

Extras a guest can add. Which ones come free with which package, and their prices, are set in **Setup → Add-ons** and in `lib/addOns.js`, which is the single source for the form, the quote and the FAQ. This installation's list is in [Appendix C](#appendix-c-this-installation-the-nauti-yachti).

- A bundle that contains other add-ons is never charged twice for what it contains.
- **A per-guest event takes no add-ons at all.** There is no table to decorate for one seat on a shared boat, so the form hides them and the server ignores them.
- A charter with no stated occasion is the default package, not a guess. See Appendix C.

### Coupons

Codes are made in **Setup → Coupons**: a percentage or a fixed amount off, with an optional end date, usage limit, and "returning guests only".

- A code is checked when the guest checks out. A code that is unknown, inactive, expired or used up is **silently ignored** and the full price is charged.
- "Returning guests only" means the email must match an earlier paid booking.
- A discount never takes the price below zero.

**Known limit:** a use is counted when the checkout **starts**, not when the guest pays, so an abandoned checkout still uses one. Watch the count on a code with a small limit.

### Gift certificates at checkout

A guest can enter a gift certificate code in two places: the booking form, beside the coupon box, and the payment page you text them, under **Have a gift certificate?**. The code is checked as they type it and the balance is shown.

- The certificate is applied **after** any coupon, against whatever is still owed.
- It is **spent only once the rest is paid**, so an abandoned checkout never uses it. When it covers the whole charter there is nothing for the card to pay, so it is spent at once, the booking is marked paid by gift certificate, and the guest gets their confirmation.
- A code given with a plain inquiry is kept on the inquiry, shown in your inquiry email, and filled in on the payment page when you send the link. It is not spent until they pay.

See [4.6](#4-6-gift-certificates).

## 2.4 What happens when a guest pays

1. The guest pays on Stripe's page. Stripe collects their phone and their acceptance of the terms.
2. Stripe tells the site. The site checks once more that the boat is still free (see [2.7](#2-7-the-availability-check)), then marks the inquiry **booked** and **paid**, records the payment method as card, and saves the phone, email and terms acceptance.
3. It creates the matching row in **Bookings**, with the same booking number. That row is what blocks the date on the calendar.
4. It emails the guest their confirmation, with you copied, and records that it was sent.

**No income is written at payment.** Income is written when the charter is marked **completed** (see [3.11](#3-11-completing-a-charter)), so money for a trip that has not happened is never counted as earned.

### When a payment is declined

If the guest's bank refuses the card, the booking is marked **payment failed** with the reason and the time, and **you** get an email. The guest is not emailed by the site: Stripe already told them on the spot. The booking is not cancelled and the seat is not released, because a Stripe payment link stays usable for a day and most declines are retried.

On the booking you get a **Text** button whose message says the seat is still held and **never says why** the card was declined. The badge clears itself when a payment succeeds. A fault that is the business's (an expired key, an amount Stripe refuses) arrives as **PAYMENT BROKEN OUR END** instead.

## 2.5 The emails the site sends

| When | The guest gets | You get |
|---|---|---|
| an inquiry is sent | an acknowledgement | the inquiry, or **Updated inquiry** for a changed duplicate |
| a checkout starts | an acknowledgement | the inquiry |
| a payment succeeds | the booking confirmation | a copy of it |
| a card is declined | nothing from the site | a notice saying what to send |
| someone joins the crew list | a welcome, with how to unsubscribe | a copy, and a signup notice |
| a gift certificate is bought | the certificate and how to use it; so does the person it is for, when the buyer gives their email | one notice: the code, the value and who it reached |
| a guest paid for a boat that was already taken | nothing from the site | an **ACTION** email: move them or refund them |
| a refund goes through on Stripe | nothing from the site | a notice of what was recorded |
| a guest writes on their trip page | nothing until you reply | a notice, saying whether a reply has been drafted |
| you reply on a trip page | your reply, by email, when the booking has an address | nothing |

**The confirmation tells the guest where to go and when.** The meeting point is chosen by package first, then by boat: an event with its own meeting point uses it for every boat; otherwise each boat's own dock address is used. A boat with no address set is never given another boat's. Its guest is told the meeting point is coming, which costs one text and cannot send anyone to the wrong shore. **The dock gate code is never emailed**, because emails are forwarded and kept forever. It goes by text on the morning (see [8.3](#8-3-arriving-guests-and-the-gate-code)).

**The confirmation links to the guest's trip page** ([2.8](#2-8-the-trip-page)), which carries everything in the email plus the photo box and the message board.

**Automatic emails sign as the business.** Texts you send from your own phone carry your name.

If confirmations ever stop arriving, see [Troubleshooting](#part-10-troubleshooting).

**Known limit:** no email goes out when a booking's status changes, when a charter completes, or for photo requests and guest uploads.

## 2.6 Seat-sale events

A seat-sale event is a package priced **per guest** with a fixed date: one night, many parties, each buying seats on a shared fleet. This installation has one, described in [Appendix C](#appendix-c-this-installation-the-nauti-yachti).

**Seats are counted, never typed in.** The count reads every booking on the night, in both tables, each charter once:

| Shown as | Counts |
|---|---|
| **Confirmed** | booked or completed |
| **Tentative** | an inquiry, a lapsed inquiry, an owed charter, or any status the system does not recognise |
| **Available** | capacity, minus confirmed, minus tentative |

Capacity is the event's boats, less one seat per boat for the captain. A cancelled booking holds nothing. The same numbers show on the event page, on the Events page and under the package in **Setup → Packages & pricing**, for example *12 confirmed · 18 tentative · 10 available*. The event page refreshes them every minute.

> **Why it works this way.** A tentative seat counts against capacity because promising a seat to a second person while the first has not paid is how somebody gets turned away at the ramp. Showing it separately says how much of the night is really settled. A lapsed inquiry keeps its seats until you cancel it, so cancel the ones you know are not coming, or they hold seats nobody will sit in.

**Sales close by themselves once the night has passed**, at midnight lake time, and reopen only when the package is given its next date. While they are closed:

- the event page says the next date is coming, and every button on it goes to the crew-list signup, which stays open between seasons;
- the booking form does not offer the event, and an old link with `?package=` opens the home page without it;
- the checkout and the inquiry route refuse it, so a page left open from before, or a hand-made request, cannot buy a seat.

The server also refuses a seat-sale booking for any date other than the event's own.

**To reopen**, give the package its next date. Sales open the moment it is saved, so do not set a date before you want to sell seats.

**Known limit:** the event date cannot be changed from the console yet. Ask Claude to set it.

## 2.7 The availability check

**The server checks that the boat is free, three times.** The calendar on the home page only shows availability; it does not stop anyone choosing a day. The check is what does.

| When | What is checked |
|---|---|
| a guest presses either button on the booking form | the whole request |
| a payment link is opened for a booking that does not yet hold its day | that booking, leaving itself out |
| the money arrives | that booking again, as a backstop |

**For a charter**, the boat's day must not be blocked, and it must have the hours asked for left. A day holds eight hours, the same figure that turns a calendar square from partial to full ([3.10](#3-10-availability-and-blocking-days)). **For a seat-sale event**, the party must fit the seats available ([2.6](#2-6-seat-sale-events)).

**A guest on Stripe's payment page holds their boat.** For 35 minutes from the moment they press **Book & pay now**, their hours count against the day, and Stripe's page itself closes after 30. So a second guest cannot slip in behind somebody typing a card number. A plain inquiry holds nothing.

**If the money arrives for a boat that is no longer free** (two guests at the same instant, or a booking you logged by hand while they were paying), the booking is marked **paid but not booked**, the guest is sent no confirmation, and you get an email headed **ACTION**. Call them: move them to another boat or date and mark it booked, or refund them in Stripe. The morning check keeps showing it until you do.

**Not checked:** a booking you add in the console yourself, and a payment link for a booking you have already marked booked. Both are your decision.

> **Why it works this way.** A website booking names a boat, a day and a number of hours, never a start time; you settle the time with the guest. So the server can only ask what the calendar asks: is the day blocked, and are the hours left? If the check itself cannot run, for example because the database does not answer, the booking goes through as it did before the check existed: refusing every guest because of a fault would cost more charters than it saves.

## 2.8 The trip page

Every booking with a booking number has its own page for the guest: `thenautiyachti.com/trip/<booking number>/<key>`. It is the page they open before, on and after the day.

| When | The page leads with |
|---|---|
| before the day, and on it | the charter, how to get there and when to arrive, payment, what to bring, the photo box, messages, and the common questions |
| afterwards | **our photos of their trip** (from the charter's `Completed` folder), the photo box, a **Leave a Google review** button, then the charter and payment |
| cancelled or refunded | that it was cancelled, and how to reach you |
| not yet confirmed | that the date is not held until it is paid, with the payment button |

**How a guest gets in.** Two ways, and neither needs a password. The link in the booking confirmation email and in **Text reminder** signs them straight in. Or **Guest Login** in the website's menu, on every page, asks for their booking number and the phone number on the booking. Any number on the booking works. After five wrong tries from one connection it makes them wait, and the wait doubles with each further try.

> **Why it works this way.** A booking number is the date and a counter, so anyone could guess the next one. The key on the end of the link is what keeps the page closed, and the phone number does the same job for a guest without the link. A password nobody remembers at a boat ramp would lock out more guests than strangers.

**To see one without opening a guest's**, use **See an example trip page** in Marketing → Messages. It is a made-up booking on a real boat, and it opens only while you are signed in to the console; anyone else gets "not found". Add `?phase=today`, `?phase=past` or `?glow=1` to its address to see the other states.

**Anyone holding the link is the guest.** That is deliberate: the person who booked forwards it to the group, and everyone aboard can send their photos. The page says so beside the message box.

**What it shows, and what it never shows.**

- Times and the meeting point come from the same place as the confirmation email ([2.5](#2-5-the-emails-the-site-sends)), so the two cannot disagree. A glow seat is always sent to the event's meeting point. A boat with no address set says the meeting point is coming.
- **The gate code is never on it.** It still goes by text on the morning ([8.3](#8-3-arriving-guests-and-the-gate-code)).
- Website and direct bookings show the charter price, any discount or gift certificate, and what was paid. An unpaid balance has a **Pay** button that goes to the booking's `/pay/<id>` page, never to Stripe directly.
- **Boatsetter and GetMyBoat bookings show no amounts**, only that the platform took the payment. What reaches you from a platform is not what the guest was charged.

**Photos.** The photo box is there from the moment the booking is confirmed, before the trip as well as after; most photos arrive afterwards. It is not shown on a cancelled booking or one not yet confirmed. Anyone with the link can send photos and video, up to 2 GB a file, after ticking the same permission as the share page; the exact words they agreed to are kept with each file. Uploads land with the share page's ([6.2](#6-2-photos-guests-send-you)), already attached to the booking, and the group can see what has been sent so far.

**Our photos of their trip.** After the trip the page shows the photos in that charter's **`Completed`** folder, to view full size and download ([6.1](#6-1-the-photo-library)). Coral curates that folder, and whatever she puts in it goes up on its own: asked whether each photo should wait for your yes, you said *"Folder is enough."* You can take any photo down in **Marketing → Photo Requests** ([5.4](#5-4-photo-requests)), and one you take down never goes back up by itself. When two separate charters share a date, each booking sees only the photos from the folder named after its guest; a glow night's folder names none of its guests, so all of that night's bookings see its photos. Where a shot exists in several crops, guests get one, the fullest frame. Most of the photos are **the best frames from the trip's own video**: people film on a boat far more than they take pictures, so Coral picks the good moments out of the footage (by the kind of trip, and brightened if it was at night) and moves them in. A riding shot, tube or board, is punched in on the rider, about four and a half times, so the guest is the picture and not a speck in the wake; it is softer than the wide frame, which is the trade you asked for. When a charter's own footage is thin she may take frames from your CapCut recap, with the CapCut mark cropped off. The raw recordings and the rest of the extracted frames are never shown. Until a charter has photos up, the page says they are being picked, so a guest knows to look back. Photos only for now: videos wait for more storage.

**Messages.** A guest can write to you from the page. You are emailed straight away and answer in **Marketing → Messages** ([6.7](#6-7-messages)). Your reply appears on their page and, when the booking has an email address, is emailed to them as well.

**Known limit:** a booking with no number (an inquiry with no date) has no trip page.

**Known limit:** which booking sees a photo is decided by name. When a date has more than one completed booking, a photo goes to the bookings whose guest's first or last name is in the charter folder's name (`2026-08-15 Chance (...)` → Chance's booking only), and a folder that names none of them goes to all of them, which is right for a glow night. So each private charter's folder must carry its booking's guest name; if it does not, the console warns that two private charters would share the photos, before you approve.

**Known limit:** no videos on the trip page yet. The free storage plan holds 1 GB, and recap videos would fill it within a season.

**Known limit:** there is no way to withdraw one booking's link. Anyone it was forwarded to keeps it.

**Known limit:** platform bookings rarely carry an email address, so a reply to one of those guests waits on their page until they look. Text them as well if it matters.

**Known limit:** the links are signed with the website's session secret unless `TRIP_LINK_SECRET` is set. Changing the session secret withdraws every trip link ever sent, so set `TRIP_LINK_SECRET` first if it ever has to change.

# Part 3 — Bookings

**Every reservation lives in Bookings → Bookings**, whatever it is (an inquiry, a confirmed trip or one that has sailed) and wherever it came from: the website, Boatsetter, GetMyBoat, a text, a phone call or the dock.

## 3.1 The booking lifecycle

A booking moves through a small set of statuses:

```
inquiry ──► booked ──► completed
   │           │
   ▼           ├──► owed ──► booked (when a new date is agreed)
lapsed         └──► cancelled ──► refunded
```

| Status | Means | Blocks the date? |
|---|---|---|
| **inquiry** | someone asked; still live | no |
| **lapsed** | never turned into a booking. Nothing went wrong. | no |
| **booked** | confirmed and holding its date, paid or not | **yes** |
| **owed** | they paid, the trip never happened, no new date yet | no |
| **completed** | the charter ran | **yes** |
| **cancelled** | it was a booking and is off; money may need to go back | no |
| **refunded** | it was a booking, and the money has gone back. Nothing is owed either way. | no |

**Refunded closes what cancelled leaves open.** A full refund made in Stripe sets it by itself and emails you; a cash, Zelle or other refund is set by hand. A **partial** refund leaves the status alone and records the amount on the booking. A booking can go straight from booked to refunded.

On a website inquiry the first status reads **new** rather than inquiry; it means the same.

**Payment is tracked separately from status**, so the Bookings tab shows both together:

| Reads | Colour | Means |
|---|---|---|
| **Booked / paid** | green | settled; nothing to collect |
| **Booked / no charge** | green | on board at no cost, such as crew riding free. Never counted as a sale. |
| **Booked / unpaid** | blue | confirmed and holding the date; the money has not arrived. **This is the chase list.** |
| **Booked / payment failed** | red | they tried to pay and the bank refused |
| **Inquiry** | grey | asked, not booked |

The words carry the meaning and the colour only reinforces them, so the screen reads the same in sunlight, in black and white, or to a colour-blind reader.

## 3.2 Booking numbers

Every booking gets a number like `NY-20261018-02`:

- the date inside it is the date the charter was **first booked for**;
- the last two digits are the order it was taken for that date, counted across every source.

**A booking number never changes.** When a charter is rescheduled, the date column moves and the number stays. The number is what the guest quotes, what the ledger points at and what old emails say. A number that moved would stop matching the paperwork.

**A number is never given out twice, not even after its booking is deleted.** Each day remembers the highest number it has ever issued, so deleting a booking retires its number rather than freeing it, and there can be gaps in a day's sequence. Two limits: a number deleted before October 2026 left no record, and two bookings created at the very same instant could still draw the same number. The second is a known, accepted limit: at this business's volume it is unlikely.

A booking needs a date to get a number. A website booking and its mirror row share one number on purpose.

## 3.3 The Bookings tab

Add a booking with the form above the table. Each row shows the guest, the date and time, the boat, the **Package** (what decides the price, whether add-ons apply and where to meet), seats, price, status and payment.

**On a phone** the table drops its middle columns and puts the essentials under the guest's name, for example *Glow night · 2 seats · $100*. A booking at no charge says *no charge*, not $0.

**Each row carries the text it needs.** These open your phone's messaging app with the message written; they send nothing on their own, and on a computer they say so instead.

| Button | Offered when |
|---|---|
| **Text payment link** | anyone who owes money and whose row has a package and a price |
| **Text to confirm** | a lead with no price yet: asks them to confirm so you can price it |
| **Text reminder** | a **paid** booking: the day, departure time, where to meet and their trip page link |
| **Text about the declined card** | replaces the payment link while a card decline is on record |
| **Text about owed** | a charter that was paid for and never sailed |

Every guest text ends by saying a real person is on the other end and they can reply.

**trip page ↗** on a row opens the page that guest sees ([2.8](#2-8-the-trip-page)). Copy it from there to send it by hand.

## 3.4 Lead source, channel and how they paid

Each booking answers three different questions:

| Field | The question | Options |
|---|---|---|
| **Lead source** | Where did they find us? | Website · Text / WhatsApp · Phone · Walk-up · Instagram · Facebook · Repeat guest · Referral · Boatsetter · GetMyBoat · AI search · Other |
| **Booking channel** | Who took and processed it? | Boatsetter · GetMyBoat · Website · Direct |
| **How paid** | How did the money actually arrive? | Unpaid · Stripe (card) · Cash · Cash App · Zelle · Venmo · PayPal · Boatsetter payout · GetMyBoat payout · Gift certificate |

**How paid is the one only you can answer.** A card payment through Stripe is recorded on its own; everything else has to be set by you, because nothing proves cash changed hands except you saying so. Left blank, the income row says so rather than guessing.

## 3.5 Taking a booking that came in by text or phone

Most bookings arrive by text, WhatsApp or phone. That is the biggest channel and the easiest to lose track of, so log it the moment it arrives.

1. **Check three things against the live data:** the date is free for that boat, the boat seats the party (see [3.12](#3-12-capacity-counts-the-captain)), and the price matches **Setup → Packages & pricing**.
2. **Log it** as an inquiry, either with the form on **Bookings → Bookings**, or by sending the message to Claude (a screenshot is enough), which logs it with a booking number and drafts your reply.
3. **Reply** to what the guest actually asked, written fresh, not from a template. If they named no occasion, it is the default package.
4. **When they say yes**, set it to **booked** and send **Text payment link**. The row needs a package and a price for the link to work.
5. **When they pay**, the site marks it paid and sends the confirmation on its own (see [2.4](#2-4-what-happens-when-a-guest-pays)). If they pay another way, set **How paid** yourself.

**Between "yes" and "paid", a booked row holds the date.** An inquiry does not. If a date is in demand and the guest has not committed, block it by hand (see [3.10](#3-10-availability-and-blocking-days)) and unblock it if they never pay.

### From the command line

The same thing in one step, priced the way the website would price it:

```
node scripts/add-booking.js --name "Guest Name" --phone "(555) 555-0100" \
     --package <package id> --date 2026-10-18 --seats 4 --apply
```

- It previews until you add `--apply`.
- `--amount` is a **total** that overrides the package price, for an agreed special rate. It never touches the public prices.
- Without `--vessel`, the boat with the most room that day is chosen.
- It refuses a name or number already booked on that date; add `--force` if it really is a second booking.

## 3.6 Platform bookings: Boatsetter and GetMyBoat

A platform booking is entered in **Bookings → Bookings** with its channel set to the platform and the platform's reference.

**GetMyBoat bookings are added for you.** Every morning the accounts agent reads GetMyBoat's *Booking Confirmed!* emails and adds any that are not on the books yet: the date, start, length, party, boat and payout come straight from the email, and the boat from which GetMyBoat listing was booked. It only ever adds; it never changes or cancels a booking. Her status names each one. **Boatsetter bookings are still entered by hand.**

**Known limit:** a booking from a GetMyBoat listing the system does not know yet is reported, not added, until you say which boat it is.

- The platform takes the payment and pays you later: **Boatsetter in legs** (the boat, then the captain fee, sometimes add-ons, days apart), **GetMyBoat in one sum.**
- Boatsetter does not share guest phone numbers or emails: ask the guest on the day and add them, or they can never be asked for a review. **GetMyBoat does**, once the booking is confirmed: they are under **Contact Details** on the trip's page at getmyboat.com (not in the confirmation email). Copy them onto the booking.
- The price on the booking is what you are paid, not what the guest paid the platform.

## 3.7 Charging a booking and payment links

**Text payment link** sends the guest their own page on your website: `thenautiyachti.com/pay/<id>`. It shows the charter and the total, then hands off to Stripe.

- **Never text a raw `checkout.stripe.com` link.** To a careful guest it looks exactly like a scam.
- The page charges the price on the booking, with no coupons. Change the price on the booking first if it needs changing.
- The guest can apply a gift certificate on the page (see [2.3](#2-3-how-prices-are-worked-out)). A code they gave with their inquiry is filled in for them.
- If the booking does not yet hold its day, the page first checks the boat is still free (see [2.7](#2-7-the-availability-check)).
- A booking already paid shows **Already paid** instead of charging twice.
- **A test-mode link is never saved against a booking.** A test link takes a card, says thank you and collects nothing. The tools label one **TEST LINK — DO NOT SEND**.

## 3.8 When the same guest appears twice

Usually a payment link carries the booking's own number, so a guest who pays through it lands on the right row with nothing to untangle. The trouble comes when a guest you logged by hand then books on the website as well: one person, two rows, **and the seat counted twice**.

The morning check names such pairs with its evidence:

| Reads | Means |
|---|---|
| **certain** | same email, or the same ten-digit phone, on the same day |
| **likely** | no contact detail in common, but one name fits inside the other and they bought the same thing on the same day |

**Nothing merges on its own.** Two bookings sharing a phone are just as likely to be two friends booking from one handset, and merging would delete a real seat. To merge a pair you have judged:

```
node scripts/merge-bookings.js NY-20261018-03 NY-20261018-11
```

It shows what it would do and writes nothing until you add `--apply`. The row holding the money survives; the other is filled in from it, then **cancelled, not deleted**, with a note pointing at the survivor. It refuses outright if both rows have money against them: that is either two real bookings or one guest charged twice, and needs a person.

## 3.9 Owed: paid for, never sailed

When weather, a breakdown or the guest's plans cancel a trip they have paid for, and no new date is agreed yet, set the booking to **owed**. Do not use **cancelled**: cancelled means the relationship is finished and money is going back. Owed means their money is still here and they still want to go.

- An owed booking **does not hold a day**: it has no date.
- It shows as **active**, in amber, because it is work outstanding.
- Pearl reports it every morning until it is settled, urgently if there is no phone or email on file.
- Money stays attached to it in the ledger, and it is **not counted as earned income** until the trip sails.

Reach out from **Overview → Guests → Charters we owe** (see [5.5](#5-5-charters-we-owe)). When they pick a date, set it back to **booked**.

## 3.10 Availability and blocking days

**Bookings → Availability** shows each boat's days. A day is:

| State | When |
|---|---|
| **full** | booked charters on that boat add up to 8 hours or more, or you blocked it |
| **partial** | booked hours add up to less than 8. The calendar shows the windows taken, such as `10am–2pm`. |
| **open** | nothing booked or blocked |

Only **booked** and **completed** charters take up time. Inquiries, owed, cancelled and refunded bookings never do. A website booking and its mirror row are counted once.

**To block a day**, open **Availability** and toggle the day on that boat. Use it for maintenance, private days, and to hold a date for a guest who has said yes but not paid.

A booking with no hours on it counts as none, and one with no start time is not shown as a window. Add both to keep the calendar, and the availability check, honest.

**The website enforces this calendar.** A guest cannot book or pay for a boat on a blocked day, or for more hours than the day has left. See [2.7](#2-7-the-availability-check).

## 3.11 Completing a charter

After the trip, set the booking to **completed**. That one action:

1. writes the income row in the ledger, once, with the amount paid, the boat and the hours. Origin comes from **How paid**.
2. updates the website inquiry behind it, if there is one, so the two stay in step.

**A completed booking with no price writes nothing.** The Overview flags it under **Needs attention**: add the price and the income follows.

**Known limit:** setting a completed booking back to another status does not remove its income row. If you completed one by mistake, delete the row in **Money → Income & expenses** too.

## 3.12 Capacity counts the captain

A boat's capacity **includes the captain.** A boat listed for 12 carries 11 guests. This is the easiest mistake to make when quoting quickly. Capacities for this fleet are in [Appendix C](#appendix-c-this-installation-the-nauti-yachti).

## 3.13 When a payment and the console disagree

A guest says they paid and the booking still says unpaid. Ask Claude to **resync** it; there is no button for this in the console. The resync re-reads Stripe's own record and repairs what is missing: payment, email, phone and terms acceptance. Then it sends the confirmation if the guest never had one. It only ever copies **from** Stripe, so it cannot mark paid something Stripe does not show as paid.

If confirmations were ever missed in bulk, `node scripts/send-missing-confirmations.js` lists everyone who paid and was never told, and `--apply` sends them.

# Part 4 — Money

The ledger in **Money → Income & expenses** is the record of every dollar. Folders of statements and receipts are evidence for it; when the two disagree, that is something to investigate, not something to file.

## 4.1 Income & expenses

Every dollar in or out is one row. The form on the left adds one: **Income** or **Expense**, a category, an amount, a date, and the **origin**, meaning how the money moved. Link a row to a booking and it counts toward that booking's profit.

Below the list are breakdowns by category, profit per booking, and commission lost to the booking platforms.

**Two kinds of row write themselves:**

| Event | Row written |
|---|---|
| A booking is set to **completed** | its income row, once. Re-saving does not add a second. A completed booking with **no price** gets no row: the system will not invent a number. |
| Fuel is logged on the phone page with a dollar total | the fuel expense |

Everything else is entered by hand, by you or from a statement you have checked.

> **Why it works this way.** Income used to be joined to bookings by hand, and six charters' money went missing that way. A missing row is easy to spot; a made-up number is not, so the system writes rows only from facts it has.

## 4.2 Origin: how the money moved

Three questions are kept apart, because a guest can find you on Instagram, book through a platform and pay in cash:

| Field | The question | Lives on |
|---|---|---|
| **Lead source** | Where did the guest come from? | the booking |
| **How paid** | How did the money arrive? | the booking |
| **Origin** | How did this particular dollar move? | each ledger row |

The origin list and the payment-method list are built from the same source, so neither can gain an option the other lacks. Card payments file as **Stripe**; a platform payout files under the platform; cash as **Cash**; Cash App, Zelle, Venmo and PayPal each as their own statement.

- **Cash App is not Cash.** One leaves a statement and can charge a fee; the other does neither.
- **One charter can be paid two ways.** The booking holds the main method, and each actual payment is its own ledger row.
- **One thing spelled two ways is two things.** Use the spelling already in the list. The morning check reports an origin spelled more than one way, and an origin the console cannot display.

## 4.3 Reconciliation

**Money → Reconciliation** answers one question per booking: is this charter's money on the books? It matches on the real link between a booking and its ledger rows, never on date and amount.

**Boatsetter pays in legs** (the boat, then the captain fee, sometimes add-ons), often days apart. Several income rows on one charter is normal there. GetMyBoat pays in one sum.

### When a charter's money cannot be found

The Overview may say *"N income rows are not tied to a charter."* Find out which of two things it is before doing anything:

- **Unlinked:** the money is in the ledger but not joined to its booking. **Link it. Do not add a row.**
- **Missing:** nothing in the ledger matches at all. Find out what happened, then add one.

Adding a row for money that was already recorded **counts it twice on your tax report.** Some unlinked income is correct and always will be, for example ticket income from an event with no single booking behind it.

## 4.4 Tax Report

1. Open **Money → Tax Report** and pick the year.
2. Choose **Show**: income and expenses, income only, or expenses only. The choice applies to the screen **and** to both downloads.
3. **Download PDF** for a printable summary (totals, breakdowns, every entry), or **Download CSV** for a spreadsheet.

Net profit appears only when both sides are showing, so one side alone is never read as profit.

What the report does for you:

- **Money held for a trip that never ran is not income.** It is a deposit until the trip sails. The report shows the excluded amount in an amber note so it still reconciles with the bank.
- **Income is split by vessel and by origin**, because every charter is filed under the one category *Reservation*.
- **Average per charter and per hour** come from bookings, not ledger rows, so a platform charter paid in two legs is not counted as two trips.
- **The subscriptions figure is business only.** Personal subscriptions are left out, and the PDF says so.
- An amber note flags income with no vessel recorded. Fill those in.

## 4.5 The bank balance

The ledger answers *did we make money*. The bank balance answers *will this week's bills clear*. They are different questions, and a season can be profitable while the account is overdrawn.

The balance on the Overview is **a reading, not a live feed.** Someone reads the bank app and records the figure with its date. The age shows beside it and turns amber after a week. The figure is green, amber under $250, red when negative.

**Readings are never edited.** A wrong figure is corrected by recording a newer one, so the history keeps the bad month as well as the good one. Readings are recorded by an agent or a script with the date they were taken; the console shows them and does not take input.

## 4.6 Gift certificates

**Money → Gift certificates** lists every certificate bought on the website: code, buyer, face value, what is left and its state.

**When one is bought**, the buyer is emailed the certificate, and so is the person it is for when the buyer gives their email. You get one notice: the code, the value, and who it reached. The sale is income on the day it is bought.

A certificate that is paid for and not yet used is a **liability**: the money is in the bank and the trip is still owed. Read it like a charter that was paid for and never sailed.

- **Guests redeem one themselves**, on the booking form or on a payment page ([2.3](#2-3-how-prices-are-worked-out)). You can still redeem one by hand here against a booking. A partial use leaves the rest on the certificate.
- **A certificate refunded in full in Stripe is voided by itself.** Its sale stays in the ledger as income until you correct that row.
- **Certificates never expire on their own.** Voiding an old one is a decision to make on purpose.

## 4.7 Subscriptions & bills

Every recurring cost, turned into a monthly figure so weekly, monthly and yearly bills can be added up. It includes the household bills that are partly business costs when the office is at home.

### The four columns that matter

| Column | Meaning | Note |
|---|---|---|
| **Where** | which address or account it belongs to | Two live accounts with the same supplier usually means an old one was never closed, and the tab says so. |
| **Amount** | the cost | **Blank is not zero.** Blank means nobody has checked; `0` means confirmed free. Blank amounts are listed as open questions and add nothing to totals. |
| **Business %** | the business's share | **Blank means not decided**, and the bill stays out of the deductible total until it is. |
| **Ended** | the date the account closed | Setting it closes the account; *Active* follows on its own. |

### The two totals

The first total is what leaves the bank each month. The second is **the business's share**, the only figure that belongs on a tax return. Write the basis for each percentage into the bill's note (for example, the office's share of the home's floor area), because an accountant will ask for it.

### Personal subscriptions

Personal subscriptions can be kept here so duplicates and waste show up across everything you pay for. They are **kept apart from the business entirely**: their own line, their own total, and never included in the business figures or the tax export. The **Side** button moves a bill between business and personal.

### Groups, the calendar and phones

Bills are grouped by category (Utilities, Storage, Software, Hosting, Other, then Personal). Groups start closed; each heading shows its count, monthly total, business share, and how many bills are unpriced or closed. Inside a group the largest bill sorts first.

The **calendar** draws the month with each bill on its due day, but only bills whose due date came from a real receipt. The others are named underneath, so an empty day means nothing is due. Yearly bills appear only in their own month.

On a phone, each bill becomes a card and the calendar scrolls inside its own box.

# Part 5 — Guests

## 5.1 Contacts

**Bookings → Contacts** lists people, not trips, so a repeat guest appears once however many times they have sailed. Three lists, each collapsed until opened:

| List | Who is on it |
|---|---|
| **Everyone we can contact** | every guest and enquirer with a phone or an email. The count is of people you can actually reach. |
| **Extra guest contacts** | people who sailed on someone else's booking and whose number was kept |
| **Crew list** | people who signed up for event news on the website or from the on-boat QR code |

The two lower lists are **subsets of the top one**, not additions to it, and their headings say so (*"2 of the 30 above"*). Do not add the three counts together.

**Trips count charters, not rows.** A website booking leaves two records behind it, and a guest whose number appears on one booking but not another is merged into one person with both trips.

**Copy mailable emails** sits on the crew-list header, for mailing everyone when an event date is set. To honour an unsubscribe, set that person's status to lapsed.

### Texting someone from the list

Every reachable contact has a button that opens a text to them, with the number and a message already filled in. **It sends nothing:** it opens your phone's own messaging app, and you read it, change it if you like, and press send. On a computer it says so instead of pretending.

- **It reads the offer that is live right now.** While a sale runs, the button carries its code and the message names the discount, the limit and the end date. When the code expires or runs out, the button stops offering it on its own. With no sale, it is a plain catch-up message.
- **It only offers a code with both an end date and a usage limit.** Codes kept for particular people never go to the whole list.
- **Two openers:** someone who has sailed hears *"hope you've been well since your trip"*; someone who only asked hears *"you asked about a charter a while back."*
- **Anyone who opted out has no button at all.**

## 5.2 Asking for reviews

Google reviews are the business's best advertising, and the time to ask is within a few days of the trip. There are two places to ask from:

- **On the dock → Reviews** on your phone: the quickest way, with guests sorted warmest first. See [8.4](#8-4-reviews-on-the-phone).
- **Marketing → Testimonials**, on any screen: the full list with filters.

On Testimonials, four filters: **Still to ask**, **Already asked**, **Not asking**, **Every charter**.

| Button | What it does |
|---|---|
| **Text it** | opens your messaging app with the message written, and ticks the guest off. Phone only. |
| **Preview** | shows the wording, and can copy it for pasting into a platform's message thread |
| **Don't ask** | takes the guest off the list for good. They move to **Not asking** and can be restored with **Put back**. Nothing is deleted. |

**Ask via** appears only for guests with no phone number: a platform message thread is then the only way to reach them. Rows marked **extra contact** are people from someone else's booking, and can be asked like anyone else.

> **Why it works this way.** The booking platforms do not hand over guest contact details, so every number was entered by hand. A guest with no number is a review that can never be asked for. **Don't ask** exists so a guest you will never ask does not have to be falsely marked as asked.

## 5.3 Testimonials

**Marketing → Testimonials** also holds the reviews shown on the public website. New ones wait for your approval and the tab's number counts those waiting. Approved reviews carry no number, because nothing about them needs a decision.

## 5.4 Photo Requests

**Marketing → Photo Requests** lists guests who asked for their photos (from the QR code on the boat) and have not been sent them. The number counts what is still owed. When nothing is owed it shrinks to one line, since trip pages now give guests their photos; the full list comes back the moment someone asks.

- **Longest wait first**, on purpose: the guest at the top is the one most likely to have given up.
- The button opens a message with the greeting written. **Paste the album link yourself**: the files are on your computer, not in the database.
- Marking it sent clears it from the queue.

Underneath, **On guests' trip pages** shows **our** photos that are up on each booking's trip page: every photo in a charter's `Completed` folder, put up by Coral's sync each run. Each charter shows whose page its photos are on, with a warning when two private charters share a date. Tick any you would rather a guest did not have and **Take down**; it stays down.

Below that, **Photos guests sent us** shows the photos and video guests have uploaded to you ([6.2](#6-2-photos-guests-send-you)). Once Coral has approved one into its charter's `Completed\_guest media`, its card says **on the trip page**, names the charter folder, and previews the trip-page copy.

## 5.5 Charters we owe

A guest who paid for a trip that never happened, through weather, a breakdown or their own plans changing, is **owed** a charter. They appear on **Overview → Guests → Charters we owe** until it is settled, with what you are holding and for how long.

| Button | What it does |
|---|---|
| **Text it** | opens your messaging app with the message written. Phone only; with no number on file it says the guest cannot be reached at all. |
| **Preview / Hide** | shows the exact wording, with **Copy wording** |
| **Email** | appears only when there is an email on file |

The wording cannot be edited, on purpose. **Offer a weekend, not a refund:** none of the messages mention money back or apologise at length, because leading with a refund invites the answer that ends the relationship. If they want their money back they will ask. When they pick a date, set the booking back to **booked**.

The panel is not shown at all when nobody is owed, which is the normal state.

# Part 6 — Photos, video and social media

## 6.1 The photo library

All charter photos and video live in the `Photos` folder of the business folder, backed up by Google Drive. It is large, and organised so the crew can find things without anyone browsing it. **It holds only media for social posts and the website** (your rule, 3 October 2026): `00 Inbox`, `01 Fleet` and `02 Charters`. Apparel, campaign graphics and QR codes live in `04 Brand & Pricing`, equipment photos in `03 Fleet & Equipment`.

| Folder | What goes there |
|---|---|
| `00 Inbox` | where new footage lands from the phone and the camera glasses. The content agent files it every run. Its `Imported from Website` folder holds what guests sent through the site: the only copy, never deleted ([6.2](#6-2-photos-guests-send-you)). |
| `02 Charters\_By charter` | one folder per charter, named `YYYY-MM-DD Guest Name (tags)`, the tags being its themes and place, e.g. `2026-06-20 Andrew Mason (tubing, the dam)`. Tags are the themes posted on the website (the Island, the Dam, Party Cove, a birthday, a bachelorette, tubing, wakeboarding, a swim stop, glow, night cruise), never the dock or cruising shots almost every charter has; `()` means no themes on purpose, `(tags needed)` that nobody has said yet. Every charter folder holds `_from video`, `Completed` and `Completed\_guest media`. **This is the main library, and the only home of charter media.** |
| `Completed\_guest media` | inside every charter's `Completed`: the photos and clips guests sent that Coral approved. Shown on that charter's trip page with the rest of Completed. |
| `02 Charters\_Compilations` | finished videos cut from many charters (the theme compilations). Never raw media. |
| `02 Charters\_outings` | your own outings and days with media but no booking (friends, promo nights), each in a dated, tagged folder such as `2026-06-27 Outing (party cove)`; undated strays in `_undated`. Called `06 General and Atmosphere` until 3 October 2026. **The crew may draft posts from it**, never captioned as a charter, and you approve or turn down each one as usual. |
| `_not for use` | inside a charter or outing: a clip you called bad in a review note, moved there by Coral and kept. Nothing is ever taken from it. Media that can never be used (nudity, nothing to do with the boat) is not kept like this: you delete it. |
| `_from video` | every usable frame pulled from a charter's video: the pile Coral picks the best photos from. The pile itself is never shown or posted as a whole |
| *(no `_originals`)* | since 3 October 2026 the uncropped original of a cropped file sits in the trip folder itself, with the raw footage; the cropped one is in `Completed`. Never post both. Every outing folder holds `_from video` and `Completed`. |
| `Completed` | **the charter's finished set**: the good photos, the good videos and the compilations. Called `compilation video` until 2 Oct 2026. Its photos are what that charter's guests see on their trip page, and it is the first place the crew looks for a post. Coral curates it: mostly the best frames from the charter's video, plus any good photos actually taken. Raw recordings, soft or duplicate frames, and shots that are not about the guests (a dashboard, an empty wake) never go in. Frames from a CapCut recap may, when the footage is thin, with the mark cropped off. The montages Coral cuts land here, and mix in up to six of its good photos with a slow push-in and the same transitions as the clips. |
| `_Unsorted` | your sorting pile: footage the crew cannot tell is the business's, or cannot place in a charter or a dated day. **Never a source for anything published.** You go through it and clear it yourself. |

**Filenames carry what a folder cannot.** A file keeps its name when it moves, and loses its folder. So a finished cut carries its date, its subject, its shape and, where known, its place:

```
2025-07-20_tubing_wakeboarder-golden-hour_9x16.mp4
```

| Suffix | Shape | Used for |
|---|---|---|
| `_9x16` | upright | Reels, TikTok, Stories |
| `_4x5` | tall rectangle | Facebook and Instagram feed |
| `_1x1` | square | feeds |
| `_16x9` | landscape | the website, YouTube |

### Finding a photo

**Do not browse the folders. Ask the index.** Every photo is tagged with its package, place and activity, and a search returns matches with anything blocked already removed:

```
node "<Crew\_Scripts>\find-media.js" --activity tubing --clean
node "<Crew\_Scripts>\find-media.js" --package birthday
node "<Crew\_Scripts>\find-media.js" --location party-cove
node "<Crew\_Scripts>\find-media.js" --vocab        (every tag that exists)
node "<Crew\_Scripts>\find-media.js" --coverage     (which themes are thin)
```

Tags live in `Photos\_media-tags.json`. Tag a charter folder and every file in it inherits the tags. A file is never copied into a second folder to file it twice.

### Media that must not be used

Three things are never posted, and the index and the publishing checks enforce all three:

- anything on the **`doNotUse`** list in the tags file. Some entries block a whole file; others (`timeRestricted`) block only certain seconds of it.
- anything in a folder whose name contains **`[NDA]`**
- a boat the business does not own presented as one a guest can book

**Everything else is a candidate.** A watermark from the editing app, another company's boat in the background, a recognisable stranger: none of these is a reason to reject a picture. The crew has been far more often wrong in rejecting good material than in letting bad material through.

**Screen night footage at full size.** At thumbnail size a problem in a dark clip cannot be seen. Look at the frame that will be used at full resolution before it ships.

## 6.2 Photos guests send you

Guests send their own photos and video two ways:

- **`/share-your-photos`**, open to anyone, for a party member with no link of their own. It is no longer in the menu, and it tells booked guests to use Guest Login. They give their name and phone, pick their trip from a list of recent dates (packages only, never guest names), tick that you may use them, and upload. The booking is matched by phone number, which is a hint, not proof.
- **Their trip page** ([2.8](#2-8-the-trip-page)), through **Guest Login**, any time once the booking is confirmed. There is no phone to give and no list to pick from, because the link already says which booking it is. The exact consent wording is stored with each file.

Both take up to 2 GB a file into private cloud storage. Nothing is ever posted from there.

**Marketing → Photo Requests → Photos guests sent us** shows the latest 200: a preview, who sent it, the booking or trip, when consent was given, and whether it has reached the PC yet. Previews are links that stop working after an hour; the storage itself is never public. **Throw out** stops a file being pulled to the PC. The record stays, and **put it back** undoes it.

**Coral pulls them on each of her runs** (8:30am and 2:30pm), with `pull-guest-uploads.js` on the office computer, into **`Photos\00 Inbox\Imported from Website`**, then **removes each one from cloud storage**. That folder is named so that anyone can see the files came from guests and that there is no other copy. Inside it there is one folder per charter, named after the booking when it is known: `2026-09-19 Pat Example - NY-20260919-03` came from that booking's trip page and is certain; `… - phone matches NY-…` came from the share page, where the booking is a guess from the sender's phone; `_no charter given` waits for you. Who sent each file is in its name (`guest_tyler_…`), and is often not the person who booked. Coral's filing step then moves each folder's files into that charter's folder (the charter is decided by the booking the upload came through, never by the date stored in the photo, which can be wrong; a share-page guess that disagrees with the charter the guest picked waits for you), never deleting one, and the good ones go on into that charter's **`Completed\_guest media`** folder, which puts them on the guests' trip page and makes them available for posts. From then on the copy on the computer, and Drive behind it, is the only one. A file is removed only once the copy on disk has been measured and matches what storage held; anything that does not match stays in storage and the script says why. `--keep` leaves everything in storage. Using one in a post or on the website goes through the photo library and post approval like any other photo.

> **Why it works this way.** The free storage plan holds 1 GB across the whole account, and one glow night of guest video came to 2.4 GB. Left in storage, a single busy night would put the account over its limit, and the provider may then restrict the project. Your choice on 2 October 2026, over paying for a bigger plan, "for now at least".

Once a file has been pulled, the console and the guest's trip page show it as received but no longer preview it.

**Known limit:** no email arrives when a guest uploads. Look at the panel, or run the pull script.

**Known limit:** share-page uploads record when consent was given, not the words agreed to.

**Known limit:** a file you throw out is never pulled, so it is never removed from storage either, and it keeps counting against the 1 GB.

## 6.3 The public gallery

**Marketing → Media** manages the photo gallery on the website, grouped by package. Grouping shows at a glance which package is thin.

- Captions edit in place. **+ Add** adds a tile to that group.
- New images belong in the site's own `public/gallery/` folder, referenced as `/gallery/name.jpg`. Images hosted elsewhere disappear if that account ever lapses.
- Deleting a tile removes it from the site, not the image file.

## 6.4 Social posts: from draft to published

The content agent drafts posts from real fleet media; you approve them; the publishing agent puts them out. Every post is a card in **Marketing → Media Drafts**, boxed by the day it goes out, soonest first.

```
proposed ──► approved ──► scheduled ──► posted
    │            ▲             │
    ▼            │             ▼
needs work ──────┘          rejected  (Back to review restores it)
```

| State | Means |
|---|---|
| **Proposed** | drafted by the crew, waiting for you |
| **Needs work** | you sent it back with a reason; the crew will fix it |
| **Approved** | you said yes |
| **Scheduled** | approved and dated: **it will publish on its own** |
| **Posted** | live, with its link recorded |
| **Rejected** | you said no. Nothing is deleted. |

### What publishes on its own

**A post marked scheduled publishes on its own when its date and time come.** The publishing agent runs twice a day, late morning and evening, and puts out whatever is due by then. Giving a draft a date **is** the permission to post it: there is no second confirmation.

- **Approved with a date** is the same permission. The publisher moves those onto the schedule herself at the start of each run.
- **Approved with no date never goes out.** The content agent gives each of these a date every morning and says which dates she chose, so you can move one with **Reschedule**.
- Nothing else is ever published: not a proposed draft, not one that needs work, not a rejected one.

So the queue is safe to leave alone until a post's date arrives. **To stop a post, press Deny.** That is the only thing that takes it out of the publisher's way.

### On a card

- The photo or clip, or **No media attached** with a link to add one. A scheduled post with no media fails on the day.
- The caption in full, so you approve the words against the picture.
- The platform and the time.
- **Approve**, **Discuss** and **Deny** while it waits for you; **Discuss**, **Reschedule**, **Deny** and **Copy caption** once it is approved or scheduled.

Posted, rejected and past drafts sit in a collapsed group, as a record.

### The three review buttons

- **Approve**: the post goes ahead as it is. It is dated (by you, or by the content agent next morning) and publishes on its own.
- **Discuss**: you want the post, but something in it needs fixing. Pick what, add a note if you like, and press **Send back to Coral to fix**. It moves to *Needs work*; she fixes it and it comes back to you to approve. Discuss stays on the card after scheduling too, which is when "not that clip" tends to get noticed.
- **Deny**: the whole post is off. Pick why and press **Deny the whole post**. It moves to *Rejected* and never goes out. Nothing is deleted: **Back to review** on a rejected card brings it back.

| Under | Reason | Means |
|---|---|---|
| Discuss | **Wrong photo or clip** | the media does not match the post |
| Discuss | **Find a better one** | right footage, weak shot |
| Discuss | **Caption needs work** | wording, tone, hashtags or a wrong detail |
| Discuss | **Audio problem** | no sound, too loud or quiet, a song that could be flagged, or language that should not be heard |
| Discuss | **Wrong day or time** | right post, wrong slot |
| Deny | **Too similar to another post** | repeats something already queued |
| Deny | **Guest or privacy problem** | someone in it should not be, or it names the wrong guest |
| Deny | **Not right for us** | wrong message for the business |
| both | **Something else** | say what in the note |

Under Discuss, both photo-or-clip reasons also offer **Swap the media now**. For an audio problem Coral checks the sound, then re-exports the clip with its own audio, makes the post a Story (borderline audio goes to Stories), or uses a different clip.

> **Why it works this way.** The reasons are a fixed list so they can be counted. "Six of the last ten were rejected for the wrong clip" changes what the content agent does next week; ten free-text notes saying roughly that do not. Until 3 October 2026 both buttons opened the same list with both outcomes; you asked for Discuss to mean "fix it" and Deny to mean "deny the whole post together", and for an audio option.

There is no **I posted it myself** button any more (removed 3 October 2026): posting is automated, and the publisher marks her own posts and records their links.

**Every card records where its media came from**: which charter folder, which file, which second.

### Trip recaps waiting in CapCut

After each completed charter, once its `Completed` folder is curated, the content agent also builds a **recap as a project in your CapCut desktop library**, named after the charter with "(Claude)" on the end. Open it, change anything you like, and export it; it is not a post until you do, and it then goes through the queue like anything else.

- **Shots** are the charter's own vetted photos, found in their clips and held only while the camera stays on that scene. Riders are zoomed in on.
- **Music** comes only from your Music shelf: a CapCut project called *media shelf* holding tracks you added from **Commercial only**. The agent picks one that fits the trip (from the charter's tags), never the same song twice running, and cuts every shot on its beat. Add tracks to the shelf whenever it feels stale.
- The agent never opens or closes CapCut. **If CapCut is open when it runs, the recap waits** for the next run.

### Theme compilations waiting in CapCut

Straight after a recap, the content agent keeps **one compilation per theme** current in your CapCut library: tubing and wakeboarding, Party Cove, the Dam, the Island, swim stop, birthday, bachelor and bachelorette, Boatz & Glowz, night cruise, corporate. Each is cut from every folder whose tags name that theme (your words: *"a Party Cove collaboration of all charters we've had that have gone to Party Cove, pulling the best moments of each one of them"*), charters first, each charter before any gets a second shot, then your outings. A riding shot never goes in a place cut, because tubing happens out on open water, not in the cove; the night and glow cuts take only footage shot after 7:30pm. A theme is rebuilt only when a newly tagged charter has joined it, under a new dated name ("Party Cove compilation 2026-10-03 (Claude)"), so one you have edited is never overwritten. **Export the ones you like into `Photos\02 Charters\_Compilations`**: the crew drafts posts from there, through the queue as usual.

**Known limit:** a theme with fewer than four usable shots is not built. On 3 October 2026 that was night cruise (three usable night shots) and corporate (nothing tagged yet).

**Known limit:** CapCut has no official way in, so the projects are written in CapCut's own file format. A CapCut update could change that format and stop new recaps being built until the tools are updated; recaps already in your library are not affected.

**Known limit:** a 720p clip zoomed onto a rider is noticeably softer than the rest. That is the trade for seeing the rider at all.

## 6.5 What each platform will take

| | Photo | Video | Story |
|---|---|---|---|
| **Facebook** | yes | yes, as a Reel | yes, for upright (9:16) video only |
| **Instagram** | yes, feed only | yes | yes, for video |
| **TikTok** | **no** | yes | has no Stories |

- **Every post goes to the feed and to the Story** on each platform that has one, automatically. A photo gets no Story leg. If a Facebook Story refuses a video that is not upright, the feed post still goes out, though the publisher's email can make it sound as if the whole post failed.
- **Five hashtags, never six.** More than five makes Instagram reject the post outright while the draft still looks scheduled. The limit applies to every platform.
- **A published post cannot be edited from here.** Fix it in each app by hand; TikTok cannot be edited at all.
- **Borderline audio or language goes to a Story**, which disappears, not to the permanent feed.

## 6.6 Comments

**Marketing → Comments** is the queue of Facebook and Instagram comments nobody has answered.

| Colour | Waiting |
|---|---|
| **fresh** | under 6 hours |
| **waiting** | over 6 hours |
| **overdue** | over 24 hours |

**Nothing here posts on its own.** The crew writes a suggested reply into the box; you send it, edit it, or write your own. A comment reply is public, immediate and attributed to the business, so a person sends it.

- **Each comment shows the post it is on**, with a link. A comment on a post you put up by hand reads **post not identified**.
- **I answered this elsewhere** clears a comment you answered in the Facebook or Instagram app, which this screen cannot see. **Put it back** undoes it.
- **Every reply leaves a record**: what was said, under which post, and whether the suggested wording was changed.
- **TikTok comments are not here**: the publishing service cannot read them. Check them in the TikTok app.

A classifier is being built to decide which comments a machine could safely answer. **It sends nothing**, and will not until it has been run in a watch-only mode and you approve it.

## 6.7 Messages

**Marketing → Messages** is the direct-message inbox from Facebook and Instagram, built the same way as Comments.

### Messages answer themselves; comments do not

**Most messages get an automatic reply within seconds**, from an automation in the publishing service, not from any crew member. It is a fixed message that asks for a phone number and points to the website. It never quotes a price, a date or a seat count. It fires on keywords such as book, price, available, seat, open, the days of the week, and "how much".

> **Why it works this way.** A comment speaks to everyone reading the thread, so caution matters most there. A message speaks to one person and can be corrected in the next sentence, so speed matters most there.

**Keyword matching is blind.** "Your prices are a scam and I want a refund" contains *price*. So every thread is checked afterwards, and one the machine should not have answered is flagged in red: **Answered automatically, and should not have been**. Read what went out before replying.

These are always held for you, and the reason shows on the card:

| Held because | Meaning |
|---|---|
| **safety** | someone may have been hurt, or something damaged |
| **legal** | lawyers, insurance, liability, a refund or a chargeback |
| **complaint** | it reads as a grievance |
| **money already moved** | it asks to change, refund or move something paid for |
| **solicitation** | a sales pitch, not a guest |
| **NDA** | it touches a charter under a confidentiality agreement |
| **photographs** | someone's picture, or a request to take one down |

Long messages, ones asking more than two questions, and ones nothing in the system can answer are held too. **An unrecognised message is not a safe message.**

The crew drafts a reply for each held thread; you send it or write over it. If the guest writes again first, the draft is marked stale and not pre-filled. **I answered this elsewhere** works here as on Comments, and re-opens on its own if they write again. It has no effect on the automatic reply, which can only be switched off in the publishing service.

### Trip page messages

**Trip page messages** sit at the top of the tab: booked guests writing from their own trip page ([2.8](#2-8-the-trip-page)). They count toward the tab's number, and you are emailed when one arrives.

- **A draft is waiting when the booking itself has the answer**: the departure time, the meeting point, what is included and what to bring. The site writes it from the booking and shows it as Pearl's. It quotes nothing the guest's own page does not already say.
- **Everything the message rules above hold is held here too**, and so is any question about price or another date, because on a booked trip those change the booking or the bill. The reason shows on the card.
- **Nothing is sent until you press Send** and confirm. The card says whether the guest will get an email copy.
- **Handled elsewhere** clears a message you answered by phone or text. It sends nothing, and the thread comes back if they write again.

**Siren drafts for the held ones** on each run, so a held trip page message usually has her draft by the next morning or evening. Hers replaces the site's for that thread. Like every draft, it waits for you to send it.

# Part 7 — The AI crew

## 7.1 Who they are and when they run

Eight agents and two routines run on a schedule on the office computer. **None of them post, spend or contact a guest without you**, and only one acts outside the business at all.

| When | Who | What she does |
|---|---|---|
| Daily, 8am | **Nauti Penny** · Accounts Receivable | money in: payouts against the ledger, and money held for trips that never ran. Adds new GetMyBoat bookings from their confirmation email ([3.6](#3-6-platform-bookings-boatsetter-and-getmyboat)). Keeps the business inbox in order. |
| Daily, 8:30am and 2:30pm | **Nauti Coral** · Content Producer | pulls what guests sent from the website, files new footage, curates each charter's `Completed` folder (which the guests see), builds each new charter's recap in your CapCut library ([6.4](#6-4-social-posts-from-draft-to-published)), drafts posts from real fleet media, audits the post queue, dates approved posts. The afternoon pass repairs anything that failed to publish. |
| Fri–Mon, 9am | **Nauti Joy** · Guest Relations | who to ask for a review, new crew-list signups, guests owed a charter |
| Fri–Mon, 9:30am | **Nauti Reef** · Revenue Growth | money the business is not collecting, as one to four ideas |
| Fri–Mon, 10am | **Nauti Shelly** · Accounts Payable | what is paid for against what is used |
| Daily, 10:30am | **Nauti Nova** · Market Research | the outside world: rules, grants, platforms. Reports only on Mondays, and usually reports nothing. |
| Daily, 10:45am | Crew Standup (routine) | files a status card for all eight, so no card is blank |
| Daily, 11am and 8pm | **Nauti Pearl** · Chief of Staff | reads everything, keeps the board, decides what reaches you. The 8pm run is a short evening check. |
| Daily, 11:15am and 7:15pm | **Nauti Siren** · Publishing & Brand Safety | the last check before anything is public, then publishes what is due. Drafts replies to comments, held messages and held trip page messages. |
| Hourly, 8am–9pm | Comment Watch (routine) | drafts replies to new comments |

Times are when each run is scheduled; a run can start up to about a quarter of an hour later. The office computer must be on for them to run.

## 7.2 What none of them may do

- Write to any table except the to-do board and their own activity log.
- Contact a guest. (The automatic message reply in [6.7](#6-7-messages) is a feature of the publishing service, not a crew member.)
- Spend, refund or change a price.
- Publish anything, except Siren publishing posts **you** have approved and dated.

## 7.3 The Board

**Overview → The Board (To-do List)** is the shared workspace between you and the crew. They write to it, read each other's items, and hand work over by naming another agent in an item.

- Type into **Add a task…** and press **+** to add your own.
- Items are ranked **High / Medium / Low**, not by date. Crew items carry their own priority; yours are ranked by what they say. Money held, security, legal and overdue go High, and anything due within two days is promoted. High starts open; Medium and Low fold open when clicked.
- **Long items fold**: the claim and its first two lines show, with *+ N more lines* and *N notes* for the rest.
- Tick an item to mark it done. **✕** deletes it, after a confirmation, and cannot be undone. Done items fold into **N done**.
- Every crew item is **signed**, for example `[PENNY · T2]`. An unsigned item means you wrote it. **T1** is urgent, **T2** worth your attention, **T3** background.
- **Pearl keeps the board**: she closes what the data shows is done, folds duplicates together, and tidies stale low items. She never closes an item you wrote unless it is genuinely finished.

## 7.4 Status cards and voices

Each agent has a card with her latest status, filed every morning **even on days she does not run**. A card showing a date instead of today means she has not filed today.

**Click an agent's face to hear her read it** in her own voice. Clicking again stops her; clicking another agent stops the first. Nothing in the console ever speaks on its own. Each click costs a little, because speech is billed per character; replaying the same status is free.

| | Voice | How she writes |
|---|---|---|
| **Pearl** | Alice | dry and unhurried; tells you what you would rather not hear |
| **Coral** | Jessica | keen, and hardest on her own work |
| **Siren** | Charlotte | flat and literal on purpose: she is the gate |
| **Joy** | Lily | warm, a little wounded on the guests' behalf |
| **Penny** | Matilda | charming and teasing, proprietary about the books |
| **Reef** | Laura | the enthusiast, selling you an idea |
| **Shelly** | Sarah | dry and sceptical about what you pay for |
| **Nova** | River | sparse; speaks rarely |

**One limit on all of them: tone lives in the framing, never in the finding.** Anything serious (money held, a booking at risk, anything legal, insurance or safety) is said straight, with no colour. Statuses are written to be heard: full month names, plain times, no database ids or file paths.

### When a card says something went wrong

| Card shows | Means | Do |
|---|---|---|
| **Waiting on you** | she needs a decision only you can make | read the card and answer |
| **failed** | the run went wrong, or the card is a logging artefact | read the detail: a real failure says what broke |
| **Stopped mid-run** | the run was cut off, usually by a permission prompt nobody answered | in the Claude app's scheduled routines, choose **Run now** |
| **No standup filed** / **gone quiet** | nothing filed recently | check the computer was on, then **Run now** |

A card can also carry the value `status`. That is the daily card itself, not a state. There are many of these and they are correct.

## 7.5 Who checks whom

Everything routes through Pearl. Coral reports to Siren, Siren to Pearl, and Pearl to you. The one loop that runs backwards is Coral checking what Siren actually published, because Siren is the only agent whose mistakes go public. Joy, Reef and Nova are deliberately not reviewed: putting a reviewer in front of an agent that only proposes adds delay and no safety.

Pearl reports upward to the owner's main assistant, which coordinates this business alongside the owner's other projects.

## 7.6 Where their instructions live, and how to change them

Everything the crew reads is in **`AI & Website\Crew`** in the business folder, backed up by Google Drive:

| Folder | Holds |
|---|---|
| `_Global Rules` | the rulebook every agent reads first (`00`), rulebook topics opened when needed (`10`–`13`), and pages on the business, the owner, releases, and files and Drive (`20`–`23`) |
| `Nauti <Name>` | one per agent: **Briefing** (what, when, why), **Voice**, **Skills** (one file per part of the job), **References** |
| `_Routines` | the standup and Comment Watch |
| `_Scripts` | every command the crew runs, with a map of who uses which |
| `_Old` | the instructions as they were before this layout, kept as history |

Each scheduled task's own instructions file (`SKILL.md`) is only a list: which Crew files to read every run, and which only when needed.

**To change what an agent does:**

1. Edit her file in the Crew folder, not the list.
2. Run the consistency check (see [9.4](#9-4-the-checks-that-keep-it-honest)). It fails if a list names a missing file, or if a Crew file is listed nowhere and so would never be read.
3. A change to how an agent works is a revision; it goes out with the next release.

## 7.7 Working with Claude

Beyond the scheduled crew, you can work with Claude directly in a session on the office computer. It reads the same Crew folder and the same database.

- **Forward a guest's enquiry** (a screenshot is enough) and it logs the booking and drafts your reply.
- **Ask for a resync** when a payment and a booking disagree.
- **Ask for a change** to the website or a crew instruction. It will make the change, check it, and ask before cutting a release.

# Part 8 — Fleet and on the water

## 8.1 Boats and docks

Each boat is set up in the system with its capacity, its slip, whether it has an engine-hour meter, and its dock position. **Each boat can live at its own dock**, so the meeting point, the run-for-home weather check and the confirmation email are all worked out per boat, never from one business-wide address. This fleet's boats and docks are in [Appendix C](#appendix-c-this-installation-the-nauti-yachti).

## 8.2 The On the dock page

**📱 On the dock** (`/admin/ask`) is built for a phone at the boat. Add it to your home screen. If you are not signed in it asks for the passcode.

At the top, a strip shows the charter **on the water now** or **up next**: countdown, guest, boat, party size, hours, when it is due back, add-ons, and a tap-to-call number.

Four tabs: **⛈ Weather**, **Arriving**, **Reviews**, **Boat log**.

### Weather: can I get back before it hits?

The weather check runs when the page opens, using your phone's location and the boat that is out (or next out). **Can I get back before it hits?** runs it again.

| Verdict | Means |
|---|---|
| **clear** | nothing wet in the window |
| **go** | rain is coming and you have 20 minutes or more to spare |
| **tight** | under 20 minutes to spare: go now |
| **shelter** | you will not beat it; find cover |
| **unknown** / **unavailable** | no position, or the forecast could not be reached |

It also shows the distance and bearing to that boat's dock, minutes home, wind and gusts, a three-hour rain strip and the radar map.

**It is weather timing, not navigation.** It does not know where stumps, shallows or no-wake zones are.

**Nearest places.** Save useful spots from the water (fuel docks, covered shelter, ramps, hazards) with **save this spot**, from your position, a tap on the map or typed coordinates. When rain is near, covered shelter is listed first. Each boat's **dock** is set here too, from your position or typed coordinates, after a confirmation.

## 8.3 Arriving guests and the gate code

**Arriving** lists today's and tomorrow's booked charters, earliest first.

**Text the gate code** opens a message to the guest with the dock address, the gate code, parking, and when to arrive. It is marked sent the moment you tap it, shown as *✓ Sent* with an **undo** link.

- **The gate code is only ever sent by text, on the day.** It is never emailed and is not stored in any file: it is set as a private setting on the website. If it is not set, the tab warns you.
- Tap the number line to choose which number to text, set a default, or add another person's number to the booking. If the booking has no number, the first one you add becomes its phone.
- Phone only: on a computer the button explains and does nothing.

## 8.4 Reviews on the phone

**Reviews** lists completed charters with a phone number, warmest first, labelled by how fresh the trip is:

| Label | Days since the trip |
|---|---|
| **Ask now** | up to 3 |
| **Good window** | up to 14 |
| **Late but fine** | up to 90 |
| **Cold** | over 90 |

Each guest has **Text <name>** (opens the message and marks them asked), **Copy wording**, and **Mark asked** (records it without texting). **Asked** lists who has been asked, with **Undo**. At the foot is a script for asking in person and a link to your review page.

## 8.5 Boat log: hours, fuel and service

**Engine hours.** Pick the boat. For a boat with an hour meter, enter the meter reading; for one without, enter the hours run this trip, which are added to its total. **Log it** saves the entry. A reading lower than the last one is refused.

**Fuel.** Pick the boat, enter gallons and/or the dollar total, optionally the hours at fill-up and a note, then **Log the fill-up**. **A dollar total writes the fuel expense into the ledger.**

**Service checks.** Items are grouped by boat. Tap one to confirm it was done today at the boat's current hours.

Logging works from a computer too; only the texting buttons need a phone.

## 8.6 Maintenance

**Boat → Maintenance** holds each boat's service items, tracked against elapsed months or engine hours, plus the hours and fuel history. Items turn overdue on their own.

**Nothing hour-based can be judged until hours are logged.** Until readings exist, the panel shows *nothing overdue*, which looks exactly like a healthy fleet. The Overview says *No maintenance can be judged* instead. Log hours after every outing (see [8.5](#8-5-boat-log-hours-fuel-and-service)) and the intervals work on their own.

# Part 9 — Running and protecting the system

## 9.1 Versions and releases

The version badge says which release you are running. It exists for one moment: something is wrong and you need to know what to go back to.

**The crew doing their job is not a revision.** Drafting, publishing, filing a status, a booking landing, a photo being tagged: that is the system running. A revision is the system itself changing.

| Size | Moves | When |
|---|---|---|
| **Small** | 2.13.0 → 2.13.1 | wording, formatting, a colour or a label. Nothing behaves differently. |
| **Moderate** | 2.13.0 → 2.14.0 | an agent's logic or a workflow changes |
| **Large** | 2.13.0 → 3.0.0 | a whole layout, or a new large-scale idea |

Always three numbers. Unsure between two sizes? Take the smaller.

**Nobody cuts a release without asking you.** A release draws a line under a batch of work and only you know where the batch ends. The routine is: finish the work, say what changed and what size it looks, and ask *"are you done with changes?"*

**A release produces:**

1. a version number in the code, tagged on GitHub, kept forever;
2. one compressed backup in `AI & Website\releases`, holding everything the code does not: the crew's instructions and scripts, the schedules, the permission rules, the hand-written skills, this manual and the database structure. Only the newest is kept, and only once it exists;
3. an entry in `CHANGELOG.md`, written to be read on a bad day. If it cannot tell you whether to go back to that version, it is not finished.

The full rules are in `AI & Website\VERSIONING.md`.

## 9.2 Where everything lives

| What | Where | Backed up by |
|---|---|---|
| Business files: photos, finance, legal, releases | `Documents\_MyFiles\_The Nauti Yachti LLC` | Google Drive |
| The crew's instructions and scripts | `…\AI & Website\Crew` | Google Drive |
| The website and console code | `Documents\Nauti-yachti-app` | GitHub, every version tagged |
| The libraries the crew scripts need | `C:\Users\<you>\.node_modules` | nothing; rebuilt after a restore (see [9.3](#9-3-backups-and-disaster-recovery)) |
| Keys and passwords | a private secrets file outside every synced folder | **nothing**: keep your own copy somewhere safe |
| Bookings, money, posts | the Supabase database | Supabase, plus snapshots in `AI & Website\db-backups` |

**Google Drive cannot sync a code project.** A folder holding `.git`, `node_modules` or build output makes Drive give up on the whole folder, and nothing announces it beyond a red mark. So code lives outside Drive, and the consistency check refuses a release if any of those turn up in the business folder.

**Never write a video straight into a Drive folder.** Drive can start uploading a file that is still being written and get stuck with an empty copy in the cloud. Render into a scratch folder and move the finished file in. The montage tool does this already.

**Outdated files go into `_Old`, not the bin.** Most folders have an `_Old` folder; the owner decides later what goes for good. Anything in `_Old` is history, never a current fact.

## 9.3 Backups and disaster recovery

`AI & Website\DISASTER RECOVERY.md` is the full procedure for rebuilding on a new computer. In outline:

1. Install Node, Git and Google Drive for desktop, and let Drive restore the business folder.
2. Clone the code from GitHub.
3. Restore the crew from the newest release zip; its `RESTORE.md` says which files go where.
4. Rebuild the secrets file. **Nothing else can do this for you.**
5. Rebuild the crew scripts' libraries: copy `Crew\_Scripts\package.json` and `package-lock.json` into an empty folder, run `npm install`, and copy what is inside the new `node_modules` into `C:\Users\<you>\.node_modules`.
6. Recreate the scheduled tasks from the release's `schedules.json`.
7. Run the checks in [9.4](#9-4-the-checks-that-keep-it-honest).

**A release is only as good as its date.** If the crew has changed since the last one and no release has been cut, that work exists in one place only.

## 9.4 The checks that keep it honest

| Check | Run | Proves |
|---|---|---|
| **Consistency** | `node scripts/check-consistency.js` | every task a document names exists; every script a brief runs exists; every Crew file is listed and every listed file exists; the console's tabs match this manual; the roster matches the schedules; no document has been pasted into itself; nothing Drive cannot sync is in the business folder; the recovery guide names the newest release |
| **Manual freshness** | `node scripts/check-manual-fresh.js` | the PDF behind the **Manual** button matches this text |
| **Tests** | the `scripts/test-*.js` files | pricing, add-ons, bookings, the board, triage rules and more each behave as intended |
| **The morning output check** | run by Pearl every morning | nothing is hurting a guest right now: unpaid confirmed bookings, money not on the books, duplicates, missed confirmations |
| **Health check** | `node scripts/health-check.js` | every outside service answers |

All of them should be clean before a release.

## 9.5 Setup: packages, add-ons and coupons

**Setup → Packages & pricing.** Each package's pricing type and prices: per-package prices, per-guest rates, and the hourly grid for each boat, weekday and weekend. **Every change is logged in the price history.** This is the only place a price is ever changed: the website, the payment page and the checkout all read from here.

**Setup → Add-ons.** Each extra's name, price and description. Which add-ons come free with which package is set in code (`lib/addOns.js`), and `scripts/test-addons.js` checks the pricing after any change.

**Setup → Coupons.** Each code's discount (a percentage or a fixed amount), end date, usage limit and whether it is for returning guests only. A code with both an end date and a usage limit is one the tap-to-text messages can offer the whole contact list (see [5.1](#5-1-contacts)). Codes kept for particular people should have no end date or no limit, so they are never broadcast.

## 9.6 Names that look out of date

A few internal names still say "Jarvis", the system's original name, on purpose: the board's database table, the crew's service key and the board's web address. Renaming them would mean changing live infrastructure in exact step for no benefit to anyone. If you see one in an error message, nothing has been forgotten.

# Part 10 — Troubleshooting

## 10.1 Bookings and payments

| Symptom | Likely cause | Fix |
|---|---|---|
| A guest says they paid; the booking says unpaid | the payment notice from Stripe was missed or arrived before the booking existed | ask Claude to resync it ([3.13](#3-13-when-a-payment-and-the-console-disagree)) |
| A guest paid and got no confirmation | no email on file, or a send failed | resync, which sends it; or run `send-missing-confirmations.js` |
| **Text payment link** is missing on a row | the row has no package or no price | add both; the button appears |
| A completed charter has no income | it had no price | add the price; the Overview stops flagging it |
| Income shows twice for one Boatsetter charter | it is not a duplicate: Boatsetter pays in legs | nothing to fix |
| The same guest is on the list twice | they were logged by hand and then booked online | judge the pair, then merge ([3.8](#3-8-when-the-same-guest-appears-twice)) |
| A day shows partly booked but no window is shown | a booking on it has no start time | add the time to the booking |
| A guest says the site told them a boat was not available | the day is blocked, full, or lacks the hours they asked for; or another guest is on the payment page for it | check **Availability**; offer fewer hours, another boat or another date ([2.7](#2-7-the-availability-check)) |
| An **ACTION** email: a guest paid for a boat already taken | two guests got through at the same instant, or you logged a booking while they were paying | move them and mark the booking booked, or refund them in Stripe |
| A refund made in Stripe did not change the booking | the site's webhook is not subscribed to `charge.refunded` | add that event in Stripe under Developers → Webhooks, then set this one by hand |
| A gift certificate code is refused | it is unknown, voided, expired or used up; the message says which | check it in **Money → Gift certificates** |
| A coupon's uses ran out faster than bookings | abandoned checkouts count as a use | raise the limit, or watch it |
| A guest cannot book the seat-sale event; its page says the next date is coming | the night has passed, so sales closed by themselves | give the package its next date when you want to sell ([2.6](#2-6-seat-sale-events)) |
| A guest was charged twice for one booking | two checkouts, both paid: a known, accepted limit | refund the second charge in Stripe, then cancel the extra row by hand ([2.2](#2-2-how-a-guest-books)) |
| Undid a completion by mistake and income is still there | income is not removed when the status changes back | delete that ledger row by hand |
| A guest says their trip page link does not work | it was copied incompletely | send it again from **trip page ↗** on their row, or have them use `/trip` ([2.8](#2-8-the-trip-page)) |
| A guest cannot get in at `/trip` | the phone they typed is not on the booking | add their number to the booking, or send them the link |

## 10.2 Posts, comments and messages

| Symptom | Likely cause | Fix |
|---|---|---|
| An approved post never went out | it has no date | give it one with **Reschedule** |
| A scheduled post never went out | more than five hashtags, no media, or a photo on TikTok | open **Discuss** on the card, or check the publisher's note |
| The publishing service emails "your post has failed to publish" | often only the Story leg failed (a video that was not upright) | check the feed before worrying |
| A comment or message stays red after you answered it | you answered in the app, which this screen cannot see | **I answered this elsewhere** |
| A message has a red **Answered automatically** flag | the keyword auto-reply answered something it should not have | read what went out, then reply yourself |
| TikTok comments are not in the console | the publishing service cannot read them | check them in the TikTok app |

## 10.3 The crew

| Symptom | Likely cause | Fix |
|---|---|---|
| A card says **Stopped mid-run** | a permission prompt nobody answered, or the computer slept | **Run now** in the Claude app's scheduled routines |
| A card says **failed** but the work got done | a logging artefact | read the card's detail; an artefact has a status word where the title belongs |
| No runs at all this morning | the office computer was off or asleep | wake it; each task runs at its next time, or use **Run now** |
| An agent ignores a new skill file you added | the file is not on her list | add it to her `SKILL.md` list; the consistency check reports unlisted files |

## 10.4 Files, email and the system

| Symptom | Likely cause | Fix |
|---|---|---|
| A folder shows a red mark in Explorer | Google Drive cannot sync something in it: a code folder, or a file stuck mid-upload | see [9.2](#9-2-where-everything-lives); never write videos straight into Drive |
| A reply sent to the bookings address vanished | that address can send but cannot receive | replies go to the business Gmail address |
| A file's date looks wrong | names can record when a file was saved, not when it was shot | trust the date inside the file, not its name |
| The bank balance looks old | it is a reading typed in, not a live figure; amber after a week | record a new reading |
| The consistency check fails | a document, task or file no longer matches the system | read its message: it names the file and the line to fix |
| The share page or a trip page says uploads are not switched on | the website's settings lack the storage keys | add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the website's settings and to the secrets file on the office computer, then redeploy |

# Appendices

## Appendix A — Quick reference

| I want to… | Go to |
|---|---|
| see what needs me today | Overview → **Needs attention** |
| log a booking from a text or call | Bookings → Bookings, or forward it to Claude |
| send a guest a payment link | Bookings → Bookings → **Text payment link** (phone) |
| record that a charter happened | Bookings → Bookings, set **completed** (writes the income) |
| block a day | Bookings → Availability |
| text a past guest about an offer | Bookings → Contacts (phone) |
| log a receipt | Money → Income & expenses |
| check a charter's money is on the books | Money → Reconciliation |
| pull tax figures | Money → Tax Report |
| approve, move or stop a post | Marketing → Media Drafts |
| answer a comment or message | Marketing → Comments / Messages |
| ask for a Google review | On the dock → Reviews (phone) |
| send the gate code | On the dock → Arriving (phone) |
| log hours, fuel or a service | On the dock → Boat log |
| change a price | Setup → Packages & pricing |
| make a coupon | Setup → Coupons |
| change what an agent does | `AI & Website\Crew`, then the consistency check |

## Appendix B — Glossary

| Term | Meaning |
|---|---|
| **Inquiry** | someone asked about a charter; not yet booked |
| **Booked** | confirmed and holding its date, paid or not |
| **Lapsed** | an inquiry that never became a booking |
| **Owed** | paid for, never sailed, no new date yet |
| **Tentative seat** | a seat on a seat-sale event held by an inquiry, a lapsed inquiry or an owed charter: counted against capacity, shown apart from confirmed |
| **Completed** | the charter ran; its income is written |
| **Refunded** | it was a booking, and the money has gone back |
| **Hold** | the 35 minutes a guest on the payment page keeps their boat and hours |
| **Booking number** | `NY-YYYYMMDD-NN`; never changes |
| **Trip page** | a guest's own page for one booking, opened by a signed link; anyone holding the link can use it |
| **Mirror row** | the Bookings row created for a website booking, sharing its number with the inquiry |
| **Lead source** | where the guest found you |
| **Booking channel** | who took the booking: a platform, the website, or you directly |
| **How paid / origin** | how the money arrived, on the booking and on each ledger row |
| **Held, not earned** | money taken for a trip that has not happened |
| **Draft** | a social post waiting for a decision |
| **Scheduled** | an approved, dated post: publishes on its own |
| **The Board** | the shared to-do list between you and the crew |
| **T1 / T2 / T3** | how urgent a board item is: urgent, worth your attention, background |
| **Launcher** | an agent's `SKILL.md`: the list of Crew files she reads |
| **Release** | a numbered, backed-up version of the whole system |
| **`_Old`** | a folder for retired files; history, never current fact |

## Appendix C — This installation: The Nauti Yachti

Everything in this appendix belongs to this one business. A new operator replaces it (see Appendix D).

**The business.** The Nauti Yachti LLC runs captained charters on Lake Conroe, Texas. Registration numbers are in `01 Formation & Legal\Business Information - The Nauti Yachti LLC`.

**The fleet.** Capacities include the captain. The live figures are in the database.

| Boat | Type | Capacity (guests) | Dock | Hour meter |
|---|---|---|---|---|
| **Nauti Explorer** | Monterey Explorer deck boat, red, white and blue | 14 (13) | Pearl Bay, east side: a gated private dock | no |
| **Nauti Yachti** | 2006 Sea Ray 290 Sundancer | 12 (11) | about three miles west-southwest of Pearl Bay | yes |
| **Nauti Islander** | make and model not recorded yet | 8 (7) | with the Yachti | no |

The Explorer's port side still carries its previous owner's name, "Canter Splash". It is our boat and its photos are fine to post. Dock addresses are private settings on the website, one per boat; the gate code is set the same way and sent only by text.

**Packages.** Tubing / Wakeboarding (the default when no occasion is named), Birthday Party, Bachelor / Bachelorette, Corporate Outing, Night Cruise, Party Cove Package (all priced by the hour, by boat), Wake Surfing Lessons (priced by group size), and **Boatz & Glowz** (a glow-party night sold by the seat).

**Add-ons**, as of October 2026 (live prices in Setup → Add-ons):

| Add-on | Price | Free with |
|---|---|---|
| Balloon Package | $40 | Birthday Party |
| Champagne on Ice | $25 | Bachelor / Bachelorette |
| Full Decoration Package | $60 | — (includes the balloons and the champagne) |
| Grill Service | $25 | Night Cruise. Cooking only; the guest brings the food, and the boat must be at anchor. |

**The glow night.** Boatz & Glowz is this installation's seat-sale event ([2.6](#2-6-seat-sale-events)): 31 guest seats across the three boats. It meets at **Scott's Ridge boat ramp** for every boat. Check-in 4:30pm, lines off 5:00pm, back around midnight, 21 and over. The times live in `lib/glowEvent.js`; change them there and never in copy.

Seat sales closed after the night of 19 September 2026. There is no next date yet: the owner's call, possibly May. Until one is set, the page collects crew-list signups only, and the crew offer no seats, prices or seat counts in posts or replies.

**The lake.** Charters stop at three places, which are different places: **Party Cove** (the raft-up), **the Island** (beaching and swimming) and **the Dam**.

**Media rules specific to this business:**

- The **Lake Bryan charters of June 2026 are under a confidentiality agreement**: no media from them, ever.
- One glow clip from September 2025 is withdrawn for nudity, and another is held. Both are on the `doNotUse` list.
- The sold **Nauti Lexi** may appear in old footage but is never offered as a boat to book.
- All faces are allowed, strangers included.

**Accounts.**

- Instagram posts tag the owner's personal accounts as collaborators, set in `lib/socialPosting.js`.
- The automatic message reply is two automations in the publishing service.
- `bookings@thenautiyachti.com` sends but cannot receive. Replies go to the business Gmail address.
- Banking is moving to a new business checking account in October 2026; see the board for the console's account warning, which needs updating to match.

**Prices on the booking platforms** are managed on the platforms themselves, separately from the website's prices.

## Appendix D — Setting this up for another business

This system is built to be handed to another charter operator. **What transfers is the machinery**: the website, the console, the booking and payment logic, the ledger, the media pipeline and the AI crew. **What does not transfer is the business**: boats, prices, photos, guests and accounts.

**What a new operator replaces:**

| Replace | Where |
|---|---|
| name, domain, lake, phone | `business.config.json`, then `node setup.js` (dry run) and `node setup.js --apply` |
| boats, packages, prices | the database seed, then **Setup** in the console |
| the words on the site | `lib/packageContent.js` and `lib/faqContent.js` |
| photos | the Photos library, tagged rather than re-filed |
| keys and accounts | a new secrets file and the website's private settings |
| trip page links | the web address in `lib/tripLink.js`, and a `TRIP_LINK_SECRET` of their own |
| this manual's Appendix C | rewritten for their business |
| the crew's business pages | `Crew\_Global Rules\20 The business.md` and `21 The owner…` |
| crew names and voices | optional: the setup step can rename them |

**What never goes with it:** guest data, database backups, release archives of this business, and this business's photographs. The distribution build leaves all of these out and refuses any file that contains a key.

**Before a new operator takes a booking:** run the consistency check and the health check. Both should be clean.

**Known spots that still carry this business's details in code**, to clear before distributing: the gate-code text's signature, one Overview footnote, and the phone number in the trip page's error messages. The first two are on the board.

