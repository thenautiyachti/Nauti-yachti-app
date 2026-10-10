"""Plan a CapCut recap for each charter from moments.json + the Music shelf.

python plan_recaps.py [charter-substring ...]     writes plans/<name>.json

Rules, all from the owner (2 Oct 2026): every cut on the song's beat; a shot is
a vetted moment (a Completed still found in its clip) held only as long as the
camera stays on it; riders punched in; fun/energetic/trending shelf songs only,
matched to the trip; no song twice in a row.
"""
import os, re, sys, json, math, time, subprocess
import numpy as np
from PIL import Image, ImageOps
from locate_moments import folder_dir  # _By charter or _outings

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = r"C:\Users\immex\Documents\_MyFiles\_The Nauti Yachti LLC\Photos\02 Charters\_By charter"
WC, HC = 1080, 1920
shelf = json.load(open(os.path.join(HERE, "shelf.json"), encoding="utf-8"))
SONG = {}
for s in shelf:
    SONG.setdefault(s["name"].split("（")[0].strip(), s)  # the duplicate Unstoppable collapses

# Trip type per charter, from what the footage showed today.
TYPE = {
    "2026-08-29 Ashlea": "family", "2026-08-15 Chance": "family", "2026-08-12 Anna": "riding",
    "2026-08-07 Jorge": "riding", "2026-07-27 Lori": "riding", "2026-07-08 Tasha": "riding",
    "2026-07-03 Brett": "riding", "2026-06-20 Andrew": "family", "2026-06-09 Nagdy": "riding",
    "2026-06-07 Labron": "party", "2026-05-30 V.ission": "party", "2026-05-23 Sara": "birthday",
    "2026-05-17 Rheya": "bachelorette", "2026-05-16 Sheena": "riding", "2026-04-03 Rachel": "birthday",
    "2026-03-28 Tony": "party", "2026-03-21 Alexis Pownell": "bachelorette", "2026-03-14 Megan": "family",
    "2025-09-06 Char": "bachelorette", "2025-09-04 Rocio": "party", "2025-09-01 Ashtyne": "birthday",
    "2025-08-23 Christina": "riding", "2025-08-17 Sherrie": "family", "2025-08-09 Renard": "bachelorette",
    "2025-08-07 Anari": "night", "2025-07-29 Anari": "night", "2025-08-06 John": "family",
}
SONGS = {
    "riding": ["MCE", "Ibiza Aura", "ESSA MINA PERIGOSA", "AIN'T GONNA STOP", "Unstoppable"],
    "party": ["Yes Daddy", "Ibiza Aura", "Tropical Beach Vibes", "All of Me", "MCE"],
    "bachelorette": ["Yes Daddy", "All of Me", "Milky Way", "Ibiza Aura"],
    "birthday": ["Milky Way", "Tropical Beach Vibes", "All of Me", "I'll Never Let You Go"],
    "family": ["Tropical Beach Vibes", "Milky Way", "I'll Never Let You Go", "Unstoppable"],
    # Up-tempo first. Owner, 5 Oct 2026 (question 5): "Sometimes the sunset
    # cruises are more of a 'lets get drunk on a boat at night' so calm music may
    # not work." The calm one (CALM) is only taken when nothing else is left.
    "night": ["DAT GAT", "Smoke", "FOCUS ON THE PROCESS", "Beauty Finds Its Way"],
}
CALM = {"Beauty Finds Its Way"}
# Shelf songs CapCut will not export without Pro: its Export button turns into
# "Join Pro to export" (the 5 Oct 2026 Birthday compilation, twice). Never chosen.
PRO_ONLY = {"I'll Never Let You Go"}
# Songs he has thrown out. Never chosen, even if one is still on the shelf or
# creeps back into a list. Owner, 6 Oct 2026, on the tubing-wakeboarding v3
# compilation: "whatever song was in tubing-wakeboarding v3 was terrible. Please
# remove that song off the media shelf and use a different one."
BANNED = {"BLUE AURA FUNK"}
# Owner, 5 Oct 2026 (question 11): no song another cut used within the week,
# while the list has another. A '(Claude)' draft modified in the last 7 days counts.
RECENT_DAYS = 7
HOOK = {"riding": "Day on the water, Lake Conroe", "party": "Party day on Lake Conroe", "bachelorette": "Bachelorette on Lake Conroe",
        "birthday": "Birthday on the water", "family": "Family day on Lake Conroe", "night": "Night cruise on Lake Conroe"}
