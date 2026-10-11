"""Rebuild a finished recap with the SAME song and shots, only in corrected colour.

    python recolour_recap.py "<charter folder name>"            the plan that made the finished recap
    python recolour_recap.py "<charter folder name>" <plan.json>  a named plan

WHY (10 Oct 2026). Erika Lopez's posted recap (44s, Milky Way) was washed out:
CapCut had been given the glasses' HDR clips unconverted. A normal rebuild
re-plans from scratch, and the planner never reuses the last recap's song, so
it chose a faster one and the cut came out at 35 seconds without the bride, the
Island or the swim stop. Coral stopped rather than file it, and asked for this.

This takes the plan behind the recap already in Completed (found by matching
its length to the finished file), converts its HDR shots (plan_recaps.sdr_shots)
and builds it again under the next free "... recap vN (Claude)" name. Nothing
else changes. Prints one JSON line like recap-charter.js:
    {"built": name, "plan": path, "seconds": n, "from": original plan}
"""
import os, re, sys, json, glob, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import plan_recaps as pr  # noqa: E402
from locate_moments import folder_dir  # noqa: E402

NODE = r"C:\Users\immex\tools\node-v24.19.0-win-x64\node.exe"

def say(code, obj):
    print(json.dumps(obj, ensure_ascii=False)); sys.exit(code)

def seconds(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except ValueError: return None

if len(sys.argv) < 2: say(1, {"error": 'usage: python recolour_recap.py "<charter folder name>" [plan.json]'})
folder = sys.argv[1]
date = folder[:10]; who = re.sub(r"\s*\(.*$", "", folder[11:]).split(" + ")[0].strip()
prefix = re.sub(r"[^\w.-]+", "_", "%s %s recap" % (date, who))
plans = [p for p in glob.glob(os.path.join(HERE, "plans", prefix + "*.json")) if "_for_" not in os.path.basename(p)]

if len(sys.argv) > 2:
    src = sys.argv[2] if os.path.isabs(sys.argv[2]) else os.path.join(HERE, "plans", sys.argv[2])
else:
    done = os.path.join(folder_dir(folder), "Completed")
    finished = [os.path.join(done, f) for f in os.listdir(done) if re.search(r"recap.*\.mp4$", f, re.I)] if os.path.isdir(done) else []
    if not finished: say(1, {"error": "no finished recap in Completed to match"})
    length = seconds(finished[0])
    match = [p for p in plans if abs(json.load(open(p, encoding="utf-8"))["song"]["length"] - (length or -99)) < 0.5]
    if not match: say(1, {"error": "no plan matches the finished recap's %.1fs; name one" % (length or 0)})
    src = max(match, key=os.path.getmtime)

p = json.load(open(src, encoding="utf-8"))
used = {json.load(open(f, encoding="utf-8")).get("name") for f in plans}
n = 2
while True:
    name = "%s %s recap v%d (Claude)" % (date, who, n)
    if name not in used and not os.path.exists(os.path.join(HERE, "plans", re.sub(r"[^\w.-]+", "_", name) + ".json")): break
    n += 1
p["name"] = name
pr.sdr_shots(p)
out = os.path.join(HERE, "plans", re.sub(r"[^\w.-]+", "_", name) + ".json")
json.dump(p, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)

r = subprocess.run([NODE, os.path.join(HERE, "build-from-plan.js"), out], capture_output=True, text=True)
if r.returncode != 0: say(1, {"error": "build failed: " + (r.stderr or r.stdout)[-300:], "plan": out})
say(0, {"built": name, "plan": out, "seconds": p["song"]["length"], "song": p["song"]["name"],
        "converted": sum(1 for s in p["shots"] if s.get("src")), "from": os.path.basename(src)})
