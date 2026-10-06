"""Theme compilations: one CapCut draft per theme, cut across every charter
carrying that theme's tag.

python plan_themes.py                plan the themes whose charters changed
python plan_themes.py --all          plan every theme, changed or not
python plan_themes.py party-cove     plan just that theme (by slug)

Writes plans/<draft name>.json per plan and prints ONE JSON line:
{"plans": [{theme, file, name, charters, shots, seconds, song}], "unchanged": [...], "thin": [...]}

Owner, 3 Oct 2026: "a Party Cove collaboration of all charters we've had that
have gone to Party Cove, pulling the best moments of each one of them. We can
then use these compilations of all the Party Cove events together to post on
social media for general Party Cove ideas. This logic should follow for every
theme that we have as well."

WHERE THE MEDIA COMES FROM. Since 3 Oct 2026 there are no theme folders: a
trip's themes are the tags in brackets in its folder name, "2026-06-20 Andrew
Mason (tubing, the dam)". So a theme draws on every folder whose tags name it:
charters (02 Charters/_By charter) FIRST, then his own outings
(02 Charters/_outings), which may be posted with his approval ("It can be used
for posts too. I'll be able to stage gate it", 3 Oct 2026). Every charter gets
its shots before any outing gets one, so paying guests lead.

WHAT A SHOT IS. The same vetted moments as the charter recaps (moments.json: a
Completed still found in its clip, held while the camera stays on it), so a
theme cut is only as good as Coral's curation of each charter's Completed.
"Best" per charter: riders first where riding is the theme, then the longest
steady holds. At most three per charter, interleaved newest charter first, so
every charter that went there is in before any one gets a second shot.

A TAG IS ABOUT THE TRIP, NOT EVERY FRAME. A charter tagged (party cove, tubing)
tubed out on open water, not in the cove. So (owner's answers, 5 Oct 2026):
  * place cuts (Party Cove, the Dam, the Island, swim stop) leave out ACTIVE
    tubing only: every moment of a clip that has a rider moment (that clip is a
    tow). A tube or a mat at the stop is fine, and so are shots under way
    (questions 8, 9). A file with its own _media-tags.json "files" entry goes
    only in the places it lists, in swim stop only with "swimming", and never
    with "tubing" (place_ok). A place
    cut opens on its best _scenery moment, charters before outings (question 7);
  * the riding cut takes riders, and people shots only to fill it out;
  * night: the folder decides, not the clock (questions 1, 6). Every clip in a
    folder tagged night cruise or fireworks (by name, or "fireworks" in its
    _media-tags.json activities) counts, its finished clips too, and its
    photos named as night shots (night, sparklers, a champagne toast, stars,
    sunset, fireworks; question 4). Elsewhere a file named "firework" counts;
  * glow: the whole event, day and night (question 15): the glow nights'
    finished clips and photos too, the daytime pre-party first, then the
    night (clip time where the name has one, else brightness);
  * occasion cuts (birthday, bachelorette, corporate) take any shot: the whole
    trip was the occasion.

ACROSS THEMES (question 12). Clips another theme used in a draft built in the
last 7 days (themes-built.json) go to the back of the pool: other trips'
clips first, then repeats only if the cut would otherwise be thin. Songs: none
used by a '(Claude)' draft in the last 7 days while the list has another
(question 11, plan_recaps.choose_song).

Never: a restricted folder (NDA, NOT FOR USE, Not used...), a clip on the
doNotUse list in _media-tags.json, _Unsorted, a previous compilation.

WHEN. A theme is planned only when the shots it would be cut from differ from
its last build (signature(), recorded in themes-built.json by
theme-compilations.js after the draft is built). A newly tagged charter with
vetted moments changes them; an outing whose photos only round out thin themes
usually does not. Out of season nothing changes, so nothing is built.
"""
import os, re, sys, json, math, random, datetime, subprocess
import plan_recaps as pr
from locate_moments import RESTRICTED, OUTINGS, folder_dir

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "themes-built.json")
HELD = ("20250920_211850_303ad61a", "20260919_194633_cdb085fe")  # also on doNotUse; belt and braces
NIGHT_FROM = 19 * 60 + 30
# The library's clip names carry the time four ways: 20250807_195648_x.mp4,
# 2025-09-01_1951_desc.mp4, 2026-05-17-224019723.mp4, and Snapchat-123.mp4,
# which carries none. Only the glow cut's day-then-night order reads it now.
CLIP_TIME = re.compile(r"^(?:\d{8}_|\d{4}-\d{2}-\d{2}[_-])(\d{2})(\d{2})")
# Coral names finished files by what they show. These are night shots (question 4).
NIGHT_NAME = re.compile(r"night|sparkler|champagne|toast|(?<![a-z])stars?(?![a-z])|sunset|firework", re.I)
FIREWORK = re.compile(r"firework", re.I)
NIGHT_TAGS = {"night cruise", "fireworks", "firework"}
# A frame this bright (mean luma, 0-255) is daylight. harvest-stills.js measured
# the 19 Sep glow night: daylight 136-169, night 11-40.
DAY_LUMA = 80
PLACES = {"party-cove", "the-dam", "the-island"}  # cuts that open on a _scenery moment
PLACE_LOC = {"party cove": "party-cove", "the dam": "the-dam", "the island": "the-island"}  # folder tag -> _media-tags location
PHOTOS = os.path.dirname(pr.TAGS)
THIN = 8  # under this many shots a theme is thin: photos, then repeats, round it out
RECENT_DAYS = 7
SHAPE = re.compile(r"_(\d{1,2}x\d{1,2})(?:_raw)?(?=\.)")
SHAPE_PREF = {"9x16": 0, "4x5": 1, "3x4": 2, "1x1": 3, "16x9": 4}  # the cut is 9:16
VIDEO = re.compile(r"\.(mp4|mov)$", re.I)
MAX_PER_CHARTER = 3
# --shuffle (Coral's daily random compilation, owner 5 Oct 2026: "They should be
# created at random"): the longest holds still tend to win, but each build draws
# a different mix of shots and trips, so a theme made twice is two cuts.
SHUFFLE = "--shuffle" in sys.argv

