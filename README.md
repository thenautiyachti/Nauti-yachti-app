# The Nauti Yachti

The website and back office for a boat charter business on Lake Conroe, Texas.
Live at [thenautiyachti.com](https://www.thenautiyachti.com).

This is not a demo. It takes real bookings, charges real cards, and is the only
record of what the business has earned.

## What it is

- **The public site** — packages, pricing, the fleet, availability, gift
  certificates, the Boatz & Glowz event page, and a checkout that takes payment.
- **The owner console** at `/admin` — bookings, inquiries, the ledger, tax
  figures, maintenance, the social queue, and the comment inbox. Behind a
  signed-cookie login.
- **On the dock** — the phone-shaped part of the console, for the things done
  standing on a boat: engine hours, gate codes, review asks.
- **Nine scheduled crew members** who draft, audit and report, none of whom send
  anything to a guest or publish anything in public without the owner.

**The console has its own manual: [owner-console-manual.md](owner-console-manual.md).**
It is written for the owner, not for a developer, and it is the better place to
understand what the software is *for*.

## Stack

- **Next.js 16** (App Router) with React 19
- **Prisma → Postgres** on Supabase — 25 models
- **Stripe** for checkout, with a webhook that creates the booking
- **Resend** for guest email
- **Blotato** for social publishing and comment reading
- Deployed on **Vercel**, from `main`

65 API routes, 18 components, 42 shared modules in `lib/`.

## Running it locally

Node 18 or newer.

```bash
cd nauti-yachti-app
npm install
npm run dev
```

`.env` needs at minimum `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET` and
`ADMIN_PASSWORD`. Everything else degrades rather than crashes — no
`RESEND_API_KEY` means email is skipped and logged, no `STRIPE_SECRET_KEY` means
checkout cannot start, and both say so plainly instead of failing silently.

Then http://localhost:3000, and http://localhost:3000/admin for the console.

## Layout

```
app/
  page.js                 the public site
  admin/page.js           the owner console (login gate + data fetching)
  packages/[slug]/        one page per package, for search
  glow/                   the Boatz & Glowz event page and crew-list signup
  api/                    65 routes — bookings, inquiries, ledger, media
                          drafts, comments, Stripe webhook, admin checks
components/
  SiteView.js             everything customer-facing
  AdminView.js            everything in the owner console
  SocialCommentsTab.js    the Facebook/Instagram comment queue
  AvailabilityMonthGrid.js the public calendar
lib/
  bookingStatus.js        what a booking's status MEANS — the vocabulary both
                          models share, and the predicates callers should ask
                          instead of comparing strings
  bookingLedger.js        turning a completed charter into an income row, in
                          one place so every route recognises money the same way
  reviewReasons.js        why a social draft was sent back or killed
  email.js                the four guest emails, and one sign-off
  socialComments.js       grouping comments into threads and working out which
                          are still waiting
  pricing.js              tier pricing, shared by front and back end
  serialize.js            DB rows into the shapes the frontend expects
prisma/
  schema.prisma           25 models
```

## Things worth knowing before you change anything

**Statuses are not strings to compare.** `lib/bookingStatus.js` owns what
`booked`, `owed`, `completed` and the rest mean, and exposes predicates —
`holdsTheDay()`, `wasEverBooked()`, `isOwed()`. Four places once used
`status !== "cancelled"` as a proxy for "this is a real booking", including the
public availability calendar. Ask the module; do not compare the string.

**A website checkout writes two rows.** An `Inquiry` and a mirror
`ExternalBooking`. Both routes keep the statuses in step; if you add a third
place that changes one, keep it in step too.

**Marking a charter completed is when its money becomes real.** That is
`recordCompletedBookingIncome()`, and it is idempotent and refuses to guess a
price. Six charters' income once went missing because this was done by hand.

**`prisma db push` compares the whole schema and can drop columns.** For an
additive change, prefer `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and update
`schema.prisma` to match.

**Vercel resolves environment variables at build time.** A variable added or
rotated after a deployment does nothing until the next build.

**The deployment is the only thing worth checking.** `/api/admin/env-check`
answers from inside the running deployment, because a health check that runs on
a different machine from the thing it is checking is not a check. It reports
names and address shapes, never values.

**Do not trust a successful `git push` as proof.** Verify the change against
production — the endpoint, the rendered bundle, or the behaviour.

## Known, deliberate, not bugs

- **`bookings@thenautiyachti.com` has no MX record.** Fine as a *from* address;
  mail sent *to* it is accepted and evaporates. Guest email CCs the Gmail
  address to route around this.
- **Four things still say "Jarvis"** — a database table, a service key, an API
  path and a folder name. Renaming any of them breaks something live for the
  sake of a word. See the manual.
- **A still cannot be published to Instagram or TikTok.** Blotato reaches
  Instagram only as reels and stories, both of which need video. Siren treats a
  still on either as a blocked item rather than attempting it. Facebook takes
  photo or video.
- **Five hashtags maximum, every platform.** More than five is a publish
  rejection that leaves the draft looking scheduled and healthy.