# No "glitch" or "mosaic" (owner, 5 Oct 2026, question 13): they flash a black or
# pixelated frame mid-video. Nor "blocks" (black strips and pixel noise) or
# "flip-ii" (a small card on black), caught on the rebuilt theme cuts' contact
# sheets the same evening, for the same reason. plan_themes.py uses this list too.
TRANS = ["pull-in", "white-flash", "split-iv", "slide", "whirlpool", "radial-blur", "shutter", "woosh"]
END = "Book your day\nthenautiyachti.com"
TARGET_SHOT, MAX_SHOTS, MAX_LEN = 2.6, 24, 59.0  # up to 59s (owner, 10 Oct 2026)
# AT LEAST 40 SECONDS when the trip has the media (owner, 10 Oct 2026, of
# Erika's 18-second recap: "we should try to make it a standard to have the
# compilation video at least 40 seconds to a minute long ... assuming there's
# enough media"). It was 9 shots because only 10 were ever asked for: the pool
# was padded with photos to 10 and no further, and a bachelorette kept 3 riders.
# Now the pool is filled to MIN_LEN with the trip's vetted photos and, if still
# short, its riders. A recap under MIN_LEN is printed with "SHORT" so Coral adds
# picks to Completed and rebuilds.
MIN_LEN = 40.0
PHOTO = re.compile(r"\.(jpe?g|png)$", re.I)
FROM_VIDEO = re.compile(r"_(still\d+|t\d{4})", re.I)
_dims = {}

def dims(path):
    if path not in _dims:
        if PHOTO.search(path):
            im = ImageOps.exif_transpose(Image.open(path)); _dims[path] = im.size
        else:
            r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation", "-of", "json", path], capture_output=True, text=True)
            st = json.loads(r.stdout)["streams"][0]; w, h = st["width"], st["height"]
            rot = abs(int(next((d.get("rotation", 0) for d in st.get("side_data_list", []) if "rotation" in d), 0)))
            _dims[path] = (h, w) if rot in (90, 270) else (w, h)
    return _dims[path]

# How far a rider is punched in: times the scale that fills the frame, so 3.0
# leaves the rider about a quarter of the frame's width (the trip-page stills
# use 4.5x and he took the softness as the trade). Raised from 2.0 on 5 Oct
# 2026, the first day the zoom rendered at all; at 2.0 a tube was a speck.
RIDER_ZOOM = 3.0
# A wake-surfer rides close behind the boat and is already big in the frame;
# at RIDER_ZOOM the Kickoff party's surfer came out as a torso. Owner, 6 Oct
# 2026: "if wakesurfing then we need not to zoom in 4x, just lessen it
# slightly". 25% less: a portrait clip goes from 4x to 3x. Used for a rider
# shot whose clip is tagged activity "wakesurfing" in its own "files" entry or
# on its charter or outing (rider_zoom).
WAKESURF_ZOOM = 2.25
WAKESURF_WORDS = {"wakesurfing", "wake surfing", "wakesurf", "wake surf"}

def wakesurf_trip(folder):
    """A charter or outing tagged wakesurfing: its _media-tags.json entry, or its folder name."""
    if not folder: return False
    try: t = json.load(open(TAGS, encoding="utf-8"))["charters"].get(folder) or {}
    except Exception: t = {}
    groups = re.findall(r"\(([^)]*)\)", folder)
    words = {w.strip().lower() for w in (groups[-1].split(",") if groups else [])}
    return "wakesurfing" in t.get("activities", []) or bool(words & WAKESURF_WORDS)

def rider_zoom(clip):
    """RIDER_ZOOM, or WAKESURF_ZOOM when the rider's clip is a wake surf."""
    if "wakesurfing" in (file_tag(clip).get("activities") or []): return WAKESURF_ZOOM
    return WAKESURF_ZOOM if wakesurf_trip(trip_of(clip)) else RIDER_ZOOM

def cover(w, h):
    fit = min(WC / w, HC / h); return max(WC / (w * fit), HC / (h * fit)), fit

