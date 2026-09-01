# The Nauti Yachti — Owner Console Manual
For employees using the admin dashboard at thenautiyachti.com/admin. Ask the owner for the login passcode — this manual doesn't include it.

---

## Getting in

Go to **thenautiyachti.com/admin** and enter the passcode. You'll land on the **Inquiries** tab by default. Tabs run along the top — click any tab name to switch. If you ever get logged out, just re-enter the passcode.

---

## 1. Inquiries

Every lead that comes in through the website's own booking form lands here (not Boatsetter/GetMyBoat — those show up in **Bookings** instead).

Each card shows the guest's name, package, contact info, requested date/vessel/party size, and price. On the right:
- A **payment badge** (Unpaid / Paid / Refunded) — this updates automatically from Stripe, you don't set it by hand.
- A **status dropdown** — this one you DO manage:
  - **New** — just came in, nobody's responded yet.
  - **Lapsed** — we never heard back / it fizzled out. Use this instead of just leaving it as "New" forever.
  - **Pending** — we're actively talking with the guest, working out a date or a detail, not locked in yet.
  - **Booked** — confirmed, they're on the calendar.
  - **Completed** — the charter already happened. Mark bookings as Completed after the trip is over — don't leave them stuck on "Booked" forever.
  - **Cancelled** — didn't happen. When you pick this, a refund section appears — choose **Full refund**, **Partial refund** (and enter the dollar amount), or **No refund**. This is our own record of what actually happened with the money, separate from whatever Stripe shows.

**The general flow:** New → (Lapsed or Pending) → Booked → (Completed or Cancelled).

---

## 2. Bookings

This is the master list — every reservation from every source (our own site, Boatsetter, GetMyBoat, Facebook, Instagram) combined in one table.

**Columns:** Booking ID, Name, Email, Vessel, Start time, Duration, Party size, Price paid, Source (which platform), Status, and an Actions column to change status or delete.

**Booking ID format:** `NY-YYYYMMDD-NN` — the date's baked right into the ID, so you don't need a separate date column to know when a booking is.

**Filter and sort:** buttons across the top let you filter to just Pending / Booked / Completed / Cancelled, and a dropdown lets you sort newest-first, oldest-first, or grouped by status.

**Logging a new booking manually** (e.g. you got a call, or a Boatsetter/GetMyBoat reservation that isn't in the system yet): use the form on the left — vessel, date, start time, duration, guest name/email, party size, platform, and status. It gets a real booking ID automatically.

**Editing an existing row:** most fields (email, start time, price paid) are click-and-type, right in the table — just click out of the field (or hit Tab) to save.

**Important:** marking a booking **Booked** or **Completed** blocks that date on the public availability calendar so nobody else can double-book it. **Cancelled** does not block it. Setting a manual booking's date/hours is what determines whether a day shows as "partial" or "fully booked" to customers.

---

## 3. Packages & Pricing

Every package (Tubing, Birthday, Bachelor/Bachelorette, Night Cruise, Party Cove, Boatz & Glowz, Corporate, Wake Surfing) is listed with its pricing. Click into a price field and type a new number, then click away to save.

Different packages price differently — some are a flat number, some are per-guest, some vary by vessel/day-of-week/hours, and some are tiered by group size. The console shows whichever inputs are relevant to that package automatically.

**Price change history:** at the bottom of this tab there's a collapsed **"Price change history"** button. Click it to see every price edit ever made — what changed, from what to what, and when. This is for tracking down a pricing discrepancy after the fact — it's internal only, customers never see it.

---

## 4. Add-ons

These are the extras customers can select when booking (champagne, decorations, etc.).

- **Add a new one**: fill in the form on the left (name, price, unit like "per bottle," an optional blurb) and hit **Add add-on**.
- **Edit** name, price, unit, or blurb: click directly into the field.
- **Hide from site**: if you're temporarily out of something (e.g. no champagne in stock), click this instead of deleting — it stays in the system, just doesn't show to customers until you click "Show on site" again.
- **Delete**: moves it to a collapsed **Archived** section at the bottom, it doesn't erase it. Click **Restore** there to bring it back if you ever need it again.

---

## 5. Coupons

Same idea as Add-ons: create a code, set a percent or fixed-dollar discount, an optional max-uses cap and expiration date.

**"Returning guests only"** checkbox: if checked, the code only works for someone whose email matches a previous *paid* booking through our own site. It won't recognize a past Boatsetter/GetMyBoat guest automatically (those platforms don't give us a usable email) — if a repeat guest from one of those platforms wants the code, you'll need to verify them yourself (check the Bookings tab for their name) and either give them the code anyway or set up a one-time code just for them.

