# CapCut drafts: charter recaps and theme compilations

Built 2 Oct 2026. Claude lays the cut into the owner's CapCut desktop library;
he opens it, adjusts, and exports. Nothing here publishes anything.

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
trips it drew on and its song, so the next build is judged against that and does
not repeat the song. Out of season nothing changes and nothing is built.

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
approves each post). Per theme: the riding cut takes riders; place cuts (Party
Cove, the Dam, the Island, swim stop) leave riders out, since tubing happens in
open water; night and glow cuts take only clips shot from 7:30pm by their own
timestamp; occasion cuts (birthday, bachelorette, corporate) take any shot.
doNotUse and timeRestricted files never go in. A theme with fewer than four
usable shots is reported as thin and not built (Night Cruise and Corporate, as
of 3 Oct 2026). Drafts are dated, "Party Cove compilation 2026-10-03 (Claude)",
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
