# The channel kit

Three things, none of which touch the charter site:

| | what it is |
|---|---|
| `scripts/roblox-shorts.js` | finds the good moments in a long recording and cuts them into Shorts |
| `youtube-channel/index.html` | a one-page link hub — one URL for his bio |
| `channel.json` | everything the page shows; the only file that normally gets edited |

**This is deliberately not part of thenautiyachti.com.** No route was added to
`app/`, nothing imports from `lib/`, and the page is plain static HTML that
deploys on its own. The charter site converts adults comparing prices for a
Saturday on the water; a Roblox channel does not belong in front of that
traffic, and that traffic does not belong in front of a kid.

---

## Before anything else: two decisions

**1. Whose account.** Under 13 he cannot hold a YouTube account. The channel has
to be a **Brand Account** on a parent's Google account, with him using it. This
is not a formality to route around — it is also the thing that lets you see
comments and take the channel down in an afternoon if you ever need to.

**2. "Made for Kids."** Every upload gets this flag and it is the single
biggest decision on this page, because it decides what promotion is even
available. Roblox gameplay aimed at other kids is normally covered by it.
Marked Made for Kids, YouTube switches **off**:

- comments
- notifications to subscribers
- end screens and cards
- community posts
- personalised ads (so, much lower revenue)

That is most of the standard growth toolkit. It is not a reason to mislabel
the videos — the designation follows the audience, and getting it wrong is
the one mistake here with legal weight behind it. It *is* the reason the plan
below leans entirely on **thumbnails, titles, and volume of Shorts**, which
keep working when the community features are gone.

**Keep out of the videos and off the page:** his full name, his school, the
town, the lake, the house, anything with an address on it. A Roblox channel is
fine. A Roblox channel plus a findable location is the combination to avoid.

**Friends are their parents' decision, not his.** A friend's voice is as
identifying as their face. Ask first, every time, and re-ask if the channel
starts getting real views.

---

## Recording

**He does not need OBS.** OBS is desktop-only and will not install on a tablet.
Both tablets already have a screen recorder that captures the game *and* his
voice, which is everything this needs.

**iPad** — Settings → Control Centre → add **Screen Recording**. Then swipe down
for Control Centre, **long-press** the record button (a normal tap records the
game with no voice), turn the **Microphone on**, Start Recording. It saves to
Photos. The mic setting is remembered, but check it — a silent recording is
the most common way a session is wasted, and the cutter will tell you if it
finds one.

**Android** — swipe down twice for Quick Settings → **Screen Recorder** → set
sound to **Microphone** (or *Media and mic*) before starting.

Play in **landscape**. Record the whole session and do not try to record only
the good bits — the entire point of the cutter is that nobody has to decide
what is interesting while they are playing.

Get the file onto the computer however is easiest (AirDrop, a cable, Google
Drive, a shared folder).

## Cutting it up

```bash
node scripts/roblox-shorts.js --in "C:/path/to/recording.mp4"
```

That measures the session and writes three 30-second Shorts to a `shorts`
folder next to the recording. Useful flags:

```bash
--count 5            more clips
--seconds 20         shorter clips
--dry                show what it found, write nothing
--at 12:30           cut here, whatever the scoring thinks (repeat it)
--layout blur        keep the whole picture instead of cropping into it
```

`--at` is the important one. Every signal in that script is a proxy for
"something happened" and **he was there** — if he remembers a moment, naming it
beats anything the scoring will find. The first run over a session is a few
minutes of decoding; every later run on the same file is instant.

What it prints, per clip:

- `busy` / `loud` — how much was moving, how loud it got, 0 to 1
- `voice` — closer to zero means more of the sound was voices rather than game audio
- `keeps 90%` — how much of the movement survived the crop into 9:16
- `THIN` — scored far below the best moment in the session. **Watch these first and expect to bin them.** Posting filler to a new channel is worse than posting less.

If a clip reports it is spread wider than a crop can hold, re-cut that one with
`--layout blur`.

**Watch every clip before it goes anywhere.** Nothing in the script knows a win
from a death, and nothing in it heard what was actually said.

## Where the Shorts go

One recording session should feed **three** platforms, not one. YouTube Shorts
is where the channel is; TikTok and Instagram Reels are where new viewers
actually find him, and the same vertical file works on all three with no extra
editing. For a Made for Kids channel this matters more, not less, because the
on-platform discovery features are switched off.

This repo already has the posting machinery for the business — `lib/socialPosting.js`
fans one draft out to Facebook, Instagram and TikTok through Blotato behind an
approval gate. **It is wired to the business accounts and must not be pointed at
his.** If the cross-posting gets tedious enough to automate, it gets its own
Blotato accounts and its own copy. The rule worth stealing from it is the one
that matters here anyway: **nothing publishes without a parent looking at it
first.**

## The link hub

One page, one link, for the bio of every platform.

1. Open `channel.json`, set `name`, `handle` (no `@`), `tagline`, `avatar`.
2. Add videos newest-first. The `id` is the part of the URL after `watch?v=` —
   for `youtube.com/watch?v=dQw4w9WgXcQ` it is `dQw4w9WgXcQ`. Not the whole URL.
3. Reload.

The Subscribe button uses `?sub_confirmation=1`, which opens YouTube's own
subscribe dialog rather than just landing on the channel. Same click, one step
shorter, and it measurably converts better.

**Previewing it:** double-clicking `index.html` will show an error, and that is
correct — a page opened from `file://` is not allowed to read a file sitting
next to it. Run a small server from inside this folder instead:

```bash
npx serve .          # or: python3 -m http.server
```

**Putting it online:** drag this folder onto [netlify.com/drop](https://app.netlify.com/drop),
or deploy it as its own Vercel project. Separate project, separate domain — do
not add it to the charter site's Vercel project. It is static files, so both
are free.

There is no YouTube API key anywhere in here on purpose: a key in a page anyone
can View Source on is a key anyone can spend. The cost is that adding a video
means editing `channel.json`. That is the right trade for a page that changes
once a week.

---

## What actually grows a Roblox channel

Roughly in order of how much they matter, and none of them is "post more often
and hope":

1. **Thumbnail and title.** On a Made for Kids channel these are very nearly the
   only levers left. A thumbnail is read at the size of a postage stamp: one
   face or one object, big, with three or four words at most. The template set
   is a separate deliverable.
2. **The first three seconds.** Shorts are scrolled past, not chosen. The moment
   has to be visibly under way immediately — which is why the cutter centres a
   `--at` pick slightly *before* the moment rather than starting on it.
3. **Volume, across three platforms.** One session, three or four clips, three
   platforms.
4. **One game at a time.** A channel that is all Tower of Hell for a month gets
   recommended alongside Tower of Hell videos. One that is a different game
   every upload gets recommended alongside nothing.
5. **Consistency he can actually keep up.** One video a week for a year beats
   four in a week and then nothing. He is a kid; the schedule should survive
   school, and it is better to promise fortnightly and hold it.

And the honest part: most channels stay small, including good ones. The thing
worth optimising for is that he enjoys making them and learns to edit, because
that pays off whether or not the numbers ever do.