# slug, title, tags (any of), hook, songs (from his Music shelf), shot rule
THEMES = [
    ("tubing-wakeboarding", "Tubing & Wakeboarding", {"tubing", "wakeboarding"}, "Tubing & wakeboarding on Lake Conroe",
     ["BLUE AURA FUNK", "MCE", "ESSA MINA PERIGOSA", "AIN'T GONNA STOP", "Unstoppable"], "riding"),
    ("party-cove", "Party Cove", {"party cove"}, "Party Cove, Lake Conroe",
     ["Tropical Beach Vibes", "Yes Daddy", "Ibiza Aura", "MCE"], "place"),
    ("the-dam", "The Dam", {"the dam"}, "A day at the Dam",
     ["Ibiza Aura", "Tropical Beach Vibes", "Milky Way"], "place"),
    ("the-island", "The Island", {"the island"}, "The Island, Lake Conroe",
     ["Milky Way", "Tropical Beach Vibes", "Ibiza Aura"], "place"),
    ("swim-stop", "Swim Stop", {"swim stop"}, "Swim stop on Lake Conroe",
     ["Tropical Beach Vibes", "Milky Way", "Unstoppable"], "place"),
    ("birthday", "Birthday", {"birthday"}, "Birthdays on the water",
     ["Milky Way", "Tropical Beach Vibes", "All of Me", "I'll Never Let You Go"], "any"),
    ("bachelorette", "Bachelor & Bachelorette", {"bachelorette", "bachelor", "bachelor or bachelorette"}, "Bachelorette on Lake Conroe",
     ["Yes Daddy", "All of Me", "Milky Way", "Ibiza Aura"], "any"),
    ("boatz-and-glowz", "Boatz & Glowz", {"glow"}, "Boatz & Glowz night",
     ["MCE", "DAT GAT", "Smoke", "FOCUS ON THE PROCESS"], "glow"),
    ("night-cruise", "Night Cruise", NIGHT_TAGS, "Night cruise on Lake Conroe",
     ["DAT GAT", "Smoke", "FOCUS ON THE PROCESS", "Beauty Finds Its Way"], "night"),  # up-tempo first (question 5)
    ("corporate", "Corporate", {"corporate"}, "Team day on Lake Conroe",
     ["Unstoppable", "Tropical Beach Vibes", "Milky Way"], "any"),
]


