"""Build one THEME compilation from a JSON edit list.

A theme cut differs from a charter cut in one way that matters: the sources come
from different days, cameras and resolutions, so the output size cannot be
copied from the first clip. It is passed in, and every segment is reported with
its resampling factor so a soft shot is visible before anyone watches it.

OUTPUT SIZE. These sources are 1280x720 tagged rotate=-90, which ffmpeg
autorotates to 720x1280 — already 9:16, so a zoom of 1.00 is the whole frame and
needs no resampling at all. Rendering to 1080x1920 would upscale every one of
them by exactly 1.5x and invent half the pixels on screen. 720x1280 is native,
fills a phone, and both platforms accept it. Punch-in is then the only thing
that costs sharpness, which is the correct place for that cost to sit.

Edit list: {"out": path, "w":, "h":, "fps":, "segments":[
   {"src":, "start":, "dur":, "zoom":, "cx":, "cy":, "note":} ]}
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

spec = json.load(open(sys.argv[1], encoding="utf-8"))
W, H, FPS = spec.get("w", 720), spec.get("h", 1280), spec.get("fps", 30)
OUT = spec["out"]
# SCRATCH GOES IN TEMP, NOT NEXT TO THE OUTPUT.
#
# This used to write a "_seg_<name>" folder into the theme folder itself, right
# beside the finished file. On 14 Sep 2026 the owner opened the theme folder,
# went into that folder because it was named after the cut he was looking for,
# found eight numbered fragments and a list.txt, and reported the video missing.
# It was one level up the whole time.
#
# The media library is browsed by a person. Nothing belongs in it except things
# worth watching.
work = os.path.join(tempfile.gettempdir(),
                    "theme_seg_" + os.path.basename(OUT).split(".")[0])
shutil.rmtree(work, ignore_errors=True)
os.makedirs(work, exist_ok=True)


def dims(p):
    """Display dimensions, i.e. AFTER the rotation tag is applied."""
    s = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height:stream_side_data=rotation", "-of", "json", p],
        capture_output=True, text=True).stdout)["streams"][0]
    w, h = int(s["width"]), int(s["height"])
    rot = 0
    for sd in s.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(sd["rotation"])
    if rot % 180:
        w, h = h, w
    return w, h, rot


parts, total, soft = [], 0.0, []
for i, seg in enumerate(spec["segments"]):
    src = seg["src"]
    if not os.path.exists(src):
        print(f"  {i}: MISSING  {src}")
        continue
    sw, sh, rot = dims(src)
    z = seg.get("zoom", 1.0)
    cw, ch = int(sh * 9 / 16 / z), int(sh / z)
    if cw > sw:                      # source narrower than 9:16 — keep width
        cw, ch = sw, int(sw * 16 / 9)
    cw, ch = min(cw, sw), min(ch, sh)
    cw -= cw % 2
    ch -= ch % 2
    x = max(0, min(sw - cw, int(seg.get("cx", 0.5) * sw - cw / 2)))
    y = max(0, min(sh - ch, int(seg.get("cy", 0.5) * sh - ch / 2)))
    factor = W / cw
    out = os.path.join(work, f"{i:02d}.mp4")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-ss", f"{seg['start']:.2f}", "-t", f"{seg['dur']:.2f}", "-i", src,
                    "-vf", f"crop={cw}:{ch}:{x}:{y},scale={W}:{H},fps={FPS},setsar=1",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
                    out], capture_output=True)
    ok = os.path.exists(out) and os.path.getsize(out) > 0
    tag = "  SOFT" if factor > 1.45 else ""
    print(f"  {i}: {'ok ' if ok else 'FAIL'} {seg['dur']:4.1f}s  src {sw}x{sh}"
          f"(rot {rot:>4})  zoom {z:.2f}  resample {factor:.2f}x{tag}"
          f"  {os.path.basename(src)}")
    if factor > 1.45:
        soft.append(i)
    if ok:
        parts.append(out)
        total += seg["dur"]

lst = os.path.join(work, "list.txt")
with open(lst, "w", encoding="utf-8") as fh:
    for p in parts:
        fh.write("file '" + p.replace("\\", "/") + "'\n")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy",
                "-movflags", "+faststart", OUT], capture_output=True)

if os.path.exists(OUT):
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", OUT], capture_output=True, text=True).stdout.strip()
    print(f"\n{len(parts)} shots  {float(d):.1f}s  {os.path.getsize(OUT)/1024/1024:.1f} MB  {W}x{H}")
    print("soft segments:", soft or "none")
    print(OUT)
else:
    print("\nCONCAT FAILED")
