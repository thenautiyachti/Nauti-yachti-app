"""Plan theme compilations (CapCut drafts) from theme folders + charter moments.

python plan_themes.py            writes plans/Theme_*.json

Sources per theme: the theme folder's own Completed clips and photos (he filed
them, so the label is his), plus vetted moments from charters of that trip type.
Never: _Unsorted, the NDA charter, the two held nudity clips, a previous
compilation (_theme_, montage, lv_), or anything dated 2025-09-27 outside The Dam.
"""
import os, re, json, random
import plan_recaps as pr

HERE = os.path.dirname(os.path.abspath(__file__))
THEMES = r"C:\Users\immex\Documents\_MyFiles\_The Nauti Yachti LLC\Photos\02 Charters"
HELD = ("20250920_211850_303ad61a", "20260919_194633_cdb085fe")
VID = re.compile(r"\.(mp4|mov)$", re.I)
SHAPE = re.compile(r"_(\d{1,2}x\d{1,2})(?:_raw)?(?=\.)")
PREF = {"9x16": 0, "4x5": 1, "3x4": 2, "1x1": 3, "16x9": 4}
moments = json.load(open(os.path.join(HERE, "moments.json")))

THEME_PLAN = [
    ("Tubing and Wakeboarding", "Theme - Tubing & Wakeboarding (Claude)", "Tubing & wakeboarding on Lake Conroe", "BLUE AURA FUNK", ["riding"], "rider"),
    ("Night Cruise", "Theme - Night Cruise (Claude)", "Night cruise on Lake Conroe", "DAT GAT", ["night"], None),
    ("Party Cove", "Theme - Party Cove (Claude)", "Party Cove, Lake Conroe", "Tropical Beach Vibes", [], None),
    ("The Dam", "Theme - The Dam (Claude)", "A day at the Dam", "Ibiza Aura", [], None),
    ("The Island", "Theme - The Island (Claude)", "The Island, Lake Conroe", "Milky Way", [], None),
    ("Bachelor and Bachelorette", "Theme - Bachelor & Bachelorette (Claude)", "Bachelorette on the water", "Yes Daddy", ["bachelorette"], None),
    ("Birthday", "Theme - Birthday (Claude)", "Birthday on the water", "I'll Never Let You Go", ["birthday"], None),
    ("Boatz and Glowz", "Theme - Boatz & Glowz (Claude)", "Boatz & Glowz night", "MCE", [], None),
    (None, "Theme - Family Day (Claude)", "Family day on Lake Conroe", "Unstoppable", ["family"], None),
    (None, "Theme - Party Boat (Claude)", "Party on the water", "AIN'T GONNA STOP", ["party"], None),
]

def best_of_each(files):
    best = {}
    for f in files:
        m = SHAPE.search(f); stem = SHAPE.sub("", f).lower(); rank = PREF.get(m.group(1), 9) if m else 5
        if stem not in best or rank < best[stem][0]: best[stem] = (rank, f)
    return [v[1] for v in best.values()]

def theme_items(theme):
    d = os.path.join(THEMES, theme, "Completed")
    if not os.path.isdir(d): return [], []
    fs = [f for f in os.listdir(d) if not any(h in f for h in HELD) and not re.search(r"_theme_|montage|^lv_|compilation", f, re.I)]
    if theme != "The Dam": fs = [f for f in fs if "2025-09-27" not in f and not f.startswith("20250927")]
    vids = sorted(best_of_each([f for f in fs if VID.search(f)]))
    pics = sorted(best_of_each([f for f in fs if pr.PHOTO.search(f) and "_SOFT" not in f]))
    return [os.path.join(d, f) for f in vids], [os.path.join(d, f) for f in pics]

def charter_moments(kinds, only=None):
    out = []
    for folder, ms in moments.items():
        kind = next((v for k, v in pr.TYPE.items() if folder.startswith(k)), "family")
        if kinds and kind not in kinds: continue
        sh, _ = pr.shots_for(folder, ms)
        out += [s for s in sh if (only is None or s["kind"] == only)]
    return out