def folder_tags(folder):
    """'2026-08-15 Chance (birthday,party cove, tubing)' -> {'birthday', 'party cove', 'tubing'}."""
    groups = re.findall(r"\(([^)]*)\)", folder)
    return {w.strip().lower() for w in (groups[-1].split(",") if groups else []) if w.strip()}


def do_not_use():
    """doNotUse, plus timeRestricted: a clip cleared only outside some seconds
    ("we can block 16s-20s") is left out of an automatic cut entirely, because
    the window here is picked by rule, not by someone who has read the note."""
    try:
        t = json.load(open(pr.TAGS, encoding="utf-8"))
        keys = list(t.get("doNotUse", {})) + list(t.get("timeRestricted", {}))
    except Exception: keys = []
    return tuple(keys) + HELD


def clip_minutes(clip):
    """Minutes after midnight from the clip's name, or None (Snapchat-123.mp4)."""
    m = CLIP_TIME.match(os.path.basename(clip))
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


_MT = None
def media_tags():
    global _MT
    if _MT is None:
        try: _MT = json.load(open(pr.TAGS, encoding="utf-8"))
        except Exception: _MT = {}
    return _MT


def night_folder(folder):
    """A night trip by its folder, whatever its clips' names or stamps say.
    Owner, 5 Oct 2026: "the folder will designate if it's a night cruise at
    all", and "fireworks are a clear designation for night cruise too"."""
    if folder_tags(folder) & NIGHT_TAGS: return True
    t = media_tags().get("charters", {}).get(folder) or {}
    return "night-cruise" in t.get("packages", []) or "fireworks" in t.get("activities", [])


def firework_files(folder):
    done = os.path.join(folder_dir(folder), "Completed")
    return any(FIREWORK.search(f) for f in (os.listdir(done) if os.path.isdir(done) else []))


def trips_for(tags, rule=None):
    """Folders carrying any of these tags: charters newest first, then outings
    newest first. The night cut also takes a fireworks folder (by its
    _media-tags.json activities) and any folder holding a "firework" file."""
    out = []
    for root in (pr.ROOT, OUTINGS):
        fs = [f for f in (os.listdir(root) if os.path.isdir(root) else []) if re.match(r"\d{4}-\d{2}-\d{2} ", f)
              and os.path.isdir(os.path.join(root, f)) and not RESTRICTED.search(f)
              and (folder_tags(f) & tags or rule == "night" and (night_folder(f) or firework_files(f)))]
        out += sorted(fs, reverse=True)
    return out


def sources(tags, rule, moments):
    """{trip: (clips, photos)} for every tagged trip with something usable, in
    trips_for order (dicts keep it). Its keys are what "changed" is judged on: a
    trip tagged before its Completed is curated contributes nothing yet, so it
    is not counted until it does, and the theme is rebuilt then."""
    held = do_not_use()
    loc = next((PLACE_LOC[t] for t in tags if t in PLACE_LOC), None) if rule == "place" else None
    if rule == "place" and "swim stop" in tags: loc = "swimming"  # the swim stop is an activity, not a place
    per = {f: best_shots(f, moments.get(f, []), rule, held, loc) for f in trips_for(tags, rule)}
    return {f: v for f, v in per.items() if v[0] or v[1]}


