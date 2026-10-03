// Snap a CapCut draft's cuts to the beats the owner marked on his song.
//
//   node snap-to-beats.mjs "<project dir>" [--apply] [--beats 0.52,1.04,...]
//
// He picks the song in CapCut (Commercial only) and clicks Auto mark beats; this
// moves every cut on the main video track to the nearest beat, never by more
// than half a beat, so each shot keeps the moment it was chosen for. Keyframes
// (the rider punch-in) move with their shot. The song is trimmed to the new end
// and the hook title ends on the first cut. Dry run unless --apply.
import { loadDraft, saveDraft } from "file:///C:/Users/immex/.node_modules/capcut-cli/dist/lib.js";
import { readFileSync, existsSync } from "node:fs";

const dir = process.argv[2];
const APPLY = process.argv.includes("--apply");
const bi = process.argv.indexOf("--beats");
const { draft, filePath } = loadDraft(dir);
const US = 1e6;
const mats = draft.materials || {};
const byId = new Map();
for (const [kind, list] of Object.entries(mats)) if (Array.isArray(list)) for (const m of list) if (m && m.id) byId.set(m.id, { kind, m });

// ---- the song and its beats ----
const audioTracks = draft.tracks.filter((t) => t.type === "audio");
const songSeg = audioTracks.flatMap((t) => t.segments).sort((a, b) => b.target_timerange.duration - a.target_timerange.duration)[0];
if (!songSeg) { console.log("NO SONG on the timeline yet."); process.exit(2); }
const songMat = byId.get(songSeg.material_id)?.m || {};
const speed = songSeg.speed || 1;
const toTimeline = (songUs) => songSeg.target_timerange.start + (songUs - songSeg.source_timerange.start) / speed;

let beatsSong = []; // microseconds in SONG time
let beatsFrom = "";
if (bi > -1) {
  beatsSong = process.argv[bi + 1].split(",").map((s) => Math.round(Number(s) * US));
  beatsFrom = "--beats";
} else {
  const refs = (songSeg.extra_material_refs || []).map((id) => byId.get(id)).filter(Boolean);
  const beatMats = refs.filter((r) => r.kind === "beats").map((r) => r.m);
  for (const b of beatMats) {
    // Seen shapes (JianYing/CapCut): user_beats = ms list; ai_beats.melody/beats
    // in a local JSON file at beats_path. Read what is there; report what is not.
    if (Array.isArray(b.user_beats) && b.user_beats.length) { beatsSong.push(...b.user_beats.map((x) => Math.round(x * 1000))); beatsFrom += "user_beats "; }
    const ai = b.ai_beats || {};
    const p = ai.beats_path || ai.melody_path;
    if (b.enable_ai_beats !== false && p && existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf8"));
        const flat = JSON.stringify(raw).match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
        console.log("ai beats file", p, "| keys:", Object.keys(raw).slice(0, 8), "| first numbers:", flat.slice(0, 12));
      } catch (e) { console.log("ai beats file unreadable:", p, e.message); }
    }
    if (!beatsSong.length) console.log("beats material (no usable list yet):", JSON.stringify(b).slice(0, 900));
  }
  if (!beatMats.length) console.log("song has no beats material attached. extra refs:", (songSeg.extra_material_refs || []).map((id) => byId.get(id)?.kind));
}
beatsSong = [...new Set(beatsSong)].sort((a, b) => a - b);
const beats = beatsSong.map(toTimeline).filter((t) => t >= 0);
console.log("song:", songMat.name || songMat.path || songSeg.material_id, "| beats:", beats.length, "from", beatsFrom || "nowhere");
if (beats.length < 4) { console.log("Not enough beats to snap to. Nothing changed."); process.exit(3); }
const gaps = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
const beat = gaps[Math.floor(gaps.length / 2)];
console.log("median beat", (beat / US).toFixed(3) + "s", "(~" + Math.round(60 / (beat / US)) + " bpm)");

