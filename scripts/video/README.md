# Cutting video from the charter library

Built 13–14 September 2026. `charter-montage.js` one directory up cuts **one
trip**; everything in here cuts **across the library** — a theme.

Python, not Node, because this is all ffmpeg orchestration and contact sheets.
There is no working `python` on PATH; the interpreter is
`C:\Users\immex\AppData\Local\Programs\Python\Python312\python.exe`. `ffmpeg`
and `ffprobe` resolve from PATH.

## The one finding that should change how you cut

The owner sent **nine reference videos** over two nights — four wakeboarding and
tubing, five party cove. Every one was measured with scene detection.

**All nine have zero cuts.** Not "few". Zero. Eleven seconds and 122 seconds
alike, each is a single held take. (Two more he sent could not be measured:
YouTube demanded browser cookies. Say "unmeasured", not "zero".)

So the house shape is **seven or eight shots across 35–50 seconds, six to nine
seconds each**, and the best shot gets the longest hold. A montage is a
compromise the format forces — one take cannot represent four years and six
charters — so pay for it with longer holds, not more of them. Cutting away from
the best thing you have is the mistake the references never make.

No music. Original audio throughout. He opens on camera with "Hello America"
and the occasion, and that intro is why these get no soundtrack.

## The pipeline

    PY=C:/Users/immex/AppData/Local/Programs/Python/Python312/python.exe
    CH="C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos/02 Charters"

**1. Survey — what is actually there.** Counts RAW separately from FINISHED
CUTS, because a folder that looks full is often full of things already edited,
and a compilation built from compilations is a copy rather than a cut.

    "$PY" survey.py "$CH"

**2. Triage sheet — one frame per clip, tiled.** Thirty clips in one image read
instead of thirty. Enough to say what each clip is *about*, which is all triage
is for. `triage.py` walks one folder; `triagelist.py` takes an explicit list on
stdin, which is what a theme pool needs (originals, plus a dated subfolder,
minus the cropped duplicates of the same source).

    find "$CH/Party Cove/_originals" -type f -iname '*.mp4' | sed 's|^/c/|C:/|' \
      | "$PY" triagelist.py out_dir 6 0.40

Paths must be Windows-shaped. Git Bash `find` emits `/c/...`, which Python on
Windows cannot open — hence the `sed`.

**3. Row sheet — one row per surviving clip, eight samples across it.** This is
where held windows are found. Reading eight clips at this density costs one
image read instead of eight.

    printf '%s\n' "$CH/.../a.mp4" "$CH/.../b.mp4" | "$PY" rowsheet.py out_dir 8

`finesheet.py` does the same for a single clip and adds a per-second loudness
profile, which is how the owner's spoken intro gets located rather than guessed
at.

**4. Build from an explicit edit list.** File, start, duration, zoom, centre and
a written reason per segment, so a later pass can see why a window was chosen
instead of re-deriving it. The four JSON files beside this README are the real
ones, kept as worked examples.

    "$PY" build_theme.py edit_cove.json

**5. VERIFY THE FINISHED FILE.** Sample the output every 1.5–2s and look at it.
Then fix and rebuild.

    "$PY" finesheet.py "<the built mp4>" vf_dir 1.8 8

### Step 5 is not ceremony

In four cuts on one night it caught four things no source frame could show:

* a **thumb across the lens** two seconds into the glow opener, invisible at the
  triage timestamps either side of it;
* a guest's **head filling the right half** of the tubing cut's third shot, from
  a window whose two sampled ends were both clean;
* two glow windows that read as strong stills and were **motion blur in motion**
  — the difference a single frame structurally cannot show;
* a Party Cove window that opened on **open water and three distant heads**.

A still cannot show blur, and sampled ends cannot show the middle.

## Check this before you source anything

Both of these were found by the owner on 14 Sep 2026, after they had already
been cut into finished videos.

**NOT FOR USE, whole clip.** `Boatz and Glowz / 2025-09-20 First run - promo
event / 20250920_211850_303ad61a.mp4` — nudity. It had been cut in as an
eight-second foam shot from 33.0s. The whole clip is withdrawn rather than that
window, because at review resolution the content could not be resolved at all,
so no part of it can honestly be called clean.

That happened because the screen was a contact sheet of **300px tiles**, and
UV-lit foam at night does not survive that size. Night material needs 460px
tiles or bigger, or a frame-by-frame pass. A sheet you cannot actually see is
not a screen.

**MIS-FILED.** `Party Cove / 2025-09-27 /` is footage from **The Dam**. Three
clips. They had become the opener and the closer of the Party Cove theme cut —
15.5 of its 49 seconds, and the two bookends the structure was built on.

The theme folder is the **only** tag these files carry; the raw names are bare
timestamps and nothing inside a clip says where it was shot. So a clip in the
wrong folder is silently wrong forever. Party Cove is a treeline and a sandbar
packed with rafted boats; the Dam is open water, big sky and a long sand spit.
They look nothing alike — ask "is this the place the folder claims" while
reading the triage sheet, not after the cut is built.

## Two traps that cost real time

**Output size — do not upscale by default.** Check the DISPLAY size, not the
stream's; rotated footage lies about its own width and height.

    glasses, older   1280x720 + rotation flag  ->  720x1280   (already 9:16)
    glasses, newer   1376x1824 or 2144x2864    ->  1080x1920 at 1.05x or less

Rendering the older family at 1080x1920 upscales every shot by exactly 1.5x and
invents half the pixels. 720x1280 fills a phone and both platforms accept it.
Then punch-in is the only thing spending sharpness, which is where that cost
belongs. `build_theme.py` prints the resampling factor per segment and flags
anything over 1.45x as SOFT.

**Address segments by filename, never by index.** Deleting one segment from an
edit list shifts every index after it. That silently gave the glow cut's
captain-hat shot the neon cabin's timing — asking for 51.5s of a 32.7s clip —
and it built without an error.

## What each theme holds, surveyed 14 Sep 2026

    Tubing and Wakeboarding   18 raw / 11.6 min   one 86s clip carries it
    Party Cove                18 raw / 13.3 min   high-res, 1376x1824
    Boatz and Glowz           49 raw / 33.3 min   most of it too dark to use
    The Dam                   14 raw / 13.2 min   open water, big skies, a stage
    Night Cruise               3 raw /  1.2 min   NOT ENOUGH for a cut
    The Island                 0 raw              four finished cuts, no source

Night Cruise and The Island were left alone deliberately. Say so rather than
cutting something thin out of them.

## Also here

`refs.py` downloads reference videos via the `/watch` skill and measures how
they are **cut** — length, scene-change count, average shot length — which is
the one metric that settles "do they cut faster than we do" without guessing.
`refsheet.py` tiles several references into one sheet, N frames each.
`cropcheck.py` shows what a 9:16 crop would throw away *before* throwing it
away, dimming the edges that would be lost.
