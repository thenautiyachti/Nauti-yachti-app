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
  // No background blur here. Most footage is 4:3 and sits between bars in the
  // 9:16 frame; the owner chose a blurred background (5 Oct 2026). capcut-cli's
  // bg-blur writes a canvas CapCut 9.5 never renders, so blur-bars.js fills the
  // bars on the exported file instead.
  // Scale as scale_x + scale_y. capcut-cli's "uniform_scale" writes the key
  // UNIFORM_SCALE, which CapCut 9.5 ignores: until 5 Oct 2026 no zoom in any
  // recap or compilation ever rendered, riders included. KFTypeScaleX/Y is
  // what CapCut itself writes.
  const sc = (time, value) => [{ property: "scale_x", time, value }, { property: "scale_y", time, value }];
  const rows = sc(0, s.scale);
  if (s.x || s.y) { rows.push({ property: "position_x", time: 0, value: s.x || 0 }, { property: "position_y", time: 0, value: s.y || 0 }); }
  if (s.kb) rows.push(...sc(Math.round((s.dur - 0.05) * 1e6), +(s.scale * s.kb).toFixed(4)));
  cc(["keyframe", PROJ, id, "--batch"], rows.map((r) => JSON.stringify(r)).join("\n"));
  ids.push(id);
}
ids.slice(0, -1).forEach((id, i) => cc(["transition", PROJ, id, plan.trans[i % plan.trans.length], "--duration", "0.3s"]));
const first = plan.shots[0], last = plan.shots[plan.shots.length - 1];
// A long title runs off both edges at this size ("Day on the water, Lake Conroe"
// did, 5 Oct 2026): over 22 characters it goes on two lines, broken at a comma
// or at the space nearest the middle, as the closing card already is.
const wrap = (s) => {
  if (s.length <= 22 || s.includes("\n")) return s;
  const c = s.indexOf(", ");
  if (c > 0) return s.slice(0, c + 1) + "\n" + s.slice(c + 2);
  const sp = [...s.matchAll(/ /g)].map((m) => m.index).sort((a, b) => Math.abs(a - s.length / 2) - Math.abs(b - s.length / 2))[0];
  return sp ? s.slice(0, sp) + "\n" + s.slice(sp + 1) : s;
};
// The title sits in the space ABOVE the picture and the end card in the space
// BELOW it, not over the guests. Owner, 5 Oct 2026: "if its possible we can use
// the caption in the black space either below or above the media." A 4:3 shot
// leaves 240 px top and bottom. Both go in the TOP space: TikTok and Reels lay
// their own caption and buttons over the bottom fifth of the screen, so text in
// the bottom bar would be covered, and the top edge carries their tabs. y = 0.82
// (CapCut's y is up, 1 = top edge) is inside the top bar and inside the
// platforms' safe area. A shadow keeps white text readable over the blurred bars.
const title = cc(["add-text", PROJ, "0s", Math.min(plan.song.length, Math.max(first.dur, 2.5)).toFixed(3) + "s", wrap(plan.hook), "--font-size", "13", "--color", "#FFFFFF", "--y", "0.82"]);
const endDur = Math.min(plan.song.length, Math.max(last.dur, 2.5));
// The website is always written TheNautiYachti.com (owner, 5 Oct 2026).
const endText = String(plan.endText).replace(/thenautiyachti\.com/i, "TheNautiYachti.com");
const card = cc(["add-text", PROJ, (plan.song.length - endDur).toFixed(3) + "s", endDur.toFixed(3) + "s", endText, "--font-size", "11", "--color", "#FFFFFF", "--y", "0.82"]);
for (const t of [title, card]) if (t && t.segment_id) cc(["text-style", PROJ, t.segment_id, "--shadow"]);
cc(["register", PROJ, "--materials", "--apply"]);
const song = JSON.parse(node("add-shelf-song.mjs", [PROJ, plan.song.id, String(plan.song.start), String(plan.song.length)]));
cc(["audio-fade", PROJ, song.segment_id, "--fade-out", "1.2"]);
node("fix-duration.mjs", [PROJ]);
cc(["sync-timelines", PROJ, "--nested", "--apply"]);
cc(["register", PROJ, "--apply"]);
const lint = spawnSync(process.execPath, [CLI, "lint", PROJ, "-H"], { encoding: "utf8" }).stdout;
const problems = lint.split("\n").filter((l) => /^(ERROR|WARN)/.test(l));
console.log(JSON.stringify({ name: plan.name, seconds: plan.song.length, shots: ids.length, song: song.song, lint: problems.length ? problems : "clean" }));
