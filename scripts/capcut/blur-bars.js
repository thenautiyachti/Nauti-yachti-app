// Fill the black bars of a CapCut 9:16 export with a blurred copy of the picture.
//
//   node blur-bars.js "<export.mp4>" "<out.mp4>"
//
// Most of our footage is 4:3, so in a 9:16 cut it sits in a band between black
// bars. Owner, 5 Oct 2026: "blurred background" (filling the frame would crop
// people off the edges of group shots). CapCut's own Canvas > Blur did not
// survive: set by capcut-cli it never rendered, and its "Apply to all" reported
// success but rendered on one clip only. So the export keeps CapCut's picture,
// transitions and music, and this fills the bars afterwards.
//
// It measures the band itself (ffmpeg cropdetect), takes the band's inner edge
// so no black line survives, scales that band up to cover the frame as the
// blurred background, and lays the sharp band back where it was. Audio is copied
// untouched. Exits 2 if the video has no bars (nothing to do).
const { spawnSync } = require("child_process");
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error("usage: node blur-bars.js <export.mp4> <out.mp4>"); process.exit(1); }

const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", src], { encoding: "utf8" });
const [W, H] = probe.stdout.trim().split(",").map(Number);
if (!W || !H) { console.error("cannot read " + src); process.exit(1); }

// Per-frame crop at 2 fps; keep the band shapes that cover most frames.
const det = spawnSync("ffmpeg", ["-hide_banner", "-i", src, "-vf", "fps=2,cropdetect=24:2:1", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
const crops = [...det.stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].map((m) => ({ w: +m[1], h: +m[2], y: +m[4] }));
const banded = crops.filter((c) => c.w === W && c.h < H * 0.95 && c.h > H * 0.5);
if (banded.length < crops.length * 0.3) { console.log(JSON.stringify({ skipped: "no bars", frames: crops.length })); process.exit(2); }
// Inner edge: the latest top and the earliest bottom across the banded frames,
// rounded to even pixels for the encoder.
const top = Math.ceil(Math.max(...banded.map((c) => c.y)) / 2) * 2;
const bottom = Math.floor(Math.min(...banded.map((c) => c.y + c.h)) / 2) * 2;
const bandH = bottom - top;

const fc = `[0:v]crop=${W}:${bandH}:0:${top},split=2[fg][b0];` +
  `[b0]scale=-2:${H},crop=${W}:${H},boxblur=40:2[bg];` +
  `[bg][fg]overlay=0:${top},format=yuv420p[v]`;
const enc = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-filter_complex", fc,
  "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "copy", "-movflags", "+faststart", out],
  { encoding: "utf8" });
if (enc.status !== 0) { console.error(enc.stderr.slice(-500)); process.exit(1); }
console.log(JSON.stringify({ out, band: { top, height: bandH }, of: H, framesWithBars: banded.length + "/" + crops.length }));
