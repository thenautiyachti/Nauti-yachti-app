"""One sheet across several reference videos, N evenly-spaced frames each.

Reading three references frame-by-frame costs ~100 image reads. One row per
reference costs one. The question these answer is compositional, not detailed:
what is held in frame, and how wide.
"""
import os, shutil, subprocess, sys

root, out = sys.argv[1], sys.argv[2]
per = int(sys.argv[3]) if len(sys.argv) > 3 else 8

tmp = out + "_tmp"
os.makedirs(tmp, exist_ok=True)
for f in os.listdir(tmp):
    os.remove(os.path.join(tmp, f))

n = 0
rows = 0
labels = []
for d in sorted(os.listdir(root)):
    fr = os.path.join(root, d, "frames")
    if not os.path.isdir(fr):
        continue
    names = sorted(f for f in os.listdir(fr) if f.endswith(".jpg"))
    if not names:
        continue
    picks = [names[round(i * (len(names) - 1) / max(per - 1, 1))] for i in range(per)]
    for p in picks:
        shutil.copy(os.path.join(fr, p), os.path.join(tmp, f"{n:02d}.jpg"))
        n += 1
    rows += 1
    labels.append(f"row {rows}: {d}  ({len(names)} frames)  " + " ".join(
        x.split('_')[1].replace('.jpg', '') for x in picks))

subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-framerate", "1", "-i", os.path.join(tmp, "%02d.jpg"),
                "-frames:v", "1",
                "-filter_complex",
                f"scale=280:-2,tile={per}x{rows}:margin=6:padding=6:color=white",
                "-q:v", "3", out], capture_output=True)
print("\n".join(labels))
print(f"\n{n} tiles  {per}x{rows}  ->  {out}",
      "OK" if os.path.exists(out) else "FAILED")
