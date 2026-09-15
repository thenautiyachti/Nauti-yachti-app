"""Watch the reference videos and measure how they are CUT.

The question is not what these are about — it is how they are built. So the
useful numbers are structural: how long, how many cuts, how long the average
shot is, and what the first shot is.

Scene-change detection gives the cut count directly. That is the one metric
that settles "do they cut faster than we do" without any guessing, and it is
comparable against our own edit, which is 7 shots across 44s.
"""
import json
import os
import subprocess
import sys

WATCH = r"C:\Users\immex\.claude\skills\watch\watch.py"
PY = sys.executable
OUT = sys.argv[1]
URLS = sys.argv[2:]

rows = []
for i, u in enumerate(URLS):
    d = os.path.join(OUT, f"ref{i}")
    os.makedirs(d, exist_ok=True)
    r = subprocess.run([PY, WATCH, u, "--out", d, "--every", "2", "--max-frames", "60"],
                       capture_output=True, text=True)
    try:
        j = json.loads(r.stdout[r.stdout.index("{"):])
    except Exception:
        print(f"ref{i}: FAILED  {u}")
        print("   " + (r.stdout or r.stderr or "")[-300:].replace("\n", " "))
        continue
    dur = j["duration_s"] or 1
    cuts = j["scene_frames"]
    rows.append((i, u, dur, cuts, j["interval_frames"], j["dropped_duplicates"],
                 j["has_transcript"], d))
    print(f"ref{i}: {dur:3d}s  cuts~{cuts:3d}  "
          f"avg shot {dur/max(cuts,1):5.2f}s  "
          f"frames {j['interval_frames']:2d} (-{j['dropped_duplicates']} dup)  "
          f"transcript {'yes' if j['has_transcript'] else 'NO'}")

print("\n" + "=" * 64)
print(f"{'ref':4} {'dur':>5} {'cuts':>5} {'cuts/s':>7} {'avg shot':>9}")
for i, u, dur, cuts, _, _, _, _ in rows:
    print(f"ref{i:<2} {dur:>4}s {cuts:>5} {cuts/dur:>7.2f} {dur/max(cuts,1):>8.2f}s")
print(f"\nOURS  Oscar   44s     7    0.16     6.34s")
print(f"OURS  Nagdy   39s     7    0.18     5.56s")
