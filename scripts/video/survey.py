"""What is actually in the library, per theme, before promising any compilation.

Counts RAW clips separately from FINISHED CUTS, because a folder that looks full
may be full of things already edited — and a compilation built from other
compilations is a copy, not a cut.

Underscore folders are working material and are reported separately: nothing
publishes out of one.
"""
import os
import subprocess
import sys

ROOT = sys.argv[1]
VID = (".mp4", ".mov")
CUT = ("_9x16", "_4x5", "_1x1", "_16x9")


def dur(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=nw=1:nk=1", p], capture_output=True, text=True)
    try:
        return float((r.stdout or "0").strip())
    except ValueError:
        return 0.0


rows = []
for name in sorted(os.listdir(ROOT)):
    folder = os.path.join(ROOT, name)
    if not os.path.isdir(folder):
        continue
    raw, cuts, raw_s, cut_s = [], [], 0.0, 0.0
    for r, _, files in os.walk(folder):
        low = r.lower()
        if "_not for use" in low:
            continue
        for f in files:
            if not f.lower().endswith(VID):
                continue
            p = os.path.join(r, f)
            d = dur(p)
            is_cut = any(s in f for s in CUT) or f.startswith(("montage-", "lv_")) \
                or "compilation video" in low
            if is_cut:
                cuts.append(p); cut_s += d
            else:
                raw.append(p); raw_s += d
    if raw or cuts:
        rows.append((name, len(raw), raw_s / 60, len(cuts), cut_s / 60))

print(f"{'theme folder':<46}{'raw':>5}{'raw min':>9}{'cuts':>6}{'cut min':>9}")
print("-" * 75)
for n, rc, rm, cc, cm in sorted(rows, key=lambda x: -x[2]):
    print(f"{n[:45]:<46}{rc:>5}{rm:>9.1f}{cc:>6}{cm:>9.1f}")
print("-" * 75)
print(f"{'TOTAL':<46}{sum(r[1] for r in rows):>5}{sum(r[2] for r in rows):>9.1f}"
      f"{sum(r[3] for r in rows):>6}{sum(r[4] for r in rows):>9.1f}")
