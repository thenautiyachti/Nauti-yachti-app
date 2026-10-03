// Put one of the owner's Music-shelf tracks on a draft, as CapCut's own entry.
//
//   node add-shelf-song.mjs "<draft dir>" "<shelf song material id>" <songStartSec> <lengthSec>
//
// The shelf is a CapCut project he filled from Commercial only. Its audio
// material carries the music_id and licence; a bare file from CapCut's cache
// would not. So this copies that material, and every companion it references
// (beats, speeds, channel mapping...), into the target with fresh ids, on a new
// audio track. Nothing is downloaded and the shelf itself is only read.
import { loadDraft, saveDraft } from "file:///C:/Users/immex/.node_modules/capcut-cli/dist/lib.js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const SHELF = join(process.env.LOCALAPPDATA, "CapCut/User Data/Projects/com.lveditor.draft/media shelf/draft_content.json");
const [dir, songId, startS, lenS] = process.argv.slice(2);
const shelf = JSON.parse(readFileSync(SHELF, "utf8"));
const where = new Map();
for (const [kind, list] of Object.entries(shelf.materials)) if (Array.isArray(list)) for (const m of list) if (m && m.id) where.set(m.id, { kind, m });
const song = where.get(songId);
if (!song || song.kind !== "audios") throw new Error("not a shelf song: " + songId);
let srcTrack, srcSeg;
for (const t of shelf.tracks) for (const s of t.segments) if (s.material_id === songId) { srcTrack = t; srcSeg = s; }
if (!srcSeg) throw new Error("song not on the shelf timeline");

const { draft, filePath } = loadDraft(dir);
const fresh = () => randomUUID().toUpperCase();
const clone = (o) => JSON.parse(JSON.stringify(o));
const add = (kind, m) => { (draft.materials[kind] = draft.materials[kind] || []).push(m); return m.id; };
const mat = clone(song.m); mat.id = fresh(); add("audios", mat);
const refs = (srcSeg.extra_material_refs || []).map((rid) => {
  const r = where.get(rid);
  if (!r) return null;
  const c = clone(r.m); c.id = fresh(); return add(r.kind, c);
}).filter(Boolean);
const startUs = Math.round(Number(startS) * 1e6), lenUs = Math.round(Number(lenS) * 1e6);
if (startUs + lenUs > mat.duration + 1000) throw new Error("song too short for that window");
const seg = clone(srcSeg);
Object.assign(seg, { id: fresh(), material_id: mat.id, extra_material_refs: refs,
  target_timerange: { start: 0, duration: lenUs }, source_timerange: { start: startUs, duration: lenUs }, speed: 1 });
const track = clone(srcTrack);
Object.assign(track, { id: fresh(), segments: [seg] });
draft.tracks.push(track);
saveDraft(filePath, draft);
console.log(JSON.stringify({ ok: true, song: mat.name, segment_id: seg.id, start_s: Number(startS), length_s: Number(lenS) }));
