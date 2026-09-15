"""Triage sheet from an EXPLICIT list of clips, read from stdin.

triage.py walks one folder. A theme pool is not one folder — it is originals
plus a dated subfolder plus a few loose files, minus the cropped duplicates of
the same source. Feeding the list in means the pool is decided by the caller
and written down in map.txt, instead of being whatever os.walk happened to find.
"""
import os, subprocess, sys

OUT = sys.argv[1]
COLS = int(sys.argv[2]) if len(sys.argv) > 2 else 6
FRAC = float(sys.argv[3]) if len(sys.argv) > 3 else 0.40

vids = [l.strip() for l in sys.stdin if l.strip()]
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


lines, made = [], 0
for i, v in enumerate(vids):
    d = probe(v)
    t = max(0.5, d * FRAC)
    o = os.path.join(tri, f"{i:02d}.jpg")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-ss", f"{t:.2f}", "-i", v, "-frames:v", "1",
                    "-vf", "scale=300:400:force_original_aspect_ratio=increase,crop=300:400",
                    "-q:v", "4", o], capture_output=True)
    ok = os.path.exists(o)
    made += 1 if ok else 0
    lines.append(f"{i:2d}  {d:6.1f}s  {'ok ' if ok else 'MISS'}  {v}")

open(os.path.join(OUT, "map.txt"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
rows = (made + COLS - 1) // COLS
sheet = os.path.join(OUT, "triage.jpg")
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-framerate", "1", "-i", os.path.join(tri, "%02d.jpg"),
                "-frames:v", "1",
                "-filter_complex", f"tile={COLS}x{rows}:margin=6:padding=6:color=white",
                "-q:v", "3", sheet], capture_output=True)
print("\n".join(lines))
print(f"\nclips {len(vids)}  tiles {made}  grid {COLS}x{rows}")
print("sheet:", sheet, "OK" if os.path.exists(sheet) else "FAILED")
