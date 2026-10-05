r"""Lay out a charter's wake shots so every rider gets a rider still.

    python find_riders.py "<charter folder name>"
        -> review sheets in %TEMP%\riders-<date>-NN.jpg: the moments each clip
           points back at the wake, large, with a 10x10 grid and "clip @ s"
    python find_riders.py "<charter folder name>" --make "<clip>@<seconds>@<u>,<v>" ...
        -> the frame into _from video, a rider still (crop-still.js --rider) into Completed

Why (owner, 5 Oct 2026): "when wakeboarding or tubing we need a zoom on them",
and, looking at Nagdy's folder, "there are plenty of tubing videos". The recaps
and theme compilations know a clip has a rider only through a `_rider` still in
Completed, and they centre the zoom on it. Nagdy had two rider stills from
thirteen riding clips, so its tubing recap showed nobody on a tube.

Why a sheet and not a detector: a colour detector was tried the same day and
was useless. Tubes come in every colour ("The tube isn't always red"), and red,
dark or bright shapes ringed by "water" turned out to be the tower, hair, life
jackets and swimmers as often as tubes, while a real tube went unboxed. The eye
is the detector. What the script does well is the tedious part: it samples
every clip every 2 s, keeps the frames that look back at the wake (a lot of
white foam low in the frame, with lake round it), keeps up to three per clip,
spread out, and draws them big with a grid so a position can be read off.

Reading the grid: u is across (0 = left edge, 1 = right), v is down (0 = top,
1 = bottom); the lines are every 0.1 and labelled along the top and left. Put
the point on the rider, not the tube's centre if they are apart. Pick, per
riding clip, the moment the rider is biggest and clearest; skip a clip whose
rider is a speck in glare. Then --make them all in one call, LOOK at each
_rider.jpg, and run locate_moments.py for the folder so the recap finds them.
"""
import os, sys, json, shutil, subprocess
from io import BytesIO
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from locate_moments import folder_dir

EVERY = 2.0
SW = 180                       # analysis width
TILE = 330                     # sheet tile width
NODE = r"C:\Users\immex\tools\node-v24.19.0-win-x64\node.exe"
CROP = r"C:\Users\immex\Documents\_MyFiles\_The Nauti Yachti LLC\AI & Website\Crew\_Scripts\crop-still.js"
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(os.environ.get("TEMP", HERE), "rider-frames")
FONT = r"C:\Windows\Fonts\arial.ttf"