def plan_theme(theme, name, hook, song_name, kinds, only):
    vids, pics = theme_items(theme) if theme else ([], [])
    clips = charter_moments(kinds, only) if kinds else []
    if theme == "Tubing and Wakeboarding": clips += [s for s in charter_moments(["family", "birthday"], "rider")]
    song = pr.SONG[song_name]; beat = 60.0 / (song["bpm"] or 100)
    nb = max(2, int(round(2.6 / beat / 2)) * 2)
    pool = [{"kind": "themeclip", "file": v} for v in vids] + clips + [{"kind": "photo", "file": p} for p in pics]
    if len(pool) < 4: return None
    random.Random(name).shuffle(pool)  # mix sources, but the same mix every run
    riders = [s for s in pool if s["kind"] == "rider" and s["b"] - s["a"] >= nb * beat]
    hook_s = max(riders, key=lambda s: s["b"] - s["a"]) if riders else next((s for s in pool if s["kind"] == "themeclip"), pool[0])
    pool = [hook_s] + [s for s in pool if s is not hook_s]
    max_shots = min(22, int(min(58.0, song["dur"] - 1) // (nb * beat)))
    pool = pool[:max_shots]
    times, i0, b = pr.song_grid(song, max_shots * nb * beat)
    t0 = times[i0]; k = i0; shots = []
    for s in pool:
        want = nb
        if s["kind"] in ("rider", "people"):
            fit = int((s["b"] - s["a"]) / b); want = max(2, min(nb, fit - fit % 2 if fit >= 2 else 2))
        if k + want >= len(times): break
        dur = times[k + want] - times[k]; sh = {"at": round(times[k] - t0, 3), "dur": round(dur, 3)}
        if s["kind"] == "photo":
            sc, x, y = pr.place(s["file"]); sh.update({"file": s["file"], "image": True, "from": 0, "scale": sc, "x": x, "y": y, "kb": 1.08})
        elif s["kind"] == "themeclip":
            import subprocess
            d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", s["file"]], capture_output=True, text=True).stdout or 0)
            if d < dur + 0.2: continue
            frm = max(0.0, min(d * 0.4 - dur / 2, d - dur - 0.1))
            sc, x, y = pr.place(s["file"]); sh.update({"file": s["file"], "from": round(frm, 3), "scale": sc, "x": x, "y": y, "kind": "themeclip"})
        else:
            lo, hi = max(0.0, s["a"] - 0.25), min(s["dur_clip"], s["b"] + 0.25)
            frm = max(0.0, min(min(max(s["t"] - dur / 2, lo), max(lo, hi - dur)), s["dur_clip"] - dur - 0.05))
            sc, x, y = pr.place(s["file"], *s["uv"], z=2.0) if s["kind"] == "rider" else pr.place(s["file"])
            sh.update({"file": s["file"], "from": round(frm, 3), "scale": sc, "x": x, "y": y, "kind": s["kind"]})
        shots.append(sh); k += want
    if len(shots) < 4: return None
    return {"name": name, "kind": "theme", "song": {"id": song["id"], "name": song["name"], "start": round(t0, 3), "length": round(times[k] - t0, 3)},
            "hook": hook, "endText": pr.END, "trans": pr.TRANS, "shots": shots}

if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "plans"), exist_ok=True)
    for row in THEME_PLAN:
        p = plan_theme(*row)
        if not p: print("skip (too little):", row[1]); continue
        json.dump(p, open(os.path.join(HERE, "plans", re.sub(r"[^\w.-]+", "_", p["name"]) + ".json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        c = lambda k: sum(s.get("kind", "photo" if s.get("image") else "") == k for s in p["shots"])
        print("%-42s %-20s %5.1fs %2d shots (themeclips %d, riders %d, moments %d, photos %d)" % (p["name"], p["song"]["name"][:20], p["song"]["length"], len(p["shots"]),
              c("themeclip"), c("rider"), c("people"), sum(bool(s.get("image")) for s in p["shots"])))
