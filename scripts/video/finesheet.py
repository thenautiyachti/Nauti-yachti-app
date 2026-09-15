"""Fine contact sheet for ONE clip, plus a per-second loudness profile.

Sampling is by LENGTH, not a fixed count — roughly a frame every N seconds —
because three samples across 85 seconds reads at 0.035 fps and hides the best
window entirely.

The loudness column is here for one reason: the opening clip of a charter is
usually the owner speaking to camera, and speech is the thing worth finding.
It is NOT a quality score. A quiet frame is not a bad frame; the intro is quiet
and still by nature, which is exactly what a motion-and-loudness score throws
away.
"""
import os
import re
import subprocess
import sys

clip = sys.argv[1]
out = sys.argv[2]
every = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 5

os.makedirs(out, exist_ok=True)
tiles = os.path.join(out, "f")
os.makedirs(tiles, exist_ok=True)
for f in os.listdir(tiles):
    os.remove(os.path.join(tiles, f))

d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", clip],
                         capture_output=True, text=True).stdout.strip() or 0)

times = []
t = 0.0
while t < d:
    times.append(t)
    t += every

for i, ts in enumerate(times):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-ss", f"{ts:.2f}", "-i", clip, "-frames:v", "1",
                    "-vf", "scale=300:400:force_original_aspect_ratio=increase,crop=300:400",
                    "-q:v", "4", os.path.join(tiles, f"{i:02d}.jpg")], capture_output=True)

made = len(os.listdir(tiles))
rows = (made + cols - 1) // cols
sheet = os.path.join(out, "sheet.jpg")
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-framerate", "1", "-i", os.path.join(tiles, "%02d.jpg"),
                "-frames:v", "1",
                "-filter_complex", f"tile={cols}x{rows}:margin=6:padding=6:color=white",
                "-q:v", "3", sheet], capture_output=True)

# Loudness per second, so speech can be located rather than guessed at.
r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", clip,
                    "-af", "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
                    "-f", "null", "-"], capture_output=True, text=True)
levels = [float(m) for m in re.findall(r"RMS_level=(-?\d+\.?\d*)", r.stderr or "")]

print(f"clip     : {os.path.basename(clip)}")
print(f"duration : {d:.1f}s   frames: {made} every {every}s   grid {cols}x{rows}")
print(f"sheet    : {sheet}")
print("\ntile -> timestamp")
for i, ts in enumerate(times[:made]):
    print(f"  {i:2d}  {int(ts // 60):02d}:{int(ts % 60):02d}")
if levels:
    print("\nloudness by second (dB RMS, higher = louder):")
    print("  " + " ".join(f"{v:.0f}" for v in levels[:80]))
    loud = sorted(range(len(levels)), key=lambda i: levels[i], reverse=True)[:6]
    print("  loudest seconds:", sorted(loud))
else:
    print("\nno audio stream found")
