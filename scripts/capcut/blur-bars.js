// Fill the bars of a CapCut 9:16 export with a blurred copy of the picture,
// shot by shot, and lift the dark shots of a night cut.
//
//   node blur-bars.js "<export.mp4>" "<out.mp4>" --plan "<plan.json>"            every cut
//   node blur-bars.js "<export.mp4>" "<out.mp4>" --plan "<plan.json>" --night    night cruise, glow
//   node blur-bars.js "<export.mp4>" "<out.mp4>"     no plan: refuses unless the whole cut is one band
//
// Most of our footage is 4:3, so in a 9:16 cut it sits in a band between black
// bars. Owner, 5 Oct 2026: "blurred background" (filling the frame would crop
// people off the edges of group shots). CapCut's own Canvas > Blur did not
// survive: set by capcut-cli it never rendered, and its "Apply to all" reported
// success but rendered on one clip only. So the export keeps CapCut's picture,
// transitions and music, and this fills the bars afterwards.
//
// PER SHOT, FROM THE PLAN (rewritten 5 Oct 2026). The first version measured ONE
// band for the whole video, and on cuts mixing shapes it painted blur over real
// picture: the Island lost its title and end card, Boatz & Glowz got a band of
// top 786 height 856 and lost half of every shot, a night recap blurred the
// guests. The plan the draft was built from (theme-compilations.js and
// recap-charter.js print its path) says where every shot sits: its source's
// display size (rotation and EXIF respected, as plan_recaps.dims does) and its
// scale (1.0 = the whole picture fitted to the 1080x1920 canvas). A shot whose
// picture covers the frame (a zoomed rider, a 9:16 clip) is left alone. For each
// distinct band, ONE ffmpeg pass blurs and overlays only during that band's shots
// (enable='between(t,a,b)'), with a 2-px inset so no black line survives. What
// CapCut drew into the bars (the title, the end card, a transition's picture
// sweeping across) is keyed back over the blur by its brightness, with a soft
// shadow under it: only black is replaced. Audio is copied untouched.
//
// --night (5 Oct 2026, questions 2 and 3): each shot's brightness is measured
// (signalstats, in the middle of the frame) and a dark shot is lifted in the same
// pass: under 45 hard, under 70 gently, brighter left alone. The lift is the
// shadow curve harvest-stills.js uses on night stills (NIGHT_GRADE/DUSK_GRADE),
// not plain gamma: side by side, gamma turned night skies grey and blocky, and a
// still should match the clip it came from.
//
// WITHOUT --plan it still detects, but safely: unless the frames (title and end
// card aside) agree on one standard, centred band and no full-frame shot runs
// for a second, it exits 3 rather than guess.
//
// Prints one JSON line:
//   0  {out, shots, blurred, full, bands, night}      done
//   2  {skipped: "no bars"}                            nothing to do: file the export as it is
//   3  {unsure: "..."}                                 file the UNBLURRED export and say so
//   1  {error: "..."}
const { spawnSync } = require("child_process");
const fs = require("fs");

const argv = process.argv.slice(2);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const planFile = opt("--plan");
const NIGHT = argv.includes("--night");
const [src, out] = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--plan");
const say = (code, obj) => { console.log(JSON.stringify(obj)); process.exit(code); };
if (!src || !out) { console.error('usage: node blur-bars.js <export.mp4> <out.mp4> [--plan <plan.json>] [--night]'); process.exit(1); }
if (NIGHT && !planFile) say(1, { error: "--night needs --plan: dark shots are found shot by shot" });
const PY = fs.existsSync("C:/Users/immex/AppData/Local/Programs/Python/Python312/python.exe")
  ? "C:/Users/immex/AppData/Local/Programs/Python/Python312/python.exe" : "python";
const run = (cmd, args, extra) => spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, ...extra });

const WC = 1080, HC = 1920, INSET = 2;
// The shadow curves from Crew\_Scripts\harvest-stills.js, verbatim.
const GRADE = {
  hard: "curves=all='0/0 0.15/0.42 0.50/0.75 1/1',eq=saturation=1.35",
  gentle: "curves=all='0/0 0.22/0.42 0.60/0.80 1/1',eq=saturation=1.22",
};
const HARD_BELOW = 45, GENTLE_BELOW = 70; // mean luma, 0-255 full range

