// Execute a recap plan (written by plan_recaps.py) as a CapCut draft.
//
//   node build-from-plan.js plan.json
//
// Plan: { name, song: {id, start, length}, shots: [{file, from, at, dur, image,
// scale, x, y, kb}], hook, endText, trans }. Times in seconds; `at` is the shot's
// place on the timeline, already on the song's beat grid. Video first, song last,
// so register --materials sees only the clips and never the song's cache file.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const CLI = "C:/Users/immex/.node_modules/capcut-cli/dist/index.js";
const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

function cc(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", input, maxBuffer: 1 << 26 });
  const text = (r.stdout || "").trim();
  if (r.status !== 0) throw new Error("capcut " + args.slice(0, 2).join(" ") + ": " + (r.stderr || text).slice(0, 500));
  try { return JSON.parse(text); } catch { try { return JSON.parse(text.split("\n")[0]); } catch { return { raw: text }; } }
}
function node(script, args) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(script + ": " + (r.stderr || r.stdout).slice(0, 500));
  return r.stdout.trim();
}
const running = spawnSync("tasklist", ["/FI", "IMAGENAME eq CapCut.exe"], { encoding: "utf8" }).stdout;
if (/CapCut\.exe/i.test(running)) throw new Error("CapCut is open; it would overwrite the drafts.");

const made = cc(["init", plan.name, "--ratio", "9:16", "--template", "auto"]);
const PROJ = made.draft_path;
const ids = [];
for (const s of plan.shots) {
  const add = cc(["add-video", PROJ, s.file, s.at.toFixed(3) + "s"].concat(s.image ? [s.dur.toFixed(3) + "s"] : []));
  const id = add.segment_id;
  if (!s.image) { cc(["trim", PROJ, id, s.from.toFixed(3) + "s", s.dur.toFixed(3) + "s"]); cc(["volume", PROJ, id, "0.2"]); }
  const rows = [{ property: "uniform_scale", time: 0, value: s.scale }];
  if (s.x || s.y) { rows.push({ property: "position_x", time: 0, value: s.x || 0 }, { property: "position_y", time: 0, value: s.y || 0 }); }
  if (s.kb) rows.push({ property: "uniform_scale", time: Math.round((s.dur - 0.05) * 1e6), value: +(s.scale * s.kb).toFixed(4) });
  cc(["keyframe", PROJ, id, "--batch"], rows.map((r) => JSON.stringify(r)).join("\n"));
  ids.push(id);
}
ids.slice(0, -1).forEach((id, i) => cc(["transition", PROJ, id, plan.trans[i % plan.trans.length], "--duration", "0.3s"]));
const first = plan.shots[0], last = plan.shots[plan.shots.length - 1];
cc(["add-text", PROJ, "0s", Math.min(plan.song.length, Math.max(first.dur, 2.5)).toFixed(3) + "s", plan.hook, "--font-size", "13", "--color", "#FFFFFF", "--y", "0.62"]);
const endDur = Math.min(plan.song.length, Math.max(last.dur, 2.5));
cc(["add-text", PROJ, (plan.song.length - endDur).toFixed(3) + "s", endDur.toFixed(3) + "s", plan.endText, "--font-size", "11", "--color", "#FFFFFF", "--y", "-0.55"]);
cc(["register", PROJ, "--materials", "--apply"]);
const song = JSON.parse(node("add-shelf-song.mjs", [PROJ, plan.song.id, String(plan.song.start), String(plan.song.length)]));
cc(["audio-fade", PROJ, song.segment_id, "--fade-out", "1.2"]);
node("fix-duration.mjs", [PROJ]);
cc(["sync-timelines", PROJ, "--nested", "--apply"]);
cc(["register", PROJ, "--apply"]);
const lint = spawnSync(process.execPath, [CLI, "lint", PROJ, "-H"], { encoding: "utf8" }).stdout;
const problems = lint.split("\n").filter((l) => /^(ERROR|WARN)/.test(l));
console.log(JSON.stringify({ name: plan.name, seconds: plan.song.length, shots: ids.length, song: song.song, lint: problems.length ? problems : "clean" }));
