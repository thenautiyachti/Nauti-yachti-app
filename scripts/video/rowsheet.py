"""Fine sheet for SEVERAL clips at once: one row per clip, N samples across it.

One image read per clip is the cost that stops a 30-clip theme from being
reviewed properly. A row per clip puts six or eight clips in one read at a
sampling rate dense enough to find a held window, which is the whole question
at this stage: not "what is this clip about" (triage answered that) but
"where in it is the subject actually in frame for long enough to use".

Clip paths come in on stdin. The printed map is tile -> timestamp, per row.
"""
import os, subprocess, sys

OUT = sys.argv[1]
PER = int(sys.argv[2]) if len(sys.argv) > 2 else 8

clips = [l.strip() for l in sys.stdin if l.strip()]
tmp = os.path.join(OUT, "rs")
os.makedirs(tmp, exist_ok=True)
for f in os.listdir(tmp):
    os.remove(os.path.join(tmp, f))


def dur(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", p], capture_output=True, text=True)
    try:
        return float((r.stdout or "0").strip())
    except ValueError:
        return 0.0


n, lines = 0, []
for row, c in enumerate(clips):
    d = dur(c)
    # Inset from both ends: the first and last half-second of a glasses clip is
    # usually the hand reaching for the frame, not the shot.
    a, b = min(0.5, d * 0.05), max(0.0, d - min(0.5, d * 0.05))
    times = [a + (b - a) * i / max(PER - 1, 1) for i in range(PER)]
    for t in times:
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                        "-ss", f"{t:.2f}", "-i", c, "-frames:v", "1",
                        "-vf", "scale=300:400:force_original_aspect_ratio=increase,crop=300:400",
                        "-q:v", "4", os.path.join(tmp, f"{n:02d}.jpg")], capture_output=True)
        n += 1
    lines.append(f"row {row + 1}  {d:6.1f}s  {os.path.basename(c)}\n"
                 + "        " + "  ".join(f"{t:5.1f}" for t in times))

sheet = os.path.join(OUT, "rows.jpg")
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-framerate", "1", "-i", os.path.join(tmp, "%02d.jpg"),
                "-frames:v", "1",
                "-filter_complex", f"tile={PER}x{len(clips)}:margin=6:padding=6:color=white",
                "-q:v", "3", sheet], capture_output=True)
print("\n".join(lines))
print(f"\n{n} tiles  {PER}x{len(clips)}  ->  {sheet}",
      "OK" if os.path.exists(sheet) else "FAILED")