def place(path, u=None, v=None, z=1.0):
    """uniform scale and position for a shot; (u, v) = subject as source fractions.

    Scale is in CapCut's units, 1.0 = the whole picture fitted to the canvas.
    Only a rider (u, v given) is zoomed: z times the scale that fills the frame,
    centred on them. Everything else stays at 1.0, the whole picture, and the
    bars a 4:3 shot leaves are filled with blur after export (blur-bars.js).
    Owner, 5 Oct 2026: blurred background rather than cropping people off the
    edges of group shots; "when wakeboarding or tubing we need a zoom on them".
    Until then every shot was set to fill, but nothing was zoomed at all: the
    scale went out under a key CapCut 9.5 does not read (see build-from-plan.js).
    """
    w, h = dims(path); cv, fit = cover(w, h); s = cv * z
    if u is None: return 1.0, 0.0, 0.0
    Wd, Hd = w * fit * s, h * fit * s
    dx, dy = -(u - 0.5) * Wd, (0.45 - 0.5) * HC - (v - 0.5) * Hd
    mx, my = (Wd - WC) / 2, (Hd - HC) / 2
    dx, dy = max(-mx, min(mx, dx)), max(-my, min(my, dy))
    return round(s, 4), round(dx / (WC / 2), 4), round(-dy / (HC / 2), 4)

def gray(path, width):
    im = ImageOps.exif_transpose(Image.open(path)).convert("L")
    return np.asarray(im.resize((width, max(1, round(im.height * width / im.width)))), np.float32)

def rider_pos(crop_path, base_path):
    """Where a _rider crop sits in its base frame -> rider (u, v), or None."""
    B = gray(base_path, 112); H, W = B.shape
    c = ImageOps.exif_transpose(Image.open(crop_path)).convert("L")
    best = None
    for z in (1.7, 2.0, 2.2, 2.5, 3.0, 3.5, 4.0, 4.5):
        tw = round(W / z); th = round(tw * c.height / c.width)
        if th >= H or tw < 8: continue
        T = np.asarray(c.resize((tw, th)), np.float32); T = (T - T.mean()) / (T.std() + 1e-6)
        win = np.lib.stride_tricks.sliding_window_view(B, (th, tw))[::2, ::2]
        m = win.mean(axis=(2, 3)); sd = win.std(axis=(2, 3)) + 1e-6
        corr = (np.einsum("ijkl,kl->ij", win, T) / (th * tw) - m * T.mean()) / sd
        i, j = np.unravel_index(corr.argmax(), corr.shape)
        if best is None or corr[i, j] > best[0]: best = (corr[i, j], z, i * 2, j * 2, th, tw)
    if best is None or best[0] < 0.6: return None
    _, z, y, x, th, tw = best
    return (x + tw / 2) / W, (y + th / 2) / H - 0.08 * th / H

def song_grid(song, need):
    bf = json.load(open(song["beats_path"]))
    times = [t / 1000 for t in bf["time"]]; vals = bf["value"]; en = bf.get("energy") or [1] * len(times)
    # A shelf entry can be a 60s clip of a longer song while its beat map covers
    # the whole song ("AIN'T GONNA STOP": map to 176s, audio 60s). Only beats
    # inside the clip exist.
    keep = [i for i, t in enumerate(times) if t < song["dur"] - 0.15]
    times = [times[i] for i in keep]; vals = [vals[i] for i in keep]; en = [en[i] for i in keep]
    beat = float(np.median(np.diff(times)))
    downs = [i for i, v in enumerate(vals) if v == 1]
    best = None
    for i in downs:
        j = next((k for k in range(i, len(times)) if times[k] - times[i] >= need - 0.01), None)
        if j is None: break
        e = float(np.mean(en[i:j + 1]))
        if best is None or e > best[0]: best = (e, i)
    start = best[1] if best else (downs[0] if downs else 0)
    return times, start, beat

