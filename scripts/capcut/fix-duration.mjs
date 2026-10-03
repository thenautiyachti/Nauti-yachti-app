// Set a draft's total duration to its true last segment end.
//   node fix-duration.mjs "<project dir>"
// add-video at full length grows draft.duration; trim never shrinks it back.
import { loadDraft, saveDraft } from "file:///C:/Users/immex/.node_modules/capcut-cli/dist/lib.js";
const dir = process.argv[2];
const { draft, filePath: file } = loadDraft(dir);
let end = 0;
for (const t of draft.tracks) for (const s of t.segments) end = Math.max(end, s.target_timerange.start + s.target_timerange.duration);
const before = draft.duration;
draft.duration = end;
saveDraft(file, draft);
console.log(JSON.stringify({ file, before_s: before / 1e6, after_s: end / 1e6 }));