// ---- the cuts ----
const vtrack = draft.tracks.filter((t) => t.type === "video").sort((a, b) => b.segments.length - a.segments.length)[0];
const segs = [...vtrack.segments].sort((a, b) => a.target_timerange.start - b.target_timerange.start);
const old = segs.map((s) => [s.target_timerange.start, s.target_timerange.start + s.target_timerange.duration]);
// All cuts are placed together: each may land on a beat within a beat of where
// it was, or stay put at a heavy cost, and no shot may fall under MIN. Least
// total movement wins. Snapping one cut at a time squeezed a 0.8s rider shot
// to 0.57s when the cut before it moved later; this sees both cuts at once.
const MIN = 0.7 * US, OFF = 10 * US;
const cand = old.map(([, t]) => [...beats.filter((b) => Math.abs(b - t) <= beat).map((b) => ({ b, c: Math.abs(b - t) })), { b: t, c: OFF }]);
let layer = [{ b: 0, cost: 0, path: [0] }];
for (let i = 0; i < cand.length; i++) {
  const next = [];
  for (const { b, c } of cand[i]) {
    let best = null;
    for (const p of layer) if (b - p.b >= MIN && (!best || p.cost < best.cost)) best = p;
    if (best) next.push({ b, cost: best.cost + c, path: [...best.path, b] });
  }
  if (!next.length) { console.log("No placement keeps every shot", MIN / US + "s long. Nothing changed."); process.exit(4); }
  layer = next;
}
const bounds = layer.sort((a, b) => a.cost - b.cost)[0].path;
const offBeat = bounds.slice(1).filter((b, i) => b === old[i][1] && !beats.includes(b)).length;
if (offBeat) console.log("cuts left off the beat (no beat close enough):", offBeat);
const plan = segs.map((s, i) => {
  const [s0, e0] = old[i], s1 = bounds[i], e1 = bounds[i + 1];
  const dStart = s1 - s0; // >0 trims the front of the shot, <0 shows a little earlier
  const mat = byId.get(s.material_id)?.m || {};
  let srcStart = s.source_timerange.start + dStart;
  if (srcStart < 0) srcStart = 0;
  const dur = e1 - s1;
  if (mat.duration && srcStart + dur > mat.duration) srcStart = Math.max(0, mat.duration - dur);
  return { s, s1, dur, dStart: srcStart - s.source_timerange.start, srcStart, moved: [(s1 - s0) / US, (e1 - e0) / US] };
});
for (const p of plan) console.log("  shot @" + (p.s1 / US).toFixed(2).padStart(6), "len", (p.dur / US).toFixed(2), "| start moved", p.moved[0].toFixed(2) + "s", "end moved", p.moved[1].toFixed(2) + "s");
const total = bounds[bounds.length - 1];
console.log("new length", (total / US).toFixed(2) + "s (was " + (old[old.length - 1][1] / US).toFixed(2) + "s)");
if (!APPLY) { console.log("dry run: add --apply to write."); process.exit(0); }

for (const p of plan) {
  const s = p.s;
  s.target_timerange = { start: p.s1, duration: p.dur };
  s.source_timerange = { start: p.srcStart, duration: Math.round(p.dur * (s.speed || 1)) };
  for (const list of s.common_keyframes || []) {
    for (const k of list.keyframe_list) k.time_offset = Math.max(0, Math.min(p.dur, k.time_offset - p.dStart));
  }
}
// Hook title ends on the first cut; the end card covers the last shot.
const texts = draft.tracks.filter((t) => t.type === "text").flatMap((t) => t.segments).sort((a, b) => a.target_timerange.start - b.target_timerange.start);
if (texts[0]) texts[0].target_timerange = { start: 0, duration: bounds[1] };
if (texts.length > 1) { const last = plan[plan.length - 1]; texts[texts.length - 1].target_timerange = { start: last.s1, duration: last.dur }; }
// Song ends with the picture.
songSeg.target_timerange.duration = total - songSeg.target_timerange.start;
songSeg.source_timerange.duration = Math.round(songSeg.target_timerange.duration * speed);
draft.duration = total;
saveDraft(filePath, draft);
console.log("written:", filePath);