def choose_song(names, used, avoid=()):
    """A song from a list (his order), for a recap or a theme.

    Never a BANNED or PRO_ONLY song. Never one in `avoid` (the song just used)
    while another is on the shelf; no
    song a '(Claude)' draft used in the last RECENT_DAYS while the list has one
    that was not (question 11); a calm song only when nothing else is left
    (question 5); then the least used, list order breaking ties. When every
    song on the list was used this week, the one used longest ago.
    """
    have = [n for n in names if n in SONG and n not in PRO_ONLY and n not in BANNED]
    if not have: raise SystemExit("none of these songs is on his Music shelf (or exportable without Pro, or not banned): " + ", ".join(names))
    recent = used.setdefault("_recent", {})
    pool = [n for n in have if n not in avoid] or have
    fresh = [n for n in pool if n not in recent]
    if fresh: name = sorted(fresh, key=lambda n: (n in CALM, used.get(n, 0)))[0]
    else: name = min(pool, key=lambda n: (n in CALM, recent[n]))
    used[name] = used.get(name, 0) + 1; used["last"] = name
    recent[name] = time.time()  # a later cut in this same run counts it as used this week
    return SONG[name]

def pick_song(kind, used):
    return choose_song(SONGS[kind], used, {used.get("last")})

def song_history(skip=()):
    """Songs already used by Claude-built drafts in his CapCut library.

    Each scheduled run plans one charter, so a per-run counter would pick the
    first song on the list every time. The library itself is the memory: count
    the shelf songs on every '(Claude)' draft, and note the newest one's song so
    it is not used twice in a row. "_recent" holds each song used by a draft
    modified in the last RECENT_DAYS, with that draft's time.

    skip: draft-name prefixes left out, the drafts a rebuild replaces (owner,
    5 Oct 2026: "a cut being replaced does not count").
    """
    store = os.path.join(os.environ["LOCALAPPDATA"], "CapCut", "User Data", "Projects", "com.lveditor.draft")
    used, newest, recent = {}, (0, None), {}
    since = time.time() - RECENT_DAYS * 86400
    for n in os.listdir(store) if os.path.isdir(store) else []:
        f = os.path.join(store, n, "draft_content.json")
        if "(Claude)" not in n or not os.path.exists(f) or n.startswith(tuple(skip)): continue
        try: d = json.load(open(f, encoding="utf-8"))
        except Exception: continue
        mt = os.path.getmtime(f)
        for a in d.get("materials", {}).get("audios", []):
            key = (a.get("name") or "").split("\uff08")[0].strip()
            if key in SONG:
                used[key] = used.get(key, 0) + 1
                if mt > newest[0]: newest = (mt, key)
                if mt >= since: recent[key] = max(recent.get(key, 0), mt)
    if newest[1]: used["last"] = newest[1]
    used["_recent"] = recent
    return used

_FT = None
def file_tag(path):
    """A file's own entry in _media-tags.json "files" (keyed by its path under
    Photos, forward slashes), or {}."""
    global _FT
    if _FT is None:
        try: _FT = json.load(open(TAGS, encoding="utf-8")).get("files", {})
        except Exception: _FT = {}
    try: rel = os.path.relpath(path, os.path.dirname(TAGS)).replace("\\", "/")
    except ValueError: return {}
    return _FT.get(rel) or {}

def shots_for(folder, moments):
    base = folder_dir(folder); done = os.path.join(base, "Completed")
    out = []
    for m in moments:
        span = m["b"] - m["a"]
        if span < 1.0: continue
        sh = {"kind": m["kind"], "file": m["clip"], "t": m["t"], "a": m["a"], "b": m["b"], "dur_clip": m["dur"], "still": m["still"]}
        # A still's "role" in its _media-tags.json entry (5 Oct 2026): "scenery",
        # the place's wide shot a place cut opens on, or "occasion", the bride,
        # the hats, the cake. Tagged rather than renamed, so the guests' trip
        # pages keep their file names. "_scenery" in the name still counts.
        role = file_tag(os.path.join(done, m["still"])).get("role")
        if role: sh["role"] = role
        if role == "scenery" and m["kind"] != "rider": sh["kind"] = "scenery"
        if m["kind"] == "rider":
            crop = os.path.join(done, m["still"]); b = m["still"].replace("_rider", "")
            basep = next((p for p in (os.path.join(done, b), os.path.join(base, "_from video", b)) if os.path.exists(p)), None)
            pos = rider_pos(crop, basep) if basep else None
            if pos: sh["uv"] = pos
            else: sh["kind"] = "people"
        out.append(sh)
    # one shot per moment of a clip: merge moments closer than 2.5s, keep the longer span
    out.sort(key=lambda s: (s["file"], s["t"]))
    merged = []
    for s in out:
        if merged and merged[-1]["file"] == s["file"] and abs(merged[-1]["t"] - s["t"]) < 2.5:
            cur = merged[-1]
            if s["kind"] != "rider" and cur.get("role") and not s.get("role"): continue  # a tagged moment is kept
            if (s["b"] - s["a"]) > (cur["b"] - cur["a"]) or s["kind"] == "rider" \
                    or (s.get("role") and not cur.get("role") and cur["kind"] != "rider") \
                    or (s["kind"] == "scenery" and cur["kind"] == "people"): merged[-1] = s
        else: merged.append(s)
    # photos that were taken, not pulled from video, fill thin charters
    # Stills fill thin charters: photos actually taken first, then the punched-in
    # rider stills, then any other vetted frame whose moment is not already a clip.
    used = {s["still"] for s in merged}
    imgs = [f for f in (os.listdir(done) if os.path.isdir(done) else []) if PHOTO.search(f) and f not in used and not f.startswith("lv_")]
    rank = lambda f: (0 if not FROM_VIDEO.search(f) else 1 if "_rider" in f else 2, f)
    return merged, [os.path.join(done, f) for f in sorted(imgs, key=rank)]

