// Pilot, 2 Oct 2026: Oscar's charter as an editable CapCut desktop project.
//
//   node build-oscar-capcut.js --name "Oscar recap (Claude draft)" [--drafts <dir>] [--template auto|bundled]
//
// The owner finishes it in CapCut: music, his own transitions, effects, export.
// What this lays down is the part that is slow by hand: the windows (owner's
// picks.txt, tightened to the steady stretch of each), the rider punch-in as
// tracking keyframes, a full-bleed fill on every other shot, a transition at
// every join, a hook title and an end card. Clip audio is turned down, not off,
// so his music sits on top without losing the cheering.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const CLI = "C:/Users/immex/.node_modules/capcut-cli/dist/index.js";
const DIR = "C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos/02 Charters/_By charter/2026-09-06 Oscar RoblesGil R (tubing, wakeboarding)";
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > -1 ? process.argv[i + 1] : d; };
const NAME = arg("name", "Oscar recap (Claude draft)");
const DRAFTS = arg("drafts", null);
const TEMPLATE = arg("template", "auto");
const WC = 1080, HC = 1920;

function cc(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", input, maxBuffer: 1 << 26 });
  const text = (r.stdout || "").trim();
  if (r.status !== 0) throw new Error("capcut " + args.slice(0, 2).join(" ") + " failed: " + (r.stderr || text).slice(0, 600));
  if (r.stderr && /warning/i.test(r.stderr)) process.stderr.write("  [" + args[0] + "] " + r.stderr.trim().split("\n")[0].slice(0, 220) + "\n");
  // Some commands print a JSON line and then human notes; the JSON is line one.
  try { return JSON.parse(text); } catch { try { return JSON.parse(text.split("\n")[0]); } catch { return { raw: text }; } }
}
const src = (stem) => {
  const f = fs.readdirSync(DIR).find((x) => x.startsWith("20260906_" + stem) && /\.mp4$/i.test(x));
  if (!f) throw new Error("no clip " + stem);
  return path.join(DIR, f);
};
function size(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation", "-of", "json", file], { encoding: "utf8" });
  const s = JSON.parse(r.stdout).streams[0];
  const rot = Math.abs(((s.side_data_list || []).find((d) => d.rotation !== undefined) || {}).rotation || 0);
  return rot === 90 || rot === 270 ? { w: s.height, h: s.width } : { w: s.width, h: s.height };
}

// [stem, from, to, track] — track = [[secondsIntoWindow, x, y], ...] read off a
// 10% grid of sampled frames, x/y as fractions of the source frame. No track
// means a people shot: fill the 9:16 frame and leave it.
const HOOK = "Wake day on Lake Conroe";
const SHOTS = [
  ["134243", 24.0, 28.6, [[0, .57, .44], [1, .65, .46], [2, .55, .47], [3, .45, .47], [4, .45, .47], [4.6, .46, .47]], 2.0],
  ["115722", 3.5, 5.5],
  ["120409", 73.5, 77.0],
  ["122217", 12.0, 14.5],
  ["122730", 32.0, 33.5],
  ["123642", 1.0, 4.5],
  ["125719", 1.5, 3.3],
  ["134447", 19.0, 19.8, [[0, .55, .53], [0.6, .50, .52], [0.8, .50, .52]]],
  ["134601", 1.0, 5.8, [[0, .28, .36], [1, .32, .37], [2, .42, .39], [3, .47, .40], [4, .52, .40], [4.8, .56, .40]]],
  ["134911", 1.5, 2.7, [[0, .45, .47], [0.5, .43, .47], [1.2, .42, .47]]],
  ["135541", 3.5, 4.5],
  ["140037", 5.0, 8.5],
  ["140349", 16.0, 17.6],
  ["141230", 41.0, 44.5],
  ["141746", 2.5, 4.0],
];
// Cut-type transitions only: an overlap transition eats into both neighbours,
// and on a 1-second rider beat there is nothing to eat.
const TRANS = ["pull-in", "white-flash", "split-iv", "slide", "whirlpool", "radial-blur", "shutter", "flip-ii", "blocks", "woosh"];

