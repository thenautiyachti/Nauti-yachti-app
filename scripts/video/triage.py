"""One frame per clip, tiled into a single sheet.

Reading 30 clips one frame at a time costs 30 image reads. Reading one sheet
costs one, and it is enough to say what each clip is ABOUT — which is the only
question at triage. The fine reads come later, on the handful that earn them.

Tile order is filename order, which for glasses footage is chronological, so
tile N maps to the Nth line of map.txt.
"""
import os
import subprocess
import sys

SRC = sys.argv[1]
OUT = sys.argv[2]
COLS = int(sys.argv[3]) if len(sys.argv) > 3 else 6

tri = os.path.join(OUT, "tri")
os.makedirs(tri, exist_ok=True)
for old in os.listdir(tri):
    os.remove(os.path.join(tri, old))


def probe(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", p], capture_output=True, text=True)
    try:
        return float((r.stdout or "0").strip())
    except ValueError:
        return 0.0


vids = []
for root, _, files in os.walk(SRC):
    for f in sorted(files):
        if f.lower().endswith((".mp4", ".mov")):
            vids.append(os.path.join(root, f))
vids.sort(key=lambda p: os.path.basename(p))

lines = []
made = 0
for i, v in enumerate(vids):
    d = probe(v)
    t = max(0.5, d * 0.40)
    o = os.path.join(tri, f"{i:02d}.jpg")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-ss", f"{t:.2f}", "-i", v, "-frames:v", "1",
                    "-vf", "scale=300:400:force_original_aspect_ratio=increase,crop=300:400",
                    "-q:v", "4", o], capture_output=True)
    ok = os.path.exists(o)
    made += 1 if ok else 0
    lines.append(f"{i:2d}  {d:6.1f}s  {'ok ' if ok else 'MISS'}  {os.path.basename(v)}")

open(os.path.join(OUT, "map.txt"), "w", encoding="utf-8").write("\n".join(lines) + "\n")

sheet = os.path.join(OUT, "triage.jpg")
rows = (made + COLS - 1) // COLS
r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-framerate", "1", "-i", os.path.join(tri, "%02d.jpg"),
                    "-frames:v", "1",
                    "-filter_complex", f"tile={COLS}x{rows}:margin=6:padding=6:color=white",
                    "-q:v", "3", sheet], capture_output=True, text=True)

print("\n".join(lines))
print(f"\nclips: {len(vids)}   tiles: {made}   grid: {COLS}x{rows}")
print("sheet:", sheet, "OK" if os.path.exists(sheet) else "FAILED " + (r.stderr or "")[-300:])
