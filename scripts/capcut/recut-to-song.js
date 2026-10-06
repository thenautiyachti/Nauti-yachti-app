// Re-cut Oscar's CapCut draft to the song the owner put on it (2 Oct 2026).
//
//   node recut-to-song.js "<project dir>" [--apply]
//
// The song (REFLECTION, Phonk, 22.8s, ~104 bpm) is shorter than the 37.3s cut,
// so the picture is rebuilt to the song: every cut on a downbeat from CapCut's
// own beat map, a two-beat flash for the shortest rider window. His audio track
// is never touched; the old video and text segments are removed and replaced.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const CLI = "C:/Users/immex/.node_modules/capcut-cli/dist/index.js";
const DIR = "C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos/02 Charters/_By charter/2026-09-06 Oscar RoblesGil R (tubing, wakeboarding)";
const PROJ = process.argv[2];
const APPLY = process.argv.includes("--apply");
const WC = 1080, HC = 1920;

function cc(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", input, maxBuffer: 1 << 26 });
  const text = (r.stdout || "").trim();
  if (r.status !== 0) throw new Error("capcut " + args.slice(0, 2).join(" ") + " failed: " + (r.stderr || text).slice(0, 600));
  try { return JSON.parse(text); } catch { try { return JSON.parse(text.split("\n")[0]); } catch { return { raw: text }; } }
}
const src = (stem) => path.join(DIR, fs.readdirSync(DIR).find((x) => x.startsWith("20260906_" + stem) && /\.mp4$/i.test(x)));
function size(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", file], { encoding: "utf8" });
  const s = JSON.parse(r.stdout).streams[0];
  return { w: s.width, h: s.height };
}

// ---- the song and its beat map, read from the draft CapCut saved ----
const draft = JSON.parse(fs.readFileSync(path.join(PROJ, "draft_content.json"), "utf8"));
const song = (draft.materials.audios || []).find((a) => a.type === "music");
if (!song) throw new Error("no music on this draft");
const songSeg = draft.tracks.filter((t) => t.type === "audio").flatMap((t) => t.segments).find((s) => s.material_id === song.id);
const beatMat = (draft.materials.beats || []).find((b) => (songSeg.extra_material_refs || []).includes(b.id));
const beatFile = JSON.parse(fs.readFileSync(beatMat.ai_beats.beats_path, "utf8"));
const offset = (songSeg.target_timerange.start - songSeg.source_timerange.start) / 1e6;
const beats = beatFile.time.map((ms, i) => ({ t: ms / 1000 + offset, bar: beatFile.value[i] }));
const down = beats.filter((b) => b.bar === 1).map((b) => b.t);
const third = beats.filter((b) => b.bar === 3).map((b) => b.t);
const end = (songSeg.target_timerange.start + songSeg.target_timerange.duration) / 1e6;
console.log("song:", song.name, song.category_name, "| length", end.toFixed(2) + "s | downbeats", down.map((t) => t.toFixed(2)).join(" "));

// Cut points: downbeats, plus the beat-3 inside the 7th bar for a rider flash.
const at = (n) => down[n];
const half = (n) => third.find((t) => t > down[n] && t < down[n + 1]);
const CUTS = [0, at(1), at(2), at(3), at(5), at(6), half(6), at(7), at(8), at(9), end];
// [stem, sourceStart, track (seconds into shot, x, y), zoomOverCover]
const SHOTS = [
  ["134243", 24.0, [[0, .57, .44], [1, .65, .46], [2, .55, .47], [3, .45, .47], [3.3, .45, .47]], 2.4],
  ["115722", 3.5],
  ["122217", 12.0],
  ["134601", 1.0, [[0, .28, .36], [1, .32, .37], [2, .42, .39], [3, .47, .40], [4, .52, .40], [4.6, .55, .40]], 2.2],
  ["120409", 73.5],
  ["134911", 1.5, [[0, .45, .47], [0.5, .43, .47], [1.15, .42, .47]], 2.2],
  ["135541", 3.4],
  ["140037", 5.0],
  ["141230", 41.0],
  ["141746", 2.5],
];
if (CUTS.some((c) => c === undefined) || CUTS.length !== SHOTS.length + 1) throw new Error("beat grid does not fit the shot list: " + CUTS);
SHOTS.forEach((s, i) => console.log("  " + CUTS[i].toFixed(2).padStart(5) + "-" + CUTS[i + 1].toFixed(2).padStart(5) + "  " + s[0] + " from " + s[1] + "s" + (s[2] ? "  (rider zoom)" : "")));
if (!APPLY) { console.log("dry run: --apply to write (CapCut must be closed)."); process.exit(0); }

const running = spawnSync("tasklist", ["/FI", "IMAGENAME eq CapCut.exe"], { encoding: "utf8" }).stdout;
if (/CapCut\.exe/i.test(running)) throw new Error("CapCut is open. Close it first: it overwrites the project on exit.");

// Back up every timeline file before touching anything.
const bak = path.join(__dirname, "oscar-draft-backup-" + Date.now());
fs.mkdirSync(bak, { recursive: true });
for (const f of fs.readdirSync(PROJ)) if (/\.(json|tmp)$/.test(f)) fs.copyFileSync(path.join(PROJ, f), path.join(bak, f));
console.log("backup:", bak);

// Out with the old picture and titles; the audio track stays exactly as he left it.
for (const t of draft.tracks) {
  if (t.type !== "video" && t.type !== "text") continue;
  for (const s of t.segments) cc(["remove", PROJ, s.id]);
}

const TRANS = ["pull-in", "white-flash", "split-iv", "slide", "whirlpool", "radial-blur", "shutter"];
const ids = [];
SHOTS.forEach(([stem, from, track, zoomOverCover], i) => {
  const file = src(stem);
  const { w, h } = size(file);
  const start = CUTS[i], dur = +(CUTS[i + 1] - CUTS[i]).toFixed(3);
  const add = cc(["add-video", PROJ, file, start.toFixed(3) + "s"]);
  const id = add.segment_id;
  cc(["trim", PROJ, id, from + "s", dur + "s"]);
  cc(["volume", PROJ, id, "0.2"]);
  const fit = Math.min(WC / w, HC / h);
  const cover = Math.max(WC / (w * fit), HC / (h * fit));
  const rows = [];
  if (!track) rows.push({ property: "uniform_scale", time: 0, value: +cover.toFixed(4) });
  else {
    const s = cover * zoomOverCover, Wd = w * fit * s, Hd = h * fit * s, targetY = (0.45 - 0.5) * HC;
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
  ids.push(id);
});
ids.slice(0, -1).forEach((id, i) => cc(["transition", PROJ, id, TRANS[i % TRANS.length], "--duration", "0.3s"]));
cc(["add-text", PROJ, "0s", CUTS[1].toFixed(3) + "s", "Wake day on Lake Conroe", "--font-size", "13", "--color", "#FFFFFF", "--y", "0.62"]);
cc(["add-text", PROJ, CUTS[8].toFixed(3) + "s", (end - CUTS[8]).toFixed(3) + "s", "Book your day\nthenautiyachti.com", "--font-size", "11", "--color", "#FFFFFF", "--y", "-0.55"]);

const fix = spawnSync(process.execPath, [path.join(__dirname, "fix-duration.mjs"), PROJ], { encoding: "utf8" });
if (fix.status !== 0) throw new Error("fix-duration failed: " + fix.stderr);
console.log(fix.stdout.trim());
console.log("sync:", cc(["sync-timelines", PROJ, "--nested", "--apply"]).message);
console.log("register:", JSON.stringify(cc(["register", PROJ, "--materials", "--apply"]).applied));