const initArgs = ["init", NAME, "--ratio", "9:16", "--template", TEMPLATE];
if (DRAFTS) initArgs.push("--drafts", DRAFTS);
const made = cc(initArgs);
const PROJ = made.draft_path;
if (!PROJ) throw new Error("init returned no draft_path: " + JSON.stringify(made).slice(0, 300));
console.log("project:", PROJ, "| template", made.template && made.template.source, made.template && made.template.app_version);

let t = 0;
const segs = [];
SHOTS.forEach(([stem, a, b, track, zoomOverCover = 2.2], i) => {
  const file = src(stem);
  const { w, h } = size(file);
  const dur = +(b - a).toFixed(3);
  // No duration here: given one, add-video records the MATERIAL as that long,
  // and CapCut then clamps an in-point past it to 0 (every shot would play
  // from the start of its file). Add at full probed length, then trim.
  const add = cc(["add-video", PROJ, file, t.toFixed(3) + "s"]);
  const id = add.segment_id;
  cc(["trim", PROJ, id, a + "s", dur + "s"]);
  cc(["volume", PROJ, id, "0.35"]);
  // CapCut fits the source inside the canvas, then applies scale; position is
  // in half-canvas units, x right and y UP (as capcut-cli's renderer reads it).
  const fit = Math.min(WC / w, HC / h);
  const cover = Math.max(WC / (w * fit), HC / (h * fit));
  const rows = [];
  if (!track) {
    rows.push({ property: "uniform_scale", time: 0, value: +cover.toFixed(4) });
  } else {
    const s = cover * zoomOverCover;
    const Wd = w * fit * s, Hd = h * fit * s;
    const targetY = (0.45 - 0.5) * HC; // rider a little above centre, wake below
    rows.push({ property: "uniform_scale", time: 0, value: +s.toFixed(4) });
    for (const [tt, u, v] of track) {
      let dx = -(u - 0.5) * Wd, dy = targetY - (v - 0.5) * Hd;
      const mx = (Wd - WC) / 2, my = (Hd - HC) / 2;
      dx = Math.max(-mx, Math.min(mx, dx)); dy = Math.max(-my, Math.min(my, dy));
      const tu = Math.round(Math.min(tt, dur - 0.02) * 1e6);
      rows.push({ property: "position_x", time: tu, value: +(dx / (WC / 2)).toFixed(4) });
      rows.push({ property: "position_y", time: tu, value: +(-dy / (HC / 2)).toFixed(4) });
    }
  }
  cc(["keyframe", PROJ, id, "--batch"], rows.map((r) => JSON.stringify(r)).join("\n"));
  segs.push({ id, stem, a, b, start: t, dur, track: !!track });
  t = +(t + dur).toFixed(3);
});
segs.slice(0, -1).forEach((s, i) => cc(["transition", PROJ, s.id, TRANS[i % TRANS.length], "--duration", "0.4s"]));

cc(["add-text", PROJ, "0s", "2.6s", HOOK, "--font-size", "13", "--color", "#FFFFFF", "--y", "0.62"]);
cc(["add-text", PROJ, (t - 2.6).toFixed(2) + "s", "2.6s", "Book your day\nthenautiyachti.com", "--font-size", "11", "--color", "#FFFFFF", "--y", "-0.55"]);

// Two repairs every build needs (both found on the first real build, 2 Oct 2026):
// add-video at full length grew the draft's duration to 104s and trim never
// shrinks it back; and CapCut 9.x only lists media that draft_meta_info names.
const fix = spawnSync(process.execPath, [path.join(__dirname, "fix-duration.mjs"), PROJ], { encoding: "utf8" });
if (fix.status !== 0) throw new Error("fix-duration failed: " + fix.stderr);
if (!DRAFTS) cc(["register", PROJ, "--materials", "--apply"]);
console.log(JSON.stringify({ project: PROJ, seconds: t, shots: segs.length, riding: segs.filter((s) => s.track).length }, null, 1));