TAGS = r"C:\Users\immex\Documents\_MyFiles\_The Nauti Yachti LLC\Photos\_media-tags.json"

# NO REPEATS WITHIN A CUT. Owner, 6 Oct 2026, on the Island v3 compilation: "in
# the middle of the island video it also looks like the same media used twice".
# It was: Coral's montage "2024-07-20_the-island_9x16.mp4" holds the same raw
# footage as her cut "2024-07-20_island_rafted-at-the-shoreline_9x16.mp4", and
# the one-moment-per-clip rule only compared file names. So, as each shot is
# placed: no two shots of one clip whose source spans overlap or come within
# REPEAT_GAP seconds, and no two shots of one trip whose frames look alike
# (sibling cuts of one clip, a burst of near-identical photos). Riders are not
# compared with riders by look (a day's tows all show a wake behind one boat);
# two riders from one clip still meet the gap rule. A skipped shot makes the cut
# shorter: never a repeat to fill the song.
REPEAT_GAP = 3.0
OTHER_RIDERS = 3  # rider shots at most in a recap of a trip that is not a riding trip (plan)
LOOKALIKE = 24.0  # mean |diff| of 24x24 grey frames, 0-255. Island repeat: ~12-20; other shots of a trip: 40+.
# Two PHOTOS of one trip are held to a looser bar, and a photo is also compared
# by its centre square: Completed folders hold one picture under two names and
# shapes (Alexis Guidry's "group-in-the-water" is a Facebook photo renamed: 0.4
# by centre square; Toshia Mills's family photo as a 4x5 crop and in full: 33.5
# full frame). Different photos of one day scored 39 and up (6 Oct 2026).
PHOTO_LOOKALIKE = 38.0
# THE OWNER'S PHONE MEDIA COMES FIRST (10 Oct 2026). Files named Snapchat-<n>
# are saved from his own camera roll: "media labeled like this should be flagged
# for a more definitive use as it's going to be great quality. Great moments."
# The glasses footage is still scanned and picked as before. So:
#  - every Snapchat VIDEO in the charter folder goes into the recap directly,
#    in segments of about a shot each across the clip (it never needed a pick);
#  - every Snapchat PHOTO goes in, and is dropped as a repeat only when it is
#    nearly the same picture. Erika's four Island group photos (two standing,
#    two sitting in the water) were all thrown out as "looks like" one another
#    at PHOTO_LOOKALIKE, because the beach and the tree behind them match;
#  - Snapchat shots are the last to be trimmed when the cut is too long.
SNAP = re.compile(r"^snapchat", re.I)
SNAP_LOOKALIKE = 12.0
SNAP_SEGMENTS = 5  # most shots from one Snapchat video

def is_snap(path):
    return bool(SNAP.search(os.path.basename(path or "")))