def one_shape_each(files):
    """'x_3x4.jpg' and 'x_9x16.jpg' are one shot cut two ways: keep the one nearest 9:16."""
    best = {}
    for f in files:
        m = SHAPE.search(f); stem = SHAPE.sub("", f).lower(); rank = SHAPE_PREF.get(m.group(1), 9) if m else 5
        if stem not in best or rank < best[stem][0]: best[stem] = (rank, f)
    return sorted(v[1] for v in best.values())


def finished_clips(folder, held):
    """Short finished clips Coral put in a charter's Completed (the glow nights' kind)."""
    done = os.path.join(folder_dir(folder), "Completed")
    fs = [f for f in (os.listdir(done) if os.path.isdir(done) else []) if VIDEO.search(f)
          and not any(h in f for h in held) and not re.search(r"montage|^lv_|_theme_|compilation|recap", f, re.I)]
    return [{"kind": "themeclip", "file": os.path.join(done, f), "charter": folder} for f in one_shape_each(fs)]


def clip_seconds(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    try: return float(r.stdout.strip() or 0)
    except ValueError: return 0.0


def file_entry(path):
    """A file's own entry in _media-tags.json "files" (keyed by its path under
    Photos, forward slashes), or None."""
    try: rel = os.path.relpath(path, PHOTOS).replace("\\", "/")
    except ValueError: return None
    return media_tags().get("files", {}).get(rel)


def place_ok(entries, loc):
    """Per-file places (owner, 5 Oct 2026, reviewing the Island and Dam cuts): a
    folder tagged with several places must not feed every clip into every place
    cut. A file with its own entry (the still's first, then its clip's) goes
    only in the place cuts its own "locations" list ("open-water" is none of
    them), and in the swim-stop cut (loc "swimming") only when its own
    "activities" say swimming; a swim stop AT the Dam lists both and feeds both.
    "tubing" in its activities is active tubing, never in a place or swim-stop
    cut. No entry: the folder's tags decide."""
    entries = [e for e in entries if e]
    if any("tubing" in e.get("activities", []) for e in entries): return False
    if not entries or loc is None: return True
    return loc in entries[0].get("activities" if loc == "swimming" else "locations", [])


def best_shots(folder, ms, rule, held, loc=None):
    clips, photos = pr.shots_for(folder, ms)
    clips = [s for s in clips if not any(h in os.path.basename(s["file"]) for h in held)
             and not re.search(r"montage|^lv_|_theme_|compilation", os.path.basename(s["file"]), re.I)]
    if rule == "place":
        # Active tubing only: a clip with any rider moment is a tow, so none of
        # its moments go in (question 9). The rider kind alone missed the frames
        # either side of the rider still. A rider moment's clip is read from the
        # raw moments, since shots_for turns an unplaced rider into "people".
        tow = {m["clip"] for m in ms if m.get("kind") == "rider"}
        done = os.path.join(folder_dir(folder), "Completed")
        clips = [s for s in clips if s["file"] not in tow and place_ok(
            [file_entry(os.path.join(done, s["still"])) if s.get("still") else None, file_entry(s["file"])], loc)]
        photos = [p for p in photos if place_ok([file_entry(p)], loc)]
    # Night: the whole of a night folder counts (question 1); anywhere else only
    # what is named for fireworks (question 4).
    whole_night = rule == "night" and night_folder(folder)
    if rule == "night" and not whole_night:
        clips = [s for s in clips if FIREWORK.search(os.path.basename(s["file"])) or FIREWORK.search(s.get("still") or "")]
    span = lambda s: s["b"] - s["a"]
    jitter = (lambda: random.uniform(0.4, 1.6)) if SHUFFLE else (lambda: 1.0)
    if rule == "riding": clips.sort(key=lambda s: (s["kind"] != "rider", -span(s) * jitter()))
    else: clips.sort(key=lambda s: -span(s) * jitter())
    for s in clips: s["charter"] = folder
    # Photos actually taken (not frames pulled from video) can fill a thin cut.
    # A night cut takes those named as night shots (question 4); a glow cut the
    # whole event, day and night (question 15), its finished clips too.
    pics = [p for p in photos if not pr.FROM_VIDEO.search(os.path.basename(p))
            and not any(h in os.path.basename(p) for h in held)]
    if rule == "night":
        named = NIGHT_NAME if whole_night else FIREWORK
        clips += [c for c in finished_clips(folder, held) if whole_night or FIREWORK.search(os.path.basename(c["file"]))]
        pics = [p for p in one_shape_each(pics) if named.search(os.path.basename(p))]
    if rule == "glow":
        clips += finished_clips(folder, held)
        pics = one_shape_each(pics)
    return clips, pics


def pick_song(names, used, avoid):
    return pr.choose_song(names, used, avoid)


def pool_for(per, rule, max_shots, avoid=frozenset(), scenery=False):
    """The shots in cut order: charters first, round-robin, riders first in the
    riding cut, photos only to round out a thin theme, the best hold first.

    avoid: clip names other themes used this week (question 12). Those go to
    the back: every other trip's clip first (charters, then outings), then
    photos, and a repeat only if the cut is still thin. signature() passes
    none, so another theme's build never makes this one look changed.
    scenery: a place cut, opened on its best _scenery moment (question 7)."""
    name = lambda s: os.path.basename(s["file"])
    if rule == "riding":  # people shots only once the riders run out
        riders = {f: [s for s in c if s["kind"] == "rider"] for f, (c, _) in per.items()}
        fill = {f: [s for s in c if s["kind"] != "rider"] for f, (c, _) in per.items()}
    else:
        riders, fill = {f: c for f, (c, _) in per.items()}, {f: [] for f in per}
    photos = {f: [{"kind": "photo", "file": p, "charter": f} for p in ps] for f, (_, ps) in per.items()}
    split = lambda b, rep: {f: [s for s in v if (name(s) in avoid) == rep] for f, v in b.items()}
    # Three per trip keeps it fair; a theme only two trips carry may take more
    # from each, so it still makes a cut worth posting. Charters are taken in
    # full before any outing (paying guests lead).
    cap = max(MAX_PER_CHARTER, math.ceil(12 / max(1, len(per))))
    groups = [[f for f in per if os.path.isdir(os.path.join(pr.ROOT, f))], [f for f in per if not os.path.isdir(os.path.join(pr.ROOT, f))]]
    if SHUFFLE:  # charters still lead outings; which charter comes first varies
        for g in groups: random.shuffle(g)
    pool = []
    def take(*buckets, lo=0, hi=cap):
        for group in groups:
            for bucket in buckets:
                for r in range(lo, hi):
                    for f in group:
                        if len(pool) < max_shots and r < len(bucket[f]): pool.append(bucket[f][r])
    take(split(riders, False), split(fill, False))
    # Short of about a dozen: more of the same trips' unused clips, past the cap,
    # before any photo or repeat (question 12: another clip before a repeat).
    if len(pool) < 12: take(split(riders, False), split(fill, False), lo=cap, hi=max([cap] + [len(c) for c, _ in per.values()]))
    if len(pool) < THIN: take(split(photos, False))  # a thin theme: his own photos round it out
    if len(pool) < THIN: take(split(riders, True), split(fill, True), split(photos, True))  # repeats last
    clips = [s for s in pool if s["kind"] in ("rider", "people", "scenery")]
    clips = [s for s in clips if name(s) not in avoid] or clips
    clips = [s for s in clips if os.path.isdir(os.path.join(pr.ROOT, s["charter"]))] or clips  # a charter opens it
    hook_s = None
    if scenery:  # the place itself first: its best wide shot, a charter's before an outing's
        for group in groups:
            wide = [s for f in group for s in per[f][0] if s["kind"] == "scenery"]
            if wide: hook_s = max(wide, key=lambda s: s["b"] - s["a"]); break
    if hook_s is None and clips:  # open on the best thing: the longest-held rider, else the longest hold
        hook_s = max(clips, key=lambda s: (s["kind"] == "rider" if rule != "place" else 0, s["b"] - s["a"]))
    if hook_s is not None:
        pool = ([hook_s] + [s for s in pool if s is not hook_s])[:max_shots]
    return pool


def luma_at(path, t=None):
    """Mean brightness (0-255) of one frame: t seconds into a clip, or a photo."""
    r = subprocess.run(["ffmpeg", "-v", "error"] + (["-ss", "%.2f" % t] if t is not None else []) +
                       ["-i", path, "-frames:v", "1", "-vf", "signalstats,metadata=print:file=-", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.search(r"YAVG=([\d.]+)", r.stdout or "")
    return float(m.group(1)) if m else 128.0


def day_then_night(pool):
    """The glow cut in the event's order (question 15): the daytime pre-party,
    then the night. By the clip's own time where its name has one, otherwise by
    measured brightness, bright first."""
    def key(s):
        mins = clip_minutes(s["file"])
        if mins is not None:
            return (mins >= NIGHT_FROM or mins < 5 * 60, 0, (mins - 5 * 60) % 1440)
        t = None if s["kind"] == "photo" else clip_seconds(s["file"]) * 0.4 if s["kind"] == "themeclip" else s["t"]
        y = luma_at(s["file"], t)
        return (y < DAY_LUMA, 1, -y)
    return [s for _, _, s in sorted((key(s), i, s) for i, s in enumerate(pool))]


def recent_clips(state, days=RECENT_DAYS):
    """{theme: clip names its draft used} for every theme built in the last
    `days` (themes-built.json). theme-compilations.js records "clips" since
    5 Oct 2026; before that the plan file named for the draft is read, and
    failing that the theme's signature."""
    plans = {}
    for fn in os.listdir(os.path.join(HERE, "plans")) if os.path.isdir(os.path.join(HERE, "plans")) else []:
        try: p = json.load(open(os.path.join(HERE, "plans", fn), encoding="utf-8"))
        except Exception: continue
        if p.get("kind") == "theme": plans[p.get("name")] = p
    out, today = {}, datetime.date.today()
    for slug, rec in state.items():
        try: built = datetime.date.fromisoformat(rec.get("built") or "")
        except ValueError: continue
        if (today - built).days > days: continue
        if rec.get("clips"): out[slug] = set(rec["clips"])
        elif rec.get("draft") in plans: out[slug] = {os.path.basename(s["file"]) for s in plans[rec["draft"]]["shots"]}
        else: out[slug] = {x.split("@")[0] for x in rec.get("signature") or []}
    return out


def signature(per, rule, scenery=False):
    """What the cut would be made of, whatever song it gets: the pool at the
    longest a cut can run (22 shots). Unchanged means a rebuild would give the
    same shots, so none is made. Compared rather than the list of trips,
    because an outing whose photos only fill thin themes can join a theme's
    trips without changing a single shot of it."""
    return [os.path.basename(s["file"]) + ("@%s" % s["t"] if "t" in s else "") for s in pool_for(per, rule, 22, scenery=scenery)]


def plan_theme(slug, title, tags, hook, songs, rule, moments, used, prev_song, avoid=frozenset()):
    per = sources(tags, rule, moments)
    song = pick_song(songs, used, {used.get("last"), prev_song})
    beat = 60.0 / (song.get("bpm") or 100)
    nb = max(2, int(round(pr.TARGET_SHOT / beat / 2)) * 2)  # beats per shot, even
    max_shots = min(22, int(min(58.0, song["dur"] - 1) // (nb * beat)))
    pool = pool_for(per, rule, max_shots, avoid, slug in PLACES)
    if rule == "glow": pool = day_then_night(pool)
    if len(pool) < 4:
        return None, {"theme": slug, "charters": len(per), "shots": len(pool)}
    times, i0, b = pr.song_grid(song, len(pool) * nb * beat)
    t0 = times[i0]; k = i0; shots = []; used_charters = []
    for s in pool:
        want = nb
        if s["kind"] in ("rider", "people", "scenery"):
            fit = int((s["b"] - s["a"]) / b); want = max(2, min(nb, fit - fit % 2 if fit >= 2 else 2))
        # A zoomed rider is framed for one moment: at 4x the camera's drift
        # loses them within a couple of seconds (Nagdy's 4.6 s opener, 5 Oct
        # 2026, showed mostly water). Four beats at most, centred on the moment.
        if s["kind"] == "rider": want = min(want, 4)
        if k + want >= len(times): break
        dur = times[k + want] - times[k]; sh = {"at": round(times[k] - t0, 3), "dur": round(dur, 3)}
        if s["kind"] == "photo":
            sc, x, y = pr.place(s["file"]); sh.update({"file": s["file"], "image": True, "from": 0, "scale": sc, "x": x, "y": y, "kb": 1.08})
        elif s["kind"] == "themeclip":
            d = clip_seconds(s["file"])
            if d < dur + 0.2: continue
            frm = max(0.0, min(d * 0.4 - dur / 2, d - dur - 0.1))
            sc, x, y = pr.place(s["file"]); sh.update({"file": s["file"], "from": round(frm, 3), "scale": sc, "x": x, "y": y, "kind": "themeclip"})
        else:
            lo, hi = max(0.0, s["a"] - 0.25), min(s["dur_clip"], s["b"] + 0.25)
            frm = max(0.0, min(min(max(s["t"] - dur / 2, lo), max(lo, hi - dur)), s["dur_clip"] - dur - 0.05))
            sc, x, y = pr.place(s["file"], *s["uv"], z=pr.RIDER_ZOOM) if s["kind"] == "rider" and s.get("uv") else pr.place(s["file"])
            sh.update({"file": s["file"], "from": round(frm, 3), "scale": sc, "x": x, "y": y, "kind": s["kind"]})
        shots.append(sh); k += want
        if s["charter"] not in used_charters: used_charters.append(s["charter"])
    if len(shots) < 4:
        return None, {"theme": slug, "charters": len(per), "shots": len(shots)}
    name = "%s compilation %s (Claude)" % (title, datetime.date.today().isoformat())
    return {"name": name, "kind": "theme", "theme": slug, "charters": sorted(per), "used": used_charters,
            "signature": signature(per, rule, slug in PLACES),
            "song": {"id": song["id"], "name": song["name"], "start": round(t0, 3), "length": round(times[k] - t0, 3)},
            "hook": hook, "endText": pr.END, "trans": pr.TRANS, "shots": shots}, None


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--all" in sys.argv or bool(args)
    moments = json.load(open(os.path.join(HERE, "moments.json")))
    state = json.load(open(STATE, encoding="utf-8")) if os.path.exists(STATE) else {}
    used = pr.song_history()
    # Clips each other theme used this week, and those planned earlier in this
    # run (question 12: "No clip repeated across themes built the same week").
    week = recent_clips(state)
    os.makedirs(os.path.join(HERE, "plans"), exist_ok=True)
    out = {"plans": [], "unchanged": [], "thin": []}
    for slug, title, tags, hook, songs, rule in THEMES:
        if args and slug not in args: continue
        if not force and signature(sources(tags, rule, moments), rule, slug in PLACES) == state.get(slug, {}).get("signature"):
            out["unchanged"].append(slug); continue
        avoid = frozenset().union(*[v for k, v in week.items() if k != slug])
        p, thin = plan_theme(slug, title, tags, hook, songs, rule, moments, used, state.get(slug, {}).get("song"), avoid)
        if thin: out["thin"].append(thin); continue
        week[slug] = {os.path.basename(s["file"]) for s in p["shots"]}
        f = os.path.join(HERE, "plans", re.sub(r"[^\w.-]+", "_", p["name"]) + ".json")
        json.dump(p, open(f, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        out["plans"].append({"theme": slug, "file": f, "name": p["name"], "charters": len(p["used"]),
                             "shots": len(p["shots"]), "seconds": p["song"]["length"], "song": p["song"]["name"]})
    print(json.dumps(out, ensure_ascii=False))
