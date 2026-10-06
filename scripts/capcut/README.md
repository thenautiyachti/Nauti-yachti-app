# CapCut drafts: charter recaps and theme compilations

Built 2 Oct 2026. Claude lays the cut into the owner's CapCut desktop library.
Since 5 Oct 2026 Coral also exports and finishes it (owner: "all this media
editing you are doing should be applied to corals job"). Nothing here
publishes anything.

## Finishing (5 Oct 2026)

    node theme-compilations.js --pick                          # the daily one: random theme, tubing x3, shuffled shots
    powershell -File export-from-capcut.ps1 -Project "<name>"  # CapCut's own Export, driven by position
    node blur-bars.js <export.mp4> <out.mp4> --plan <plan.json> [--night]   # blur the bars shot by shot

`export-from-capcut.ps1` refuses while CapCut is open (3) or the PC was used in
the last 2 minutes (4). CapCut is Qt/QML with no automation tree, so it clicks
by position measured from CapCut's own window; promotions arrive as separate
small windows and are closed with WM_CLOSE, but never during the export dialog
(that is a small window too). Each run writes its screenshots to its own
folder, `%TEMP%\capcut-export\<yyyyMMdd-HHmmss>-<project>`, named in its JSON
(`shots`), so a failed export in a queue keeps its evidence; folders older than
7 days are removed.

`blur-bars.js` takes the plan the draft was built from (`theme-compilations.js`
and `recap-charter.js` print it as `plan`). Per shot it works out where the
picture sits (the source's display size, rotation and EXIF respected, and its
scale, 1.0 = fitted to 1080x1920); a shot that covers the frame, such as a zoomed
rider, is left alone. One ffmpeg pass then blurs each distinct band only during
its own shots, inset 2 px, and keys back whatever CapCut drew into the bars that
is not black (the title, the end card, transitions). `--night` (night cruise and
glow cuts) measures each shot and lifts the dark ones with harvest-stills.js's
shadow curve in the same pass: under 45 mean luma hard, under 70 gently. Exit 2:
no bars, file the export as it is. **Exit 3: unsure, file the unblurred export.**
Without `--plan` it still detects, but exits 3 unless the frames agree on one
standard band. The first version measured one band for the whole video and
painted blur over picture on cuts mixing shapes (5 Oct 2026: the Island's title
and end card, half of every Boatz & Glowz shot, the guests in a night recap).

capcut-cli's `bg-blur` writes a canvas CapCut 9.5
does not render, hence `blur-bars.js`. Its `uniform_scale` keyframe writes the
key UNIFORM_SCALE, which CapCut 9.5 ignores too: build-from-plan.js writes
scale_x + scale_y (KFTypeScaleX/Y) instead, and since 5 Oct 2026 only riders are
zoomed (RIDER_ZOOM in plan_recaps.py, rider shots capped at four beats).

    python find_riders.py "<charter>"                  # wake frames on gridded review sheets
    python find_riders.py "<charter>" --make "<clip>@<s>@<u>,<v>" ...   # rider stills into Completed

The eye picks the riders (follow the tow rope; tubes come in every colour), the
script does the sampling, the sheets and the stills.

The tool underneath is capcut-cli 0.26.0 (MIT, zero dependencies), reviewed and
copied to `C:\Users\immex\.node_modules\capcut-cli`. Not installed from npm on
the fly: read any new version's source before replacing it.

## Run order

CapCut must be **fully closed** (check Task Manager: closing the window can leave
it in the tray). Every builder refuses to write while `CapCut.exe` runs.

    python read_shelf.py        # his Music shelf project -> shelf.json
    python locate_moments.py    # Completed stills -> their clip + second + steady span
    python plan_recaps.py       # one plan per charter, cut to a shelf song's beats
    python plan_themes.py       # one plan per theme TAG, across charters then outings
    node build-all.js           # each plan -> a draft in his CapCut library

Coral does not run these by hand. Her two one-step wrappers:

    node recap-charter.js "<charter folder>"   # after a charter's Completed is curated
    node theme-compilations.js                 # straight after; rebuilds only themes whose trips changed

`theme-compilations.js --all` rebuilds every theme regardless (only when he
asks). It records each built theme in `themes-built.json` (gitignored): the
trips it drew on, its song, and its **signature**, the shots it would be cut
from at full length. A theme rebuilds only when that signature changes, so an
outing whose photos only fill thin themes can be tagged without producing a
duplicate draft. A second build on the same day is named "... v2 (Claude)";
the first is never touched. Out of season nothing changes and nothing is built.

`build-from-plan.js` builds one plan; `snap-to-beats.mjs` snaps an existing
draft's cuts to the beats of a song he added himself; `recut-to-song.js` was the
one-off re-cut of Oscar's draft to "REFLECTION".

## Theme compilations (3 Oct 2026)

Owner: *"a Party Cove collaboration of all charters we've had that have gone to
Party Cove, pulling the best moments of each one of them ... This logic should
follow for every theme that we have as well."* Themes are the tags in folder
names (there are no theme folders), so `plan_themes.py` takes every folder whose
tags name the theme: charters in `_By charter` first, every one before any gets
a second shot, then his outings in `02 Charters\_outings` (he may post those and
approves each post). Per theme (his answers of 5 Oct 2026 in brackets, from
Coral's `Making videos by theme.md`): the riding cut takes riders; place cuts
(Party Cove, the Dam, the Island, swim stop) leave out active tubing only,
every moment of a clip that has a rider moment, while a tube or a mat at the
stop and shots under way stay in [8, 9]; a file with its own entry in
`_media-tags.json` "files" (a still's entry first, then its clip's) goes only in
the places its own "locations" list, in the swim-stop cut only when its own
"activities" say "swimming" (a swim stop at the Dam lists both and may feed
both), and "tubing" in its activities keeps it out of every place and swim-stop cut, so a folder tagged with several places no
longer feeds every clip into every place (his review of the Island cut, 5 Oct
2026); without an entry the folder's tags decide; Party Cove, the Dam and the Island open
on the place's best `_scenery` moment (a Completed still named
`<clip>_tNNNN_scenery.jpg`, kind "scenery" in moments.json, never zoomed),
charters before outings [7]; the night cut takes everything in a folder tagged
night cruise or fireworks (by name, or "fireworks" in `_media-tags.json`
activities), its finished clips and its photos named as night shots, and any
"firework" file elsewhere: the folder decides, not the clock [1, 4, 6]; the
glow cut is the whole event, daytime pre-party first, then the night, by clip
time or else brightness [15]; occasion cuts (birthday, bachelorette, corporate)
take any shot. Across themes: no song a '(Claude)' draft used in the last 7 days
while the list has another, night songs up-tempo first [11, 5]; clips another
theme used in a draft built in the last 7 days (`clips` in themes-built.json)
go to the back, other trips' clips first and a repeat only if the cut would be
thin [12]; no "glitch" or "mosaic" transitions [13].
doNotUse and timeRestricted files never go in. A theme with fewer than four
usable shots is reported as thin and not built (Corporate, as of 5 Oct 2026).
Drafts are dated, "Party Cove compilation 2026-10-03 (Claude)",
so a rebuild never overwrites one he has edited. He exports them into
`Photos\02 Charters\_Compilations`.

## Rules these encode (all his, 2 Oct 2026)

- A shot is a vetted moment: a still Coral already promoted into Completed,
  found in its clip, held only while the camera stays on that scene (a swing to
  the helm or tower ends it). Riders get a punch-in centred on them.
- In: riders, group shots, anything exciting, people having fun. Out: phones,
  dash close-ups, the swing away.
- Music only from his shelf (CapCut Commercial only), copied as CapCut's own
  entry so the licence travels with it. Fun, energetic or trending, matched to
  the trip. Every cut on the song's beat; the video is cut to the song.
- Never: a restricted folder (NDA, NOT FOR USE, Not used), `_Unsorted`, a file
  on doNotUse (the held nudity clips among them), or a previous compilation.

## CapCut quirks found building the pilot

- CapCut 9.x refuses a draft from capcut-cli's bundled template. `init
  --template auto` seeds from a project CapCut itself made, so one must exist.
- `add-video` given a duration records the file as that long; add at full
  length, then `trim`.
- `trim` never shrinks the draft's total length: `fix-duration.mjs` does.
- `register --materials --apply` before the song goes on (so the song's cache
  file is not registered as an imported clip), plain `register --apply` after.
- `render` ignores keyframes; check zoom framing by simulating the crop.

## Folder renames (3 Oct 2026)

`moments.json` is keyed by folder name, and the clip paths inside it carry the
folder too. When folders are renamed (every charter gained its tags on 3 Oct
2026), re-run `python locate_moments.py` with no arguments: it re-finds every
moment under the new names and drops keys for folders that no longer exist.
`recap-charter.js` re-locates its own charter each run, so recaps never depend
on a stale entry. The drafts themselves are safe: the CLI copies each clip into
the draft's own `assets` folder.