**Delete** here also archives (doesn't erase) — same Archived-section-with-Restore pattern as Add-ons.

---

## 6. Availability

A calendar per vessel, two months at a time. Click any day to toggle a full-day block. Color key at the top:
- **Purple/solid** = open
- **Orange/striped** = partially booked (has a reservation, but not enough hours to fill the whole day)
- **Dark/blocked** = fully closed

You generally don't need to click days by hand for real bookings — marking a booking "Booked" or "Completed" in the Bookings tab handles that automatically. Use the calendar directly for things like maintenance days, personal use, or blocking a date for any other reason.

---

## 7. Media & Media Drafts

**Media** tab: edit captions on existing gallery photos.

**Media Drafts** tab: this is the review queue for social media content. Some posts get drafted automatically (a daily automated pass pulls a real photo and writes a caption) — nothing is ever posted to real social media without a human clicking **Approve** here first. You can also **Reject** a draft (with a note saying why) or mark it **Discussing** if you want to talk it over before deciding.

---

## 8. Testimonials

Customer reviews submitted through the site sit here as **Pending** until approved. Approve to have them show up on the public Testimonials section; reject to keep them off the site. Only approved reviews are ever visible to visitors.

---

## 9. Income & Expenses (Ledger)

Every dollar in or out. Add an entry with the form on the left — pick Income or Expense, a category, amount, date, and (for income) which platform it came from. You can link an entry to a specific booking ID so it shows up in that booking's profit calculation.

Below the entry list: breakdowns by category, profit by individual booking, and commission lost to third-party platforms (the gap between what a guest paid Boatsetter/GetMyBoat and what we actually got paid out).

---

## 10. Tax Report

Pick a year, see total income/expenses/net for that year, plus your active subscriptions' annual cost. Two download buttons export a CSV — one of the full year's ledger, one of your subscriptions — to hand to a bookkeeper or drop into tax software. This isn't a filed tax form, just an organized summary of what's already in the Ledger and Subscriptions tabs.

---

## 11. Maintenance

Track service items per the fleet (oil changes, inspections, etc.) against either elapsed months or engine hours. Log engine-hour readings and fuel fill-ups here too. Items flip to "overdue" automatically once their interval passes — those also show up as a count on the Jarvis dashboard.

---

## 12. Subscriptions

Recurring business costs — software, storage, utilities, anything billed monthly/yearly/weekly. Add one with a name, category, amount, and billing cycle; an optional "next due date" lets it show up on the Jarvis dashboard's "Subscriptions Due Soon" panel as it approaches.

---

## 13. Jarvis (the dashboard)

The cyan-themed tab with the live voice waveform. This is the at-a-glance operations view:

- **Upcoming Bookings** — what's coming up, with date, start time, guest, vessel, and party size. A weather warning badge appears if bad weather is forecast for that date.
- **Needs Attention** — counts of new inquiries, booked-but-unpaid reservations, and overdue maintenance (with the specific item names listed).
- **Revenue — last 30 days** — quick income/expense/net pulse.
- **Subscriptions Due Soon** — upcoming recurring bills.
- **To-Do** — a real checklist. Add a task, check it off, delete it. This is also where website issues (a layout bug, missing info, anything that needs fixing) get logged so nothing falls through the cracks — check it periodically.
- **Media Queue** — pending social drafts, same as the Media Drafts tab, click to expand and approve/reject right here.
- **Agent Activity** — a log of automated background tasks that have run (media drafts, daily reviews) and what they found.

Click **"Enable Jarvis Audio"** once per session if you want Jarvis to speak updates aloud — browsers block audio until you click something first.

---

## Quick reference — where do I...

- See a new website lead → **Inquiries**
- Log a Boatsetter/GetMyBoat booking → **Bookings**
- Check or change a price → **Packages & Pricing**
- Turn an add-on on/off → **Add-ons**
- Make a discount code → **Coupons**
- Block a day off → **Availability**
- Approve a social media post → **Media Drafts**
- Approve a customer review → **Testimonials**
- Log a gas/expense receipt → **Income & Expenses**
- Pull tax numbers → **Tax Report**
- Check what needs attention today → **Jarvis**
