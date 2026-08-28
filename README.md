# The Nauti Yachti — buildable site

This is a real, standalone Next.js app version of the demo we built in
chat: same design, same packages/pricing/availability/gallery/booking
flow, same owner console — but backed by an actual database and real
authentication instead of chat-only storage.

## What's inside

- **Next.js 14** (App Router) — the framework, handles both the pages
  and the API routes.
- **Prisma + SQLite** for local development — a real database, stored
  as a single file (`prisma/dev.db`) so there's nothing to install.
  Swappable to Postgres for production (see "Going to production" below).
- **A signed-cookie admin session** — the owner console now requires a
  real login (not a client-side passcode check anyone could bypass by
  reading the page source).
- **Optional real email** via [Resend](https://resend.com) — inquiries
  always save to the database; email sending is a bonus that turns on
  once you add an API key.

## Running it locally

You'll need [Node.js](https://nodejs.org) 18 or newer installed.

```bash
cd nauti-yachti-app
npm install
cp .env.example .env
# open .env and set ADMIN_PASSWORD and SESSION_SECRET to real values
npm run db:push      # creates the local database and tables
npm run db:seed      # loads in the packages/vessels/pricing we set up
npm run dev
```

Then open http://localhost:3000 for the site, and
http://localhost:3000/admin for the owner console (log in with the
`ADMIN_PASSWORD` you set in `.env`).

## Project layout

```
app/
  page.js            the public site (server component, loads data from the DB)
  admin/page.js       the owner console (login gate + data fetching)
  api/                all backend routes (packages, vessels, gallery,
                       blocked-dates, inquiries, ledger, admin auth)
components/
  SiteView.js         everything customer-facing (nav, hero, vessels,
                       packages, availability, gallery, inquiry form)
  AdminView.js         everything in the owner console
lib/
  db.js               Prisma client
  session.js           signed-cookie session helpers
  auth-guard.js         checks a request's session cookie (used by API routes)
  pricing.js            currency/tier-pricing helpers shared by front and back end
  email.js               sends the inquiry notification email via Resend
  serialize.js            turns raw DB rows into the shapes the frontend expects
prisma/
  schema.prisma        the database structure
  seed.js               the starting data (packages, vessels, gallery captions)
```

## Going to production

1. **Get a real Postgres database.** [Supabase](https://supabase.com)
   and [Vercel Postgres](https://vercel.com/storage/postgres) both have
   free tiers that are plenty for a business this size. You'll get a
   connection string that looks like
   `postgresql://user:password@host:5432/dbname`.

2. **Switch the Prisma provider.** In `prisma/schema.prisma`, change:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

3. **Deploy to Vercel** (or Netlify). Push this project to a GitHub
   repo, then import it in Vercel. Set these environment variables in
   the Vercel project settings:
   - `DATABASE_URL` — your real Postgres connection string
   - `ADMIN_PASSWORD` — a real passcode only you know
   - `SESSION_SECRET` — a long random string (`openssl rand -hex 32`)
   - `RESEND_API_KEY` — once you've set up Resend, for real inquiry emails
   - `OWNER_EMAIL` — where inquiry notifications should go

4. **Run the database setup against production once**, either from
   your machine with the production `DATABASE_URL` in `.env`, or via
   Vercel's deploy step:
   ```bash
   npx prisma db push
   node prisma/seed.js
   ```

5. **Point your domain at it.** Once it's live on Vercel, add
   `thenautiyachti.com` as a custom domain in the Vercel project
   settings, and update your domain's DNS records as Vercel instructs
   (this replaces whatever currently points at design.com).

6. **Set up real email (optional but recommended).** Create a Resend
   account, verify a sending domain, and put the API key in
   `RESEND_API_KEY`. Until then, inquiries still save fine — you'll
   just need to check the owner console instead of your inbox.

## What's stubbed / left for later

- **Photo & video uploads** — the media tab edits captions on the
  existing tiles; wiring up real uploads needs a storage service like
  S3 or Cloudinary.
- **Payments** — no Stripe integration yet. Straightforward to add once
  everything else is live.
- **Vessel roster editing** — vessel names/capacities are seeded and
  displayed, but not yet editable from the console (pricing,
  availability, gallery, and inquiries all are).
