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
tubed out on open water, not in the cove. So:
  * place cuts (Party Cove, the Dam, the Island, swim stop) leave riders out;
  * the riding cut takes riders, and people shots only to fill it out;
  * night and glow cuts take only clips shot from 7:30pm (the clip's own
    timestamp), so a daytime clip from a night-cruise booking stays out
    (owner, 3 Oct 2026, of Ivy's: "it wasn't really nighttime");
  * the glow nights' Completed holds finished clips and photos rather than
    frames from video, so the glow cut also takes those, except any whose
    name says daylight ("..._rafted-daytime_3x4.jpg");
  * occasion cuts (birthday, bachelorette, corporate) take any shot: the whole
    trip was the occasion.

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
# which carries none (so it never counts as night).
CLIP_TIME = re.compile(r"^(?:\d{8}_|\d{4}-\d{2}-\d{2}[_-])(\d{2})(\d{2})")
# Coral names finished files by what they show; these say daylight.
DAYLIGHT = re.compile(r"(?:^|[_-])(?:daytime|day|blue-sky|sunny|afternoon)(?:[_-]|\.|$)", re.I)
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
    ("night-cruise", "Night Cruise", {"night cruise"}, "Night cruise on Lake Conroe",
     ["Smoke", "DAT GAT", "FOCUS ON THE PROCESS", "Beauty Finds Its Way"], "night"),
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


def is_night(clip):
    m = CLIP_TIME.match(os.path.basename(clip))
    if not m: return False
    mins = int(m.group(1)) * 60 + int(m.group(2))
    return mins >= NIGHT_FROM or mins < 5 * 60


def trips_for(tags):
    """Folders carrying any of these tags: charters newest first, then outings newest first."""
    out = []
    for root in (pr.ROOT, OUTINGS):
        fs = [f for f in (os.listdir(root) if os.path.isdir(root) else []) if re.match(r"\d{4}-\d{2}-\d{2} ", f)
              and os.path.isdir(os.path.join(root, f)) and not RESTRICTED.search(f) and folder_tags(f) & tags]
        out += sorted(fs, reverse=True)
    return out


def sources(tags, rule, moments):
    """{trip: (clips, photos)} for every tagged trip with something usable, in
    trips_for order (dicts keep it). Its keys are what "changed" is judged on: a
    trip tagged before its Completed is curated contributes nothing yet, so it
    is not counted until it does, and the theme is rebuilt then."""
    held = do_not_use()
    per = {f: best_shots(f, moments.get(f, []), rule, held) for f in trips_for(tags)}
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


def best_shots(folder, ms, rule, held):
    clips, photos = pr.shots_for(folder, ms)
    clips = [s for s in clips if not any(h in os.path.basename(s["file"]) for h in held)
             and not re.search(r"montage|^lv_|_theme_|compilation", os.path.basename(s["file"]), re.I)]
    if rule == "place": clips = [s for s in clips if s["kind"] != "rider"]
    if rule in ("night", "glow"): clips = [s for s in clips if is_night(s["file"])]
    span = lambda s: s["b"] - s["a"]
    jitter = (lambda: random.uniform(0.4, 1.6)) if SHUFFLE else (lambda: 1.0)
    if rule == "riding": clips.sort(key=lambda s: (s["kind"] != "rider", -span(s) * jitter()))
    else: clips.sort(key=lambda s: -span(s) * jitter())
    for s in clips: s["charter"] = folder
    # Photos actually taken (not frames pulled from video) can fill a thin cut;
    # never on a night cruise, where the timestamp that keeps day footage out is
    # missing. A glow night's photos are named by what they show instead.
    pics = [p for p in photos if not pr.FROM_VIDEO.search(os.path.basename(p))
            and not any(h in os.path.basename(p) for h in held)]
    if rule == "night": pics = []
    if rule == "glow":
        clips += [c for c in finished_clips(folder, held) if not DAYLIGHT.search(os.path.basename(c["file"]))]
        pics = [p for p in one_shape_each(pics) if not DAYLIGHT.search(os.path.basename(p))]
    return clips, pics


def pick_song(names, used, avoid):
    have = [n for n in names if n in pr.SONG]
    if not have: raise SystemExit("none of these songs is on his Music shelf: " + ", ".join(names))
    pool = [n for n in have if n not in avoid] or have
    name = sorted(pool, key=lambda n: used.get(n, 0))[0]
    used[name] = used.get(name, 0) + 1; used["last"] = name
    return pr.SONG[name]


def pool_for(per, rule, max_shots):
    """The shots in cut order: charters first, round-robin, riders first in the
    riding cut, photos only to round out a thin theme, the best hold first."""
    if rule == "riding":  # people shots only once the riders run out
        riders = {f: [s for s in c if s["kind"] == "rider"] for f, (c, _) in per.items()}
        fill = {f: [s for s in c if s["kind"] != "rider"] for f, (c, _) in per.items()}
    else:
        riders, fill = {f: c for f, (c, _) in per.items()}, {f: [] for f in per}
    # Three per trip keeps it fair; a theme only two trips carry may take more
    # from each, so it still makes a cut worth posting. Charters are taken in
    # full before any outing (paying guests lead).
    cap = max(MAX_PER_CHARTER, math.ceil(12 / max(1, len(per))))
    groups = [[f for f in per if os.path.isdir(os.path.join(pr.ROOT, f))], [f for f in per if not os.path.isdir(os.path.join(pr.ROOT, f))]]
    if SHUFFLE:  # charters still lead outings; which charter comes first varies
        for g in groups: random.shuffle(g)
    pool = []
    for group in groups:
        for bucket in (riders, fill):
            for r in range(cap):
                for f in group:
                    if len(pool) < max_shots and r < len(bucket[f]): pool.append(bucket[f][r])
    if len(pool) < 8:  # a thin theme: his own photos round it out, round-robin
        for group in groups:
            for r in range(cap):
                for f in group:
                    if len(pool) < max_shots and r < len(per[f][1]): pool.append({"kind": "photo", "file": per[f][1][r], "charter": f})
    clips = [s for s in pool if s["kind"] in ("rider", "people")]
    clips = [s for s in clips if os.path.isdir(os.path.join(pr.ROOT, s["charter"]))] or clips  # a charter opens it
    if clips:  # open on the best thing: the longest-held rider, else the longest hold
        hook_s = max(clips, key=lambda s: (s["kind"] == "rider" if rule != "place" else 0, s["b"] - s["a"]))
        pool = [hook_s] + [s for s in pool if s is not hook_s]
    return pool


def signature(per, rule):
    """What the cut would be made of, whatever song it gets: the pool at the
    longest a cut can run (22 shots). Unchanged means a rebuild would give the
    same shots, so none is made. Compared rather than the list of trips,
    because an outing whose photos only fill thin themes can join a theme's
    trips without changing a single shot of it."""
    return [os.path.basename(s["file"]) + ("@%s" % s["t"] if "t" in s else "") for s in pool_for(per, rule, 22)]


def plan_theme(slug, title, tags, hook, songs, rule, moments, used, prev_song):
    per = sources(tags, rule, moments)
    song = pick_song(songs, used, {used.get("last"), prev_song})
    beat = 60.0 / (song.get("bpm") or 100)
    nb = max(2, int(round(pr.TARGET_SHOT / beat / 2)) * 2)  # beats per shot, even
    max_shots = min(22, int(min(58.0, song["dur"] - 1) // (nb * beat)))
    pool = pool_for(per, rule, max_shots)
    if len(pool) < 4:
        return None, {"theme": slug, "charters": len(per), "shots": len(pool)}
    times, i0, b = pr.song_grid(song, len(pool) * nb * beat)
    t0 = times[i0]; k = i0; shots = []; used_charters = []
    for s in pool:
        want = nb
        if s["kind"] in ("rider", "people"):
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
            "signature": signature(per, rule),
            "song": {"id": song["id"], "name": song["name"], "start": round(t0, 3), "length": round(times[k] - t0, 3)},
            "hook": hook, "endText": pr.END, "trans": pr.TRANS, "shots": shots}, None


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--all" in sys.argv or bool(args)
    moments = json.load(open(os.path.join(HERE, "moments.json")))
    state = json.load(open(STATE, encoding="utf-8")) if os.path.exists(STATE) else {}
    used = pr.song_history()
    os.makedirs(os.path.join(HERE, "plans"), exist_ok=True)
    out = {"plans": [], "unchanged": [], "thin": []}
    for slug, title, tags, hook, songs, rule in THEMES:
        if args and slug not in args: continue
        if not force and signature(sources(tags, rule, moments), rule) == state.get(slug, {}).get("signature"):
            out["unchanged"].append(slug); continue
        p, thin = plan_theme(slug, title, tags, hook, songs, rule, moments, used, state.get(slug, {}).get("song"))
        if thin: out["thin"].append(thin); continue
        f = os.path.join(HERE, "plans", re.sub(r"[^\w.-]+", "_", p["name"]) + ".json")
        json.dump(p, open(f, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        out["plans"].append({"theme": slug, "file": f, "name": p["name"], "charters": len(p["used"]),
                             "shots": len(p["shots"]), "seconds": p["song"]["length"], "song": p["song"]["name"]})
    print(json.dumps(out, ensure_ascii=False))
