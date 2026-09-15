"""Show what a 9:16 crop would throw away, before throwing it away.

The owner's rule: a person's face cropped out is a reject, however sharp the
frame. So the crop box gets shown first. Dimmed edges are what would be lost;
the bright centre is what survives.

These sources are 3:4 (1360x1824). Reaching 9:16 keeps full height and cuts
width to height*9/16 — about 334px gone, 167 from each side on a centre crop.
That is enough to remove somebody sitting at the edge of the bench.
"""
import os
import subprocess
import sys

clip, ts, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
shift = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0  # -1..1, right is +

probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", clip],
                       capture_output=True, text=True).stdout.strip()
W, H = (int(x) for x in probe.split("x")[:2])
cw = int(H * 9 / 16)
if cw > W:
    cw = W
room = (W - cw) / 2.0
x = int(round(room + shift * room))

# Bright keep-region composited over a dimmed full frame.
vf = (f"split=2[a][b];"
      f"[a]eq=brightness=-0.32:saturation=0.25[dim];"
      f"[b]crop={cw}:{H}:{x}:0,pad={W}:{H}:{x}:0:color=black@0[keep];"
      f"[dim][keep]overlay=0:0,"
      f"drawbox=x={x}:y=0:w={cw}:h={H}:color=yellow:t=6,"
      f"scale=560:-2")
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-ss", f"{ts:.2f}", "-i", clip, "-frames:v", "1",
                "-vf", vf, "-q:v", "3", out], capture_output=True)

print(f"source {W}x{H}  ->  9:16 keep {cw}x{H}  at x={x}  (shift {shift:+.2f})")
print(f"lost: {x}px left, {W - cw - x}px right")
print("wrote", out, "OK" if os.path.exists(out) else "FAILED")