const pv = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,color_range:format=duration", "-of", "json", src]);
let W, H, DUR, TV;
try {
  const j = JSON.parse(pv.stdout); W = j.streams[0].width; H = j.streams[0].height; DUR = Number(j.format.duration);
  TV = j.streams[0].color_range !== "pc";
} catch { say(1, { error: "cannot read " + src }); }
if (!W || !H || !DUR) say(1, { error: "cannot read " + src });
if (Math.abs(W / H - WC / HC) > 0.01) say(3, { unsure: `the export is ${W}x${H}, not 9:16` });
const BLACK = TV ? 16 : 0;               // what CapCut's empty canvas encodes as
const full = (y) => TV ? (y - 16) * 255 / 219 : y;
const ceilE = (v) => Math.ceil(v / 2) * 2, floorE = (v) => Math.floor(v / 2) * 2;

// ---- where each shot's picture sits ------------------------------------------------
function videoDims(file) {
  const r = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
    "stream=width,height:stream_side_data=rotation:stream_tags=rotate", "-of", "json", file]);
  let st; try { st = JSON.parse(r.stdout).streams[0]; } catch { return null; }
  if (!st || !st.width) return null;
  const sd = (st.side_data_list || []).find((d) => "rotation" in d);
  const rot = Math.abs(Number(sd ? sd.rotation : (st.tags || {}).rotate || 0)) % 180;
  return rot === 90 ? [st.height, st.width] : [st.width, st.height];
}
function imageDims(files) { // EXIF orientation applied, as plan_recaps.dims does
  if (!files.length) return {};
  const code = "import sys,json,os;from PIL import Image,ImageOps;ps=json.load(sys.stdin);" +
    "print(json.dumps({p:list(ImageOps.exif_transpose(Image.open(p)).size) for p in ps if os.path.exists(p)}))";
  const r = run(PY, ["-c", code], { input: JSON.stringify(files), env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch { return {}; }
}
// The picture's rectangle on the export, inset 2 px on every side that has a bar,
// or null when it covers the frame.
function bandOf(shot, [w, h]) {
  const fit = Math.min(WC / w, HC / h);
  const sc = shot.scale || 1, s = Math.min(sc, sc * (shot.kb || 1)); // a slow push-in only grows
  const kx = W / WC, ky = H / HC;
  const wd = w * fit * s * kx, hd = h * fit * s * ky;
  const cx = (WC / 2) * (1 + (shot.x || 0)) * kx, cy = (HC / 2) * (1 - (shot.y || 0)) * ky; // CapCut y is up
  const x0 = cx - wd / 2, x1 = cx + wd / 2, y0 = cy - hd / 2, y1 = cy + hd / 2;
  if (x0 <= 1 && y0 <= 1 && x1 >= W - 1 && y1 >= H - 1) return null;
  const L = x0 > 1 ? ceilE(x0 + INSET) : 0, R = x1 < W - 1 ? floorE(x1 - INSET) : W;
  const T = y0 > 1 ? ceilE(y0 + INSET) : 0, B = y1 < H - 1 ? floorE(y1 - INSET) : H;
  return { x: Math.max(0, L), y: Math.max(0, T), w: Math.min(W, R) - Math.max(0, L), h: Math.min(H, B) - Math.max(0, T) };
}

// ---- detection, only without a plan -----------------------------------------------
function detect() {
  const det = run("ffmpeg", ["-hide_banner", "-i", src, "-vf", "fps=2,cropdetect=limit=24:round=2:reset=1", "-f", "null", "-"]);
  const rows = [...det.stderr.matchAll(/\bt:([\d.]+).*?crop=(\d+):(\d+):(\d+):(\d+)/g)]
    .map((m) => ({ t: +m[1], w: +m[2], h: +m[3], x: +m[4], y: +m[5] }))
    .filter((c) => c.t >= 3 && c.t <= DUR - 3); // the title and the end card sit in the bars
  if (rows.length < 6) say(3, { unsure: "too short to judge without a plan" });
  let run2 = 0;
  for (const c of rows) {
    run2 = c.h >= H * 0.97 ? run2 + 1 : 0;
    if (run2 >= 2) say(3, { unsure: "a full-frame shot (a zoom or a 9:16 clip) runs at " + c.t.toFixed(1) + "s; pass --plan" });
  }
  const banded = rows.filter((c) => c.h < H * 0.97);
  if (!banded.length) say(2, { skipped: "no bars", frames: rows.length });
  const near = (a, b) => Math.abs(a.y - b.y) <= 6 && Math.abs(a.h - b.h) <= 6;
  const mode = banded.map((c) => [c, banded.filter((d) => near(c, d)).length]).sort((a, b) => b[1] - a[1])[0];
  const [m, n] = mode;
  const shapes = [3 / 4, 2 / 3, 9 / 16, 1, 4 / 5, 4 / 3, 5 / 4]; // band height / width: 4:3, 3:2, 16:9, 1:1, 5:4, 3:4, 4:5
  const standard = shapes.some((r) => Math.abs(m.h / W - r) < 0.03) && Math.abs(m.y + m.h / 2 - H / 2) <= 8;
  if (n < rows.length * 0.85 || !standard)
    say(3, { unsure: "the frames do not agree on one standard band", agree: n + "/" + rows.length, band: { top: m.y, height: m.h } });
  const top = ceilE(Math.max(...banded.filter((d) => near(m, d)).map((d) => d.y)) + INSET);
  const bottom = floorE(Math.min(...banded.filter((d) => near(m, d)).map((d) => d.y + d.h)) - INSET);
  return [{ band: { x: 0, y: top, w: W, h: bottom - top }, windows: [[0, DUR]], shots: ["all"] }];
}

// ---- the plan's shots -------------------------------------------------------------
let groups = [], shots = [], fullShots = [];
if (planFile) {
  let plan; try { plan = JSON.parse(fs.readFileSync(planFile, "utf8")); } catch (e) { say(1, { error: "cannot read the plan: " + e.message }); }
  shots = plan.shots || [];
  if (!shots.length) say(1, { error: "the plan has no shots" });
  const length = plan.song && plan.song.length;
  if (length && Math.abs(length - DUR) > 0.6)
    say(3, { unsure: `the export runs ${DUR.toFixed(2)}s and this plan ${length}s: not the plan it was built from` });
  const imgs = imageDims(shots.filter((s) => s.image || /\.(jpe?g|png|webp)$/i.test(s.file)).map((s) => s.file));
  const missing = [];
  shots.forEach((s, i) => {
    const d = imgs[s.file] || (s.image ? null : videoDims(s.file));
    if (!d) { missing.push(s.file); return; }
    s.band = bandOf(s, d);
    s.end = i + 1 < shots.length ? shots[i + 1].at : DUR; // the last shot runs to the end card's end
  });
  if (missing.length) say(3, { unsure: "cannot read a shot's source, so its band is unknown", missing });
  for (const [i, s] of shots.entries()) {
    if (!s.band) { fullShots.push(i); continue; }
    const key = [s.band.x, s.band.y, s.band.w, s.band.h].join(",");
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push(g = { key, band: s.band, windows: [], shots: [] });
    const last = g.windows[g.windows.length - 1];
    if (last && Math.abs(last[1] - s.at) < 0.01) last[1] = s.end; else g.windows.push([s.at, s.end]);
    g.shots.push(i);
  }
} else {
  groups = detect();
}

// ---- night: measure each shot, choose its lift --------------------------------------
const lifts = { hard: [], gentle: [] }, night = [];
if (NIGHT) {
  const m = run("ffmpeg", ["-hide_banner", "-v", "error", "-i", src, "-vf",
    "fps=4,crop=iw/2:ih*0.3:iw/4:ih*0.35,signalstats,metadata=print:file=-", "-f", "null", "-"]);
  const samples = []; let t = null;
  for (const line of (m.stdout || "").split(/\r?\n/)) {
    const pt = line.match(/pts_time:([\d.]+)/); if (pt) t = +pt[1];
    const ya = line.match(/YAVG=([\d.]+)/); if (ya && t !== null) samples.push([t, full(+ya[1])]);
  }
  if (!samples.length) say(1, { error: "could not measure brightness" });
  shots.forEach((s, i) => {
    const inside = samples.filter(([tt]) => tt >= s.at + 0.2 && tt <= s.end - 0.2);
    const use = inside.length ? inside : samples.filter(([tt]) => tt >= s.at && tt <= s.end);
    if (!use.length) return;
    const y = use.reduce((n, [, v]) => n + v, 0) / use.length;
    const lift = y < HARD_BELOW ? "hard" : y < GENTLE_BELOW ? "gentle" : null;
    night.push({ shot: i, luma: Math.round(y), lift });
    if (lift) lifts[lift].push([s.at, s.end]);
  });
}
const anyLift = lifts.hard.length + lifts.gentle.length > 0;
if (!groups.length && !anyLift) say(2, { skipped: "no bars", shots: shots.length, full: fullShots.length });

// ---- one pass ---------------------------------------------------------------------
const between = (ws) => ws.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join("+");
const keyAt = (BLACK / 255).toFixed(4);
// The bars around a band: top, bottom, then the sides beside the band.
const stripsOf = ({ x, y, w, h }) => [
  { x: 0, y: 0, w: W, h: y }, { x: 0, y: y + h, w: W, h: H - y - h },
  { x: 0, y, w: x, h }, { x: x + w, y, w: W - x - w, h },
].filter((s) => s.w >= 2 && s.h >= 2);
const strips = groups.map((g) => stripsOf(g.band));
const parts = [`[0:v]split=${1 + groups.length + strips.flat().length}[base]` +
  groups.map((_, i) => `[c${i}]` + strips[i].map((_, j) => `[k${i}_${j}]`).join("")).join("")];
groups.forEach((g, i) => {
  const { x, y, w, h } = g.band;
  // The band, scaled to cover the frame at a quarter size, blurred, scaled back up.
  parts.push(`[c${i}]crop=${w}:${h}:${x}:${y},split=2[fg${i}][s${i}]`);
  let cur = `bg${i}`;
  parts.push(`[s${i}]scale=${W / 4}:${H / 4}:force_original_aspect_ratio=increase,crop=${W / 4}:${H / 4},boxblur=10:2,scale=${W}:${H},setsar=1[${cur}]`);
  // Whatever CapCut drew in the bars that is not black (the title, the end card,
  // a transition sweeping across) goes back on top of the blur, with a soft
  // shadow under it: a shadow CapCut drew over a black bar is black on black in
  // the export, so it cannot be keyed back, and white text on a bright blurred
  // sky needs one to read.
  const texts = [];
  strips[i].forEach((s, j) => {
    const id = `${i}_${j}`, shadow = s.w >= 40 && s.h >= 40;
    parts.push(`[k${id}]crop=${s.w}:${s.h}:${s.x}:${s.y},lumakey=threshold=${keyAt}:tolerance=0.035:softness=0.02` +
      (shadow ? `,split=2[t${id}][d${id}]` : `[t${id}]`));
    if (shadow) {
      parts.push(`[d${id}]lutyuv=y=${BLACK}:u=128:v=128:a='val*0.6',boxblur=luma_radius=4:luma_power=1:alpha_radius=5:alpha_power=2[sd${id}]`);
      parts.push(`[${cur}][sd${id}]overlay=${s.x + 2}:${s.y + 2}[bs${id}]`); cur = `bs${id}`;
    }
    texts.push([`t${id}`, s]);
  });
  parts.push(`[${cur}][fg${i}]overlay=${x}:${y}[cp${i}]`); cur = `cp${i}`;
  texts.forEach(([t, s], j) => { parts.push(`[${cur}][${t}]overlay=${s.x}:${s.y}[tx${i}_${j}]`); cur = `tx${i}_${j}`; });
  parts.push(`[${cur}]null[g${i}]`);
});
let last = "base";
groups.forEach((g, i) => { parts.push(`[${last}][g${i}]overlay=0:0:enable='${between(g.windows)}'[m${i}]`); last = `m${i}`; });
const grade = [];
for (const k of ["hard", "gentle"]) {
  if (!lifts[k].length) continue;
  const en = `:enable='${between(lifts[k])}'`;
  grade.push(GRADE[k].split(",").map((f) => f + en).join(","));
}
parts.push(`[${last}]${grade.length ? grade.join(",") + "," : ""}format=yuv420p[v]`);
const tmp = out.replace(/(\.[^.\\/]+)?$/, ".part$1");
const enc = run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-filter_complex", parts.join(";"),
  "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "copy", "-movflags", "+faststart", tmp]);
if (enc.status !== 0) { try { fs.unlinkSync(tmp); } catch { /* nothing written */ } say(1, { error: (enc.stderr || "").slice(-600) }); }
fs.renameSync(tmp, out);
say(0, {
  out, shots: shots.length || undefined, blurred: groups.reduce((n, g) => n + g.shots.length, 0), full: fullShots,
  bands: groups.map((g) => ({ top: g.band.y, height: g.band.h, left: g.band.x, width: g.band.w, shots: g.shots, windows: g.windows.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]) })),
  night: NIGHT ? night : undefined,
});