def clip_seconds(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except ValueError: return 0.0

def snap_clip_shots(base, shot_len):
    """Shots from the owner's Snapchat videos: evenly across the clip, skipping
    the first and last 8% (the phone settling, the thumb on the button)."""
    out = []
    for f in sorted(os.listdir(base)):
        if not (is_snap(f) and re.search(r"\.(mp4|mov|m4v)$", f, re.I)): continue
        clip = os.path.join(base, f); d = clip_seconds(clip)
        if d < 1.5: continue
        lo, hi = d * 0.08, d * 0.92
        n = max(1, min(SNAP_SEGMENTS, int((hi - lo) // max(shot_len, 1.0))))
        for k in range(n):
            t = lo + (hi - lo) * (k + 0.5) / n
            half = min(shot_len / 2, (hi - lo) / (2 * n))
            out.append({"kind": "people", "file": clip, "t": t, "a": max(0.0, t - half), "b": min(d, t + half),
                        "dur_clip": d, "still": None, "snap": True})
    return out

def too_close(placed, file, frm, dur, gap=REPEAT_GAP):
    """A placed shot of the same file whose source span overlaps [frm, frm+dur] or
    comes within `gap` seconds of it."""
    return any(p["file"] == file and frm < p["from"] + p["dur"] + gap and frm + dur > p["from"] - gap for p in placed)

def trip_of(path):
    """The charter or outing folder a file sits in (the folder under _By charter or _outings)."""
    d = os.path.dirname(path)
    while d and os.path.dirname(d) != d:
        if os.path.basename(os.path.dirname(d)) in ("_By charter", "_outings"): return os.path.basename(d)
        d = os.path.dirname(d)
    return None

def look(path, frm=0.0, dur=0.0, image=False, n=4):
    """Small grey frames across a shot's source span (a photo: whole and centre square)."""
    out = []
    vfs = ["scale=24:24,format=gray", "crop=min(iw\\,ih):min(iw\\,ih),scale=24:24,format=gray"] if image else ["scale=24:24,format=gray"]
    for k in range(1 if image else n):
        ss = [] if image else ["-ss", "%.3f" % (frm + dur * (k + 0.5) / n)]
        for vf in vfs:
            r = subprocess.run(["ffmpeg", "-v", "error"] + ss + ["-i", path, "-frames:v", "1", "-vf", vf,
                                "-f", "rawvideo", "-"], capture_output=True)
            if len(r.stdout) == 576: out.append(np.frombuffer(r.stdout, np.uint8).astype(float))
    return out

def lookalike(a, b, th=LOOKALIKE):
    return bool(a and b) and min(float(np.mean(np.abs(x - y))) for x in a for y in b) < th

def repeats(placed, sh, kind):
    """Why this shot would repeat one already placed in the cut, or None. `sh` is
    the planned shot (file, from, dur, image); it gains its look for later shots."""
    if too_close(placed, sh["file"], sh["from"], sh["dur"]): return "same clip within %.0fs" % REPEAT_GAP
    trip = trip_of(sh["file"])
    sh["_look"] = look(sh["file"], sh["from"], sh["dur"], sh.get("image"))
    for p in placed:
        if kind == "rider" and p.get("_kind") == "rider": continue
        th = PHOTO_LOOKALIKE if sh.get("image") and p.get("image") else LOOKALIKE
        if is_snap(sh["file"]) and is_snap(p["file"]): th = SNAP_LOOKALIKE  # his phone: only a near-identical one is a repeat
        if trip and trip_of(p["file"]) == trip and lookalike(p.get("_look"), sh["_look"], th):
            return "looks like %s @%.1f" % (os.path.basename(p["file"]), p["from"])
    return None

def trip_kind(folder):
    """The trip's type from Coral's charter tags first; TYPE only when untagged.

    2 Oct 2026: four recap titles built from my visual guess contradicted the
    tags (a "Bachelorette" that was booked as tubing and glow, a "Family day"
    that was a birthday). The tags are what was booked, so they win.
    """
    try: t = json.load(open(TAGS, encoding="utf-8"))["charters"].get(folder) or {}
    except Exception: t = {}
    pk, act = set(t.get("packages", [])), set(t.get("activities", []))
    if "bachelor-bachelorette" in pk: return "bachelorette"
    if "birthday" in pk: return "birthday"
    if pk & {"night-cruise", "boatz-and-glowz"} and not pk & {"tubing-wakeboarding"}: return "night"
    if "tubing-wakeboarding" in pk or act & {"tubing", "wakeboarding", "wakesurfing"}: return "riding"
    if "party-cove" in pk or "dancing" in act: return "party"
    if pk or act: return "family"
    return next((v for k, v in TYPE.items() if folder.startswith(k)), "family")

def plan(folder, moments, used):
    kind = trip_kind(folder)
    clips, photos = shots_for(folder, moments)
    if kind != "riding":
        # Riders lead a RIDING recap. On any other trip they are part of the day,
        # not all of it: the Kickoff party's first recap (6 Oct 2026), titled for
        # a bachelorette, spent 22 of its 35 seconds on one wake-surfer because
        # every riding clip had a rider still. "An occasion cut must show the
        # occasion, not the day" (owner, 5 Oct 2026). Keep the longest-held few.
        riders = sorted((s for s in clips if s["kind"] == "rider"), key=lambda s: -(s["b"] - s["a"]))
        dropped_riders = riders[OTHER_RIDERS:]
        extra = {id(s) for s in dropped_riders}
        clips = [s for s in clips if id(s) not in extra]
        photos = [p for p in photos if "_rider" not in os.path.basename(p)]  # not back in as fill photos
    else:
        dropped_riders = []
    if len(clips) + len(photos) < 3: return None
    song = pick_song(kind, used)
    bpm_beat = 60.0 / (song["bpm"] or 100)
    nb = max(2, int(round(TARGET_SHOT / bpm_beat / 2)) * 2)
    shot_len = nb * bpm_beat
    pool = clips[:]
    # His Snapchat videos go in whole (see SNAP), and his Snapchat photos ahead
    # of every other photo.
    pool += snap_clip_shots(folder_dir(folder), shot_len)
    snap_photos = [p for p in photos if is_snap(p)]
    pool += [{"kind": "photo", "file": p, "snap": True} for p in snap_photos]
    photos = [p for p in photos if not is_snap(p)]
    # Enough shots for MIN_LEN, filled GENEROUSLY. Erika's v2 (10 Oct 2026) came
    # out at 24s from 13 shots: short moments run under shot_len, and the photos
    # added to make up the number were mostly near-repeats of moments already in
    # the cut and were skipped below. So fill to the most the cut can hold
    # (MAX_LEN) and let the trimming below choose: riders held back first (real
    # motion, at most a third of the cut on an occasion trip), then photos.
    fill_to = min(MAX_SHOTS, int(MAX_LEN // shot_len))
    # Tubing always earns its third (owner, 10 Oct 2026: "Maybe add a few more of
    # them tubing"), whether or not the pool is already full: the trimming below
    # keeps riders ahead of everything but his own phone media.
    while dropped_riders and sum(s["kind"] == "rider" for s in pool) + 1 <= max(OTHER_RIDERS, fill_to // 3):
        pool.append(dropped_riders.pop(0))
    if len(pool) < fill_to:
        pool += [{"kind": "photo", "file": p} for p in photos[:fill_to - len(pool)]]
    max_shots = min(MAX_SHOTS, int(MAX_LEN // shot_len), len(pool))
    if len(pool) > max_shots:  # keep riders and the longest-held moments, spread across the day
        keep = sorted(pool, key=lambda s: (not s.get("snap"), s["kind"] != "rider", -(s.get("b", 0) - s.get("a", 0))))[:max_shots]
        pool = [s for s in pool if s in keep]
    riders = [s for s in pool if s["kind"] == "rider"]
    held = lambda s: s.get("b", 0) - s.get("a", 0)
    good_riders = [s for s in riders if held(s) >= shot_len]
    hook = max(good_riders or [s for s in pool if s["kind"] != "photo"] or pool, key=held)
    # Riders straight after the opener, then the rest of the day in order. Left
    # in time order, a rider filmed late was the shot the song ran out before
    # (Nagdy, 5 Oct 2026), and tubing is the main seller.
    pool = [hook] + [s for s in riders if s is not hook] + [s for s in pool if s is not hook and s not in riders]
    need = sum(min(shot_len * (2 if s is hook else 1), max(2 * bpm_beat, (s.get("b", 99) - s.get("a", 0)))) for s in pool)
    # Too long for the song: drop the shortest-held shot that is not a rider.
    # This used to drop from the end of the day, which on 5 Oct 2026 threw out
    # Nagdy's only usable rider (filmed at 8pm) and left a tubing recap with no
    # one on a tube. Owner: "when wakeboarding or tubing we need a zoom on them".
    while len(pool) > 1 and need > song["dur"] - 1:
        rest = pool[1:]
        victim = min([s for s in rest if s["kind"] != "rider"] or rest, key=held)
        pool.remove(victim); need -= shot_len
    times, i0, beat = song_grid(song, need)
    t0 = times[i0]; at = 0.0; k = i0; shots = []
    for s in pool:
        want = nb * (2 if s is hook else 1)
        if s["kind"] != "photo":
            fit = int((s["b"] - s["a"]) / beat)
            want = max(2, min(want, fit - (fit % 2) if fit >= 2 else 2))
            # A FULL SHOT around a short moment (10 Oct 2026). The span a..b is
            # only how long the frame stays still, often a second on glasses
            # footage, and capping every shot to it made Erika's recap 13 shots of
            # 1.8s. A non-rider shot now runs at least shot_len centred on the
            # vetted moment (clamped to the clip); riders keep the cap below.
            if s["kind"] != "rider": want = max(want, nb)
        # A zoomed rider is framed for one moment: at 4x the camera's drift
        # loses them within a couple of seconds (Nagdy's 4.6 s opener, 5 Oct
        # 2026, showed mostly water). Four beats at most, centred on the moment.
        if s["kind"] == "rider": want = min(want, 4)
        if k + want >= len(times): break
        dur = times[k + want] - times[k]
        sh = {"at": round(times[k] - t0, 3), "dur": round(dur, 3)}
        if s["kind"] == "photo":
            sc, x, y = place(s["file"])
            sh.update({"file": s["file"], "image": True, "from": 0, "scale": sc, "x": x, "y": y, "kb": 1.08})
        else:
            lo, hi = max(0.0, s["a"] - 0.25), min(s["dur_clip"], s["b"] + 0.25)
            frm = min(max(s["t"] - dur / 2, lo), max(lo, hi - dur))
            frm = max(0.0, min(frm, s["dur_clip"] - dur - 0.05))
            if s["kind"] == "rider": sc, x, y = place(s["file"], *s["uv"], z=rider_zoom(s["file"]))
            else: sc, x, y = place(s["file"])
            sh.update({"file": s["file"], "from": round(frm, 3), "scale": sc, "x": x, "y": y, "kind": s["kind"], "still": s.get("still")})
        why = repeats(shots, sh, s["kind"])  # owner, 6 Oct 2026: "the same media used twice"
        if why:
            print("  skip %s @%.1f: %s" % (os.path.basename(s["file"]), sh["from"], why), file=sys.stderr); continue
        sh["_kind"] = s["kind"]; shots.append(sh); k += want
    for sh in shots: sh.pop("_look", None); sh.pop("_kind", None)
    if len(shots) < 3: return None
    length = round(times[k] - t0, 3)
    date = folder[:10]; who = re.sub(r"\s*\(.*$", "", folder[11:]).split(" + ")[0].strip()
    return {"name": "%s %s recap (Claude)" % (date, who), "kind": kind, "song": {"id": song["id"], "name": song["name"], "start": round(t0, 3), "length": length},
            "hook": HOOK[kind], "endText": END, "trans": TRANS, "shots": shots}

if __name__ == "__main__":
    moments = json.load(open(os.path.join(HERE, "moments.json")))
    os.makedirs(os.path.join(HERE, "plans"), exist_ok=True)
    used = song_history()
    for folder in sorted(moments, reverse=True):
        if sys.argv[1:] and not any(x.lower() in folder.lower() for x in sys.argv[1:]): continue
        if folder.startswith("2026-09-06 Oscar"): continue  # hand-built today
        p = plan(folder, moments[folder], used)
        if not p: print("skip (too little):", folder); continue
        if os.environ.get("RECAP_NAME"): p["name"] = os.environ["RECAP_NAME"]  # recap-charter.js --rebuild: "... recap v2 (Claude)"
        fn = os.path.join(HERE, "plans", re.sub(r"[^\w.-]+", "_", p["name"]) + ".json")
        json.dump(p, open(fn, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print("%-44s %-12s %-22s %5.1fs %2d shots (%d rider, %d photo)%s" % (p["name"][:44], p["kind"], p["song"]["name"][:22], p["song"]["length"], len(p["shots"]),
              sum(s.get("kind") == "rider" for s in p["shots"]), sum(bool(s.get("image")) for s in p["shots"]),
              "  SHORT: under %ds, add picks to Completed and rebuild" % MIN_LEN if p["song"]["length"] < MIN_LEN else ""))
