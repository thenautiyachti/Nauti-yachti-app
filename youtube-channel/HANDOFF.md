# Handoff — Cake Pancake YouTube channel

Everything needed to pick this up on another machine, in another session. The
chat it was built in is gone; this file is the record.

**Branch:** `claude/youtube-channel-promotion-d0eksr` — pushed, 11 commits,
**no pull request opened.** Nothing here is merged to `main`.

**Design canvas (banner, avatar, 4 thumbnail layouts), Version 3:**
https://claude.ai/code/artifact/8995e3c0-7db2-4d55-aff8-ede7487af3b0

```bash
git fetch origin claude/youtube-channel-promotion-d0eksr
git checkout claude/youtube-channel-promotion-d0eksr
```

---

## The facts, so nothing gets re-guessed

| | |
|---|---|
| **Channel name** | Cake Pancake — his Roblox display name, a pseudonym. This is what the art says. |
| **YouTube handle** | `chandenhefty` **← to be changed to `cakepancake`** |
| **Roblox display name** | Cake pancake |
| **Roblox username** | `Grngobbyguy3222` — appears nowhere public, deliberately |
| **Account** | Already set up, on a **parent's** Google account. Not the child's. |
| **Audience setting** | Made for Kids / ages 5+ |
| **His age** | **NOT KNOWN. Do not assume one.** An earlier draft invented "nine-year-old"; it was removed. It matters because under-13 governs the account rules. |
| **His mother** | **Proposed the channel.** She is on board, knows about the account, and does not need convincing. Anything written for her is about *how to help*, never a case for the idea. |

**The handle is the one open item.** YouTube auto-assigned `chandenhefty` from
the account name at creation — it was not chosen, and it puts his name in every
shared URL. It's being changed to `cakepancake`. **A handle can only be changed
once every 14 days.** When it changes, update `handle` in
`youtube-channel/channel.json` or the link page's Subscribe button points at a
dead page.

---

## What's here

```
scripts/roblox-shorts.js          the clip cutter
youtube-channel/
  README.md                       the workflow, recording instructions, growth notes
  content-ideas.md                what to actually make — formats, title patterns, a first month
  channel.json                    ← the only file normally edited
  index.html                      the link hub (standalone static page)
  design/*.dc.html, canvas.json   source for the banner, avatar, 4 thumbnail layouts
  briefing/                       everything written for his mother
```

**This is deliberately separate from the charter site.** No route under `app/`,
nothing imported from `lib/`, no Next.js. The link page is plain static HTML
that deploys as its own project. Keep it that way — a Roblox channel does not
belong in front of boat-charter traffic, and that traffic does not belong in
front of a child.

### Two files are generated and NOT in git

| missing file | how to rebuild |
|---|---|
| `youtube-channel/design/roblox-channel-art.html` | Run the `/design` skill and re-seed from the `.dc.html` files + `canvas.json`. ~2.5MB of embedded editor; publish to the artifact URL above to keep the same link. |
| `youtube-channel/briefing/youtube-channel-briefing.pdf` | Open `briefing/briefing.html` in Chrome → Print → Save as PDF, A4, **background graphics on**. |

The PNGs (`thumbnail-templates.png`, `channel-banner.png`,
`how-this-works-1.png`, `how-this-works-2.png`) **are** committed.

---

## Next actions

1. **Change the handle to `cakepancake`**, then set it in `channel.json`.
2. **Record one session** and run the cutter on real footage — see below, it has
   never been run on anything but a synthetic test file.
3. **Add videos to `channel.json`** (`id` is the part after `watch?v=`). The
   video grid stays hidden until there's at least one.
4. **Send his mother the rundown** if not already sent — the message text is in
   `briefing/text-to-send.md`, the images are `how-this-works-1.png` and `-2.png`.
5. **Deploy the link page** when wanted: drag `youtube-channel/` (minus
   `design/` and `briefing/`) onto netlify.com/drop, or its own Vercel project.
   **Not** the charter site's Vercel project.

## Running the cutter

```bash
node scripts/roblox-shorts.js --in "path/to/recording.mp4"
node scripts/roblox-shorts.js --in ... --count 5 --seconds 20 --dry
node scripts/roblox-shorts.js --in ... --at 12:30        # cut here, repeatable
node scripts/roblox-shorts.js --in ... --layout blur     # keep the whole picture
```

**Needs ffmpeg and ffprobe.** It looks for them in this order: `--ffmpeg <path>`,
then the `FFMPEG` env var, then `C:/Users/immex/tools/ffmpeg/ffmpeg.exe` (the
path the rest of this repo uses), then whatever is on `PATH`.

First run on a long recording is a few minutes of decoding; results are cached
beside the file, so later runs at different lengths are instant.

---

## Things learned the hard way — don't rediscover these

- **OBS will not install on a tablet.** It's desktop-only. The built-in screen
  recorder is what to use, and the microphone must be switched on at the
  long-press or the recording is useless.
- **Tablet Roblox draws the controls onto the recording.** A thumbstick, a jump
  button and a scrolling chat feed all move while nothing in the game happens —
  on one test stretch the bottom fifth of the frame carried more frame-to-frame
  change than the other four fifths combined. The cutter excludes that band from
  both measurements. Don't "fix" it back.
- **Between half and sixty percent of people who leave a Short leave in the
  first three seconds.** The cutter puts a named `--at` moment 1.5s in and
  penalises windows whose loudest instant lands late. An earlier version buried
  the moment 10.5s in.
- **Scripted beats raw gameplay, and "scripted" means one added rule** —
  blindfolded, nobody talks, can't let go. Decided in ten seconds before
  recording. This is the single highest-value habit; see `content-ideas.md`.
- **Titles are search queries:** game name + the word "Roblox" + a hook, one or
  two words in caps. `First Time Playing Grow a Garden Roblox`, not `Gameplay #4`.
- **youtube.com is blocked** from the Claude Code web sandbox. A session there
  cannot look up a channel, a video, or a handle. A local session may be able to.
- **Look at design work at the size it will actually be seen.** Checking the
  thumbnails individually at full size passed three separate faults that only
  showed when they were tiled at feed size: a frame overflowing 1280x720 by its
  own padding, a seam running through the word "VS", and a colour clash.
- **Monetisation thresholds double in February 2027** for new applicants (8,000
  watch hours or 20M Shorts views). A channel starting now is likely held to the
  higher bar. Treat this as earning nothing.
- **COPPA liability sits with the channel, not YouTube**, after the FTC
  settlement. That's what gives the Made for Kids setting its weight.

## Standing rules that were agreed

No face on camera. Cake Pancake, not his real name. No school, no town, no
street. Friends' parents asked before their kid's voice is in anything. Nothing
posts that a parent hasn't watched end to end, short clips included. Review the
whole thing honestly at three months.
