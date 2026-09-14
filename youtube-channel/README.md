# The channel kit

Three things, none of which touch the charter site:

| | what it is |
|---|---|
| [`content-ideas.md`](content-ideas.md) | **what he should actually make** — formats, real title patterns, a first month |
| `scripts/roblox-shorts.js` | finds the good moments in a long recording and cuts them into Shorts |
| `youtube-channel/index.html` | a one-page link hub — one URL for his bio |
| `channel.json` | everything the page shows; the only file that normally gets edited |
| `design/` | source for the banner, avatar and four thumbnail layouts |

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

...along with live chat, the notification bell, save-to-playlist, channel
memberships, the branding watermark and donations. That is most of the
standard growth toolkit.

It is not a reason to mislabel the videos, and the legal weight here is real
and sits on you rather than on YouTube: under the FTC settlement that followed
YouTube's $170m COPPA fine, individual **channels** are treated as sites
responsible for their own COPPA compliance. The designation follows the
audience, and the liability for getting it wrong follows the channel owner.

It *is* the reason the plan below leans entirely on **thumbnails, titles, and
volume of Shorts**, which keep working when the community features are gone.

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
beats anything the scoring will find. Name the second the thing *happened*; the
clip starts 1.5 seconds before it, not on it. The first run over a session is a few
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

Checked against current write-ups rather than written from memory, because this
niche moves fast. Sources at the bottom.

1. **The title is a search query, not a sentence.** This is the one with a
   formula, and it is the thing most new channels get wrong. Put the **game
   name**, the word **Roblox**, and a **hook** in it:

   > ✅ `ALL NEW CODES in Blox Fruits Update 24 (Roblox)`
   > ✅ `1v5 clutch in Arsenal that no one expected`
   > ❌ `I Played Blox Fruits Today`

   The first two get found by people searching for the game. The third is
   findable by nobody. Hook words that reportedly carry: *insane*, *this is
   broken*, *how is this real*.

2. **Thumbnail: a character, an arrow, and two or three words.** That specific
   combination is the convention, and high-contrast versions of it beat busy or
   text-heavy ones. Saturated **yellow, red and cyan** cut through the feed
   best — they are the swatches on every artboard in the kit. Keep the layout
   recognisably the same every time so a returning viewer spots him without
   reading.

3. **The first three seconds decide it.** Between **half and sixty percent** of
   everyone who leaves a Short leaves inside the first three seconds. That is
   why the cutter puts a named `--at` moment **1.5 seconds** into the clip, and
   why it now scores a window down when its loudest instant lands late: a
   payoff at 0:27 is a payoff most of the audience never reached.

4. **Planned beats random.** The uncomfortable one, because it is a limit on
   the cutter: scripted moments reportedly outperform raw gameplay on Shorts.
   The cutter solves the *editing* bottleneck, and it cannot invent a reason to
   watch. Deciding one thing to attempt before recording — one bit, one
   challenge, one target — is worth more than any amount of clever cutting
   afterwards. In this niche "scripted" turns out to mean **one added rule**
   (blindfolded, no talking, can't let go), which costs ten seconds to decide:
   see [content-ideas.md](content-ideas.md).

5. **One to three games, not ten.** Channels that stay on a small number of
   games build an audience that returns. A different game every upload gets
   recommended alongside nothing. As of now the big ones are **Brookhaven**,
   **Steal a Brainrot**, **Blox Fruits** and **Grow a Garden** — but the right
   answer is whichever of them he actually plays and can talk over.

6. **Frequency, honestly.** The fastest-growing Roblox channels reportedly
   upload **4–7 times a week**. That is a real number and it is also not a
   realistic ask of a kid with school. Both things are true, so decide with
   your eyes open: high frequency is genuinely what drives it, and a schedule
   he abandons in three weeks drives nothing at all. One a week he actually
   keeps is the floor worth defending — and cross-posting each Short to TikTok
   and Reels multiplies reach without multiplying work.

And the honest part: most channels stay small, including good ones, and this
niche is widely described as saturated. The thing worth optimising for is that
he enjoys making them and learns to edit, because that pays off whether or not
the numbers ever do.

## Where these numbers came from

- [How Roblox creators grow on YouTube and TikTok](https://rolearn.dev/insights/roblox-content-creator-growth-youtube-tiktok/) and [Starting a Roblox YouTube channel](https://rolearn.dev/guidance/starting-roblox-youtube-channel-guide/) — title formulas, thumbnail convention, frequency
- [Roblox YouTube Shorts strategy](https://blog.eklipse.gg/beginner-guide-2/roblox-youtube-shorts-strategy.html) — hook timing
- [Ideal Shorts length and format for retention](https://www.opus.pro/blog/ideal-youtube-shorts-length-format-retention) and [Shorts hook formulas](https://www.opus.pro/blog/youtube-shorts-hook-formulas) — the three-second drop-off
- [Set your channel or video's audience](https://support.google.com/youtube/answer/9527654) and [How ads work on made-for-kids content](https://support.google.com/youtube/answer/9713557) — what the designation switches off
- [Better protecting kids' privacy on YouTube](https://blog.youtube/news-and-events/better-protecting-kids-privacy-on-youtube/) and [YouTube's policy on kids, for creators](https://www.superawesome.com/blog/everything-brands-and-creators-need-to-know-about-youtubes-new-policy-on-kids/) — COPPA liability
- [Most popular Roblox games](https://www.statista.com/statistics/1220905/roblox-most-visited-games) — the current line-up

None of this is from watching a video: I cannot. It is what creators and
YouTube's own documentation have written down.