def dims(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height:stream_side_data=rotation", "-of", "json", path], capture_output=True, text=True)
    st = json.loads(r.stdout)["streams"][0]; w, h = st["width"], st["height"]
    rot = abs(int(next((d.get("rotation", 0) for d in st.get("side_data_list", []) if "rotation" in d), 0)))
    return (h, w) if rot in (90, 270) else (w, h)


def frames(path):
    """[(t, rgb)] every EVERY seconds at SW wide; cached, since decoding is the slow part."""
    os.makedirs(CACHE, exist_ok=True)
    st = os.stat(path)
    key = os.path.join(CACHE, "%s_%d_%d_%g.npy" % (os.path.basename(path), st.st_size, SW, EVERY))
    if os.path.exists(key):
        return [(i * EVERY, f) for i, f in enumerate(np.load(key))]
    w, h = dims(path); sh = int(round(SW * h / w / 2)) * 2
    p = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path, "-vf",
                          f"fps=1/{EVERY},scale={SW}:{sh}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    n = SW * sh * 3; got = []
    while True:
        b = p.stdout.read(n)
        if len(b) < n: break
        got.append(np.frombuffer(b, np.uint8).reshape(sh, SW, 3))
    p.wait()
    if got: np.save(key, np.stack(got))
    return [(i * EVERY, f) for i, f in enumerate(got)]


def wake_score(rgb):
    """How much this frame looks back at a wake: white foam low and central, lake round it."""
    hsv = np.asarray(Image.fromarray(rgb).convert("HSV")).astype(int)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    h, w = H.shape
    band = (slice(int(h * 0.35), int(h * 0.9)), slice(int(w * 0.1), int(w * 0.9)))
    foam = ((S < 50) & (V > 175))[band].mean()
    lake = (((H >= 50) & (H <= 177)) & (S > 40) & (V < 200))[band].mean()
    return foam * min(1.0, lake * 3) if lake > 0.15 else 0.0


def pick_frames(fr, keep=3, gap=8.0, floor=0.06):
    scored = sorted(((wake_score(f), t, f) for t, f in fr), key=lambda x: -x[0])
    out = []
    for s, t, f in scored:
        if s < floor or len(out) >= keep: break
        if all(abs(t - o[1]) >= gap for o in out): out.append((s, t, f))
    return sorted(out, key=lambda x: x[1])


def full_frame(path, t, width):
    """A sharper frame for the sheet than the analysis copy."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(t), "-i", path, "-frames:v", "1",
                        "-vf", f"scale={width}:-2", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True)
    return Image.open(BytesIO(r.stdout)).convert("RGB")


def gridded(im, label):
    d = ImageDraw.Draw(im); w, h = im.size; f = ImageFont.truetype(FONT, 11)
    for i in range(1, 10):
        x = round(w * i / 10); y = round(h * i / 10)
        d.line((x, 0, x, h), fill=(255, 255, 0), width=1); d.line((0, y, w, y), fill=(255, 255, 0), width=1)
        d.text((x + 2, 1), "%.1f" % (i / 10), fill=(255, 255, 0), font=f)
        d.text((2, y + 1), "%.1f" % (i / 10), fill=(255, 255, 0), font=f)
    d.rectangle((0, h - 16, w, h), fill=(0, 0, 0)); d.text((3, h - 15), label, fill=(0, 255, 255), font=ImageFont.truetype(FONT, 12))
    return im


def sheets(folder):
    base = folder_dir(folder)
    clips = sorted(f for f in os.listdir(base) if f.lower().endswith((".mp4", ".mov")))
    tiles, listing = [], []
    for c in clips:
        path = os.path.join(base, c)
        for s, t, _ in pick_frames(frames(path)):
            tiles.append(gridded(full_frame(path, t, TILE), "%s @ %g" % (c, t)))
            listing.append({"clip": c, "t": t, "wake": round(s, 3)})
    out = []
    per, cols = 12, 4
    for k in range(0, len(tiles), per):
        group = tiles[k:k + per]
        th = max(t.size[1] for t in group); rows = (len(group) + cols - 1) // cols
        sh = Image.new("RGB", (cols * TILE, rows * th), "black")
        for i, t in enumerate(group): sh.paste(t, ((i % cols) * TILE, (i // cols) * th))
        p = os.path.join(os.environ.get("TEMP", HERE), "riders-%s-%02d.jpg" % (folder[:10], k // per))
        sh.save(p, quality=85); out.append(p)
    return out, listing


def make(folder, specs):
    base = folder_dir(folder); fv = os.path.join(base, "_from video"); done = os.path.join(base, "Completed")
    os.makedirs(fv, exist_ok=True)
    for spec in specs:
        clip, t, uv = spec.split("@"); t = float(t); stem = os.path.splitext(clip)[0]
        still = os.path.join(fv, "%s_t%04d.jpg" % (stem, round(t * 10)))
        if not os.path.exists(still):
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(t), "-i", os.path.join(base, clip),
                            "-frames:v", "1", "-q:v", "2", still], check=True)
        r = subprocess.run([NODE, CROP, still, "--rider", "--focus", uv], capture_output=True, text=True)
        rider = os.path.splitext(still)[0] + "_rider.jpg"
        if not os.path.exists(rider): print("FAILED", spec, (r.stderr or r.stdout)[-200:]); continue
        dest = os.path.join(done, os.path.basename(rider))
        if os.path.exists(dest): os.remove(rider); print("exists", os.path.basename(dest)); continue
        shutil.move(rider, dest); print("made", dest)


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args: print(__doc__); sys.exit(1)
    folder = args[0]
    if "--make" in args:
        make(folder, args[args.index("--make") + 1:]); sys.exit(0)
    out, listing = sheets(folder)
    print(json.dumps({"folder": folder, "wake_frames": len(listing), "sheets": out}, indent=1))
