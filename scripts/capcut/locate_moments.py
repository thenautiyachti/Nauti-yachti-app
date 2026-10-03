"""Find where each vetted Completed still came from, and how long it holds.

python locate_moments.py [charter-folder-substring ...]

Every still Coral promoted into a charter's Completed folder today was a frame
of one of that charter's own clips. This finds the clip and the exact second
(4 fps search, brightness-normalised so a brightened night frame still matches),
then measures the STEADY span around it: how far either side the picture stays
close to that frame before the camera swings to the helm or the tower. Writes
moments.json: per charter, [{clip, t, a, b, kind, still}].
"""
import os, re, sys, json, subprocess
import numpy as np
from PIL import Image, ImageOps

ROOT = r"C:\Users\immex\Documents\_MyFiles\_The Nauti Yachti LLC\Photos\02 Charters\_By charter"
# Since 3 Oct 2026 the days with no charter (his own outings, the 2025 glow promo
# nights) live beside the charters in 02 Charters\_outings, tagged the same way.
# They may be posted, each post approved by him ("It can be used for posts too.
# I'll be able to stage gate it"), so theme cuts draw on them, after the
# charters, and their moments are found here as well. Recaps stay charter-only.
OUTINGS = r"C:\Users\immex\Documents\_MyFiles\_The Nauti Yachti LLC\Photos\02 Charters\_outings"
ROOTS = (ROOT, OUTINGS)
# The crew's one guard (Crew\_Scripts\media-guard.js), copied: never a source.
RESTRICTED = re.compile(r"\bNDA\b|NO MEDIA|DO NOT POST|NOT FOR (?:POST|PUBLIC|USE)|\bNOT USED?\b", re.I)

def folder_dir(folder):
    """A dated folder's full path, in _By charter or _outings."""
    return next((os.path.join(r, folder) for r in ROOTS if os.path.isdir(os.path.join(r, folder))), os.path.join(ROOT, folder))
HERE = os.path.dirname(os.path.abspath(__file__))
FPS, SZ = 4, 40
VIDEO = re.compile(r"\.(mp4|mov|m4v)$", re.I)
FROM = re.compile(r"^(?P<stem>.+?)_(?:still(?P<n>\d+)|t(?P<t>\d{4}))(?P<rest>(?:_[A-Za-z]+)*)\.jpg$", re.I)
HELD = ("20250920_211850_303ad61a", "20260919_194633_cdb085fe")
SKIP_DIRS = {"_from video", "Completed", "compilation video"}

def norm(a):
    a = a.astype(np.float32); return (a - a.mean()) / (a.std() + 1e-6)

def frames(clip):
    cmd = ["ffmpeg", "-loglevel", "error", "-hwaccel", "cuda", "-i", clip, "-vf", "fps=%d,scale=%d:%d" % (FPS, SZ, SZ), "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    raw = subprocess.run(cmd, capture_output=True).stdout
    if not raw:  # no GPU path for this file: decode on the CPU
        cmd.remove("-hwaccel"); cmd.remove("cuda"); raw = subprocess.run(cmd, capture_output=True).stdout
    n = len(raw) // (SZ * SZ)
    return np.array([norm(np.frombuffer(raw[i * SZ * SZ:(i + 1) * SZ * SZ], np.uint8).reshape(SZ, SZ)) for i in range(n)])

def find_clip(folder, stem):
    for dp, dns, fns in os.walk(folder):
        # A "Not used" / "NOT FOR USE" subfolder is the owner's own rejection (the
        # 2025-08-09 kickoff party has one): never a source, same as media-guard.js.
        dns[:] = [d for d in dns if d not in SKIP_DIRS and not RESTRICTED.search(d)]
        for f in fns:
            if VIDEO.search(f) and os.path.splitext(f)[0] == stem:
                return os.path.join(dp, f)
    return None

def main(filters):
    out = {}
    folders = sorted(f for r in ROOTS if os.path.isdir(r) for f in os.listdir(r)
                     if re.match(r"\d{4}-\d{2}-\d{2} ", f) and not RESTRICTED.search(f) and os.path.isdir(os.path.join(r, f)))
    if filters: folders = [f for f in folders if any(x.lower() in f.lower() for x in filters)]
    for folder in folders:
        base = folder_dir(folder); done = os.path.join(base, "Completed")
        if not os.path.isdir(done): continue
        by_clip = {}
        for f in sorted(os.listdir(done)):
            m = FROM.match(f)
            if not m or f.startswith(("lv_", "montage-")) or "_upright" in f: continue
            stem = m.group("stem")
            if any(h in stem for h in HELD): continue
            by_clip.setdefault(stem, []).append(f)
        moments = []
        from concurrent.futures import ThreadPoolExecutor
        clips = {stem: find_clip(base, stem) for stem in by_clip}
        clips = {k: v for k, v in clips.items() if v}
        with ThreadPoolExecutor(3) as ex:
            decoded = dict(zip(clips, ex.map(frames, clips.values())))
        for stem, stills in by_clip.items():
            if stem not in clips: continue
            clip = clips[stem]; fr = decoded[stem]
            if len(fr) < 4: continue
            for f in stills:
                rest = FROM.match(f).group("rest").lower()
                kind = "rider" if "_rider" in rest else "people"
                # A rider crop is a zoomed piece of its base frame: match the base.
                src = os.path.join(done, f)
                if kind == "rider":
                    b = f.replace("_rider", "")
                    for cand in (os.path.join(done, b), os.path.join(base, "_from video", b)):
                        if os.path.exists(cand): src = cand; break
                    else:
                        continue
                im = ImageOps.exif_transpose(Image.open(src)).convert("L").resize((SZ, SZ))
                v = norm(np.asarray(im))
                d = ((fr - v) ** 2).mean(axis=(1, 2))
                i = int(d.argmin())
                if d[i] > 0.8: continue  # no convincing match: do not guess a time
                # Steady span: grow while the picture stays near the matched frame.
                ref = fr[i]; lim = 1.1; cap = 4 * FPS  # same scene (corr > ~0.45), at most 4s each way
                a = i
                while a > 0 and i - a < cap and ((fr[a - 1] - ref) ** 2).mean() < lim: a -= 1
                b2 = i
                while b2 < len(fr) - 1 and b2 - i < cap and ((fr[b2 + 1] - ref) ** 2).mean() < lim: b2 += 1
                moments.append({"clip": clip, "t": round(i / FPS, 2), "a": round(a / FPS, 2), "b": round((b2 + 1) / FPS, 2),
                                "kind": kind, "still": f, "err": round(float(d[i]), 3), "dur": round(len(fr) / FPS, 2)})
        moments.sort(key=lambda m: (os.path.basename(m["clip"]), m["t"]))
        out[folder] = moments
        print("%-60s %3d moments (%d rider)" % (folder[:60], len(moments), sum(m["kind"] == "rider" for m in moments)), flush=True)
    path = os.path.join(HERE, "moments.json")
    old = json.load(open(path)) if os.path.exists(path) and filters else {}
    # A renamed folder (3 Oct 2026: every charter gained its tags) leaves its old
    # key behind with clip paths that no longer exist. Drop any key that is no
    # longer a folder, so nothing plans from a dead path.
    old = {k: v for k, v in old.items() if os.path.isdir(folder_dir(k))}
    old.update(out)
    json.dump(old, open(path, "w"), indent=1)

if __name__ == "__main__":
    main(sys.argv[1:])
