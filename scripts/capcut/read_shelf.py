"""Read the owner's Music shelf (a CapCut project) into shelf.json.

python read_shelf.py

The shelf is the CapCut project named "media shelf": tracks he added from
Commercial only. Each entry keeps CapCut's material id (so add-shelf-song.mjs
can copy it with its licence), plus tempo and the beat map CapCut downloaded.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
SHELF = os.path.join(os.environ["LOCALAPPDATA"], "CapCut", "User Data", "Projects", "com.lveditor.draft", "media shelf", "draft_content.json")
d = json.load(open(SHELF, encoding="utf-8")); m = d["materials"]
beats = {b["id"]: b for b in m.get("beats", [])}
segs = {s["material_id"]: s for t in d["tracks"] if t["type"] == "audio" for s in t["segments"]}
shelf = []
for a in m.get("audios", []):
    s = segs.get(a["id"]); bp = None
    for r in (s or {}).get("extra_material_refs", []):
        if r in beats: bp = beats[r]["ai_beats"].get("beats_path")
    bpm = None
    if bp and os.path.exists(bp):
        bt = json.load(open(bp))["time"]; gaps = sorted(y - x for x, y in zip(bt, bt[1:])); bpm = round(60000 / gaps[len(gaps) // 2])
    if not s or not bp: continue  # not on the shelf timeline, or no beat map: unusable
    shelf.append({"id": a["id"], "name": a.get("name"), "cat": a.get("category_name"), "dur": a["duration"] / 1e6, "bpm": bpm,
                  "beats_path": bp, "music_id": a.get("music_id"), "path": a.get("path")})
json.dump(shelf, open(os.path.join(HERE, "shelf.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(len(shelf), "shelf tracks")
