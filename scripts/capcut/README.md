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
    python plan_themes.py       # theme compilations from theme folders + charter moments
    node build-all.js           # each plan -> a draft in his CapCut library

`build-from-plan.js` builds one plan; `snap-to-beats.mjs` snaps an existing
draft's cuts to the beats of a song he added himself; `recut-to-song.js` was the
one-off re-cut of Oscar's draft to "REFLECTION".

## Rules these encode (all his, 2 Oct 2026)

- A shot is a vetted moment: a still Coral already promoted into Completed,
  found in its clip, held only while the camera stays on that scene (a swing to
  the helm or tower ends it). Riders get a punch-in centred on them.
- In: riders, group shots, anything exciting, people having fun. Out: phones,
  dash close-ups, the swing away.
- Music only from his shelf (CapCut Commercial only), copied as CapCut's own
  entry so the licence travels with it. Fun, energetic or trending, matched to
  the trip. Every cut on the song's beat; the video is cut to the song.
- Never: the NDA charter, `_Unsorted`, the two held nudity clips, a previous
  compilation, or 2025-09-27 footage outside The Dam.

## CapCut quirks found building the pilot

- CapCut 9.x refuses a draft from capcut-cli's bundled template. `init
  --template auto` seeds from a project CapCut itself made, so one must exist.
- `add-video` given a duration records the file as that long; add at full
  length, then `trim`.
- `trim` never shrinks the draft's total length: `fix-duration.mjs` does.
- `register --materials --apply` before the song goes on (so the song's cache
  file is not registered as an imported clip), plain `register --apply` after.
- `render` ignores keyframes; check zoom framing by simulating the crop.
