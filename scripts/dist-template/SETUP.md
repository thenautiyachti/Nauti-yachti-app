# A charter business, in a box

This is a working booking website, an owner's console, and a crew of eight AI
agents that watch the business and tell you what is wrong with it. It was built
for one charter operation over several months and stripped of everything
personal to it.

**What you are getting** is the machinery. **What you are not getting** is a
business — no boats, no prices, no photographs, no guests. Those are yours, and
the setup below is mostly about putting them in.

## Before you start

You will need, and none of them cost anything to begin with:

- **Node.js** 20 or newer.
- **A Supabase account** — the database. Free tier is plenty.
- **A Vercel account** — hosting. Also free to start.
- **A domain.**
- **Stripe**, if you want to take deposits online. Skip it at first if you like;
  everything else works without it.
- **Resend**, for booking confirmation emails. Free tier is enough.
- Optional: **ElevenLabs** if you want the crew to talk to you, **Blotato** if
  you want them posting to social platforms.

## Setup

**1. Say who you are.**

Open `business.config.json` and fill it in. The `_examples` block shows the
shape of each answer. Then:

    node setup.js

That is a dry run — it prints what it would change and writes nothing. When it
looks right:

    node setup.js --apply

This rewrites the previous owner's name, domain, lake and phone number out of
every file. You can rename the eight crew members here too, or keep them.

**2. Put your business in.**

The wizard deliberately does not invent these:

| What | Where |
|---|---|
| Boats, packages, prices | `app/prisma/seed.js` |
| The words on your site | `app/lib/packageContent.js`, `app/lib/faqContent.js` |
| Photographs | The Photos library — read its README first. **Tag them, do not re-file them.** |

**3. Keys.**

Create a `.secrets` file somewhere OUTSIDE this folder — outside any folder that
syncs to Drive or Dropbox. `DISASTER RECOVERY.md` lists every variable, what it
is for, and where to get it. Then tell the scripts where it is by creating
`scripts/nauti-paths.json`.

**4. Check it.**

    node app/scripts/check-consistency.js
    node app/scripts/health-check.js

The first proves the documentation still matches the code. The second proves
every outside service answers. Both should be clean before you take a booking.

## The crew

Eight agents, in `crew/`. Each has a brief describing what it looks at, what it
reports, and — importantly — what it must NOT bother you with. They share a
protocol in `_crew-protocol.md`, which is the part worth reading even if you
change everything else.

They run as scheduled tasks. `crew/schedules.json` has the times the original
business used; yours will differ.

**Read the protocol before you change a brief.** A good deal of it is scar
tissue. Every rule in it exists because something went wrong once, and each says
what.

## Two things that will bite you on Windows

Both cost the original owner real time.

**Do not put working directories inside Google Drive.** Drive writes a
`desktop.ini` into every folder it touches. That corrupted a git directory, and
it broke every second website build until it was tracked down — Turbopack parses
each filename in its cache as a number, and `desktop.ini` is not one. There is a
guard in `next.config.js` now, but keeping the code out of a synced folder is
the real fix.

**Watch for `&` in folder paths.** A folder named "AI & Website" breaks npm's
shims. Call `node.exe` by its full path if you hit it.

## What this cannot do for you

It will not find you customers, and it will not tell you your prices are wrong.
What it does is notice things: a booking with no payment recorded, a boat that
has never been serviced, a guest nobody asked for a review, a social queue about
to run dry, an insurance rule that changed.

Most days it will have nothing to say. That is the intended behaviour, and it is
worth resisting the urge to make the agents chattier — a status you skim is a
status you will skim on the day it matters.
