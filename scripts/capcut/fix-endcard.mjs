// Give a draft's last text segment (the end card) at least 2.5s, ending with the video.
//   node fix-endcard.mjs "<draft dir>"
import { loadDraft, saveDraft } from "file:///C:/Users/immex/.node_modules/capcut-cli/dist/lib.js";
const { draft, filePath } = loadDraft(process.argv[2]);
const texts = draft.tracks.filter((t) => t.type === "text").flatMap((t) => t.segments).sort((a, b) => a.target_timerange.start - b.target_timerange.start);
const end = texts[texts.length - 1];
const dur = Math.min(draft.duration, Math.max(end.target_timerange.duration, 2500000));
end.target_timerange = { start: draft.duration - dur, duration: dur };
saveDraft(filePath, draft);
console.log(JSON.stringify({ end_card_s: [(draft.duration - dur) / 1e6, draft.duration / 1e6] }));
