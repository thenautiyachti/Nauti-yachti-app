// The tools all answer. Do they answer TRUTHFULLY?
//
// A search index is the easiest thing in this system to be quietly wrong: it is
// derived, it is a snapshot, and a stale entry looks exactly like a fresh one.
// An agent told "here are 138 tubing photographs" has no way to find out that
// nine of them were moved last week -- it just hands a dead path to the next
// step, which fails somewhere far away from the cause.
const fs = require("fs");
const path = require("path");
const PATHS = require("C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI/paths.js");

const INDEX = path.join(PATHS.photos, "_media-index.json");
const TAGS = path.join(PATHS.photos, "_media-tags.json");

console.log("\n=== 1. does the index describe files that are actually there? ===");
const index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
console.log("  built " + new Date(index.builtAt).toLocaleString() + ", " + index.entries.length + " entries");

let missing = 0;
const gone = [];
for (const e of index.entries) {
  const p = path.join(PATHS.photos, e.path.replace(/\//g, path.sep));
  if (!fs.existsSync(p)) { missing++; if (gone.length < 5) gone.push(e.path); }
}
console.log("  " + (missing
  ? "!! " + missing + " indexed file(s) NO LONGER EXIST:\n      " + gone.join("\n      ")
  : "every indexed file is on disk"));

console.log("\n=== 2. is anything on disk missing FROM the index? ===");
// The other direction, which matters more: an agent cannot use what it cannot
// see, and a photograph harvested after the last index build is invisible.
const MEDIA = /\.(jpe?g|png|heic|mp4|mov|m4v|avi|webm)$/i;
const SKIP = /^(00 Inbox|05 Posted|09 Low-res and Screenshots)/i;
const onDisk = [];
(function walk(dir, rel) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r);
    else if (MEDIA.test(e.name) && !SKIP.test(r)) onDisk.push(r);
  }
})(PATHS.photos, "");
const indexed = new Set(index.entries.map((e) => e.path));
const unindexed = onDisk.filter((f) => !indexed.has(f));
console.log("  " + onDisk.length + " media files on disk, " + index.entries.length + " in the index");
console.log("  " + (unindexed.length
  ? unindexed.length + " file(s) an agent cannot currently find. Rebuild: node media-index.js\n      " +
    unindexed.slice(0, 4).join("\n      ")
  : "nothing on disk is invisible to the index"));

console.log("\n=== 3. is the index newer than the tags it was built from? ===");
try {
  const tagsAt = fs.statSync(TAGS).mtimeMs;
  const builtAt = new Date(index.builtAt).getTime();
  console.log("  tags edited " + new Date(tagsAt).toLocaleString());
  console.log("  " + (tagsAt > builtAt
    ? "!! the tag file has changed since the index was built -- searches use yesterday's tags"
    : "the index is at least as new as the tags"));
} catch { console.log("  no tag file"); }

console.log("\n=== 4. is restricted media genuinely unreachable? ===");
const restricted = index.entries.filter((e) => e.restricted);
console.log("  " + restricted.length + " entries are marked restricted");
const { execFileSync } = require("child_process");
let leaked = 0;
for (const flag of [["--activity", "glow"], ["--charter", "Reginald"], ["--charter", "Yolo"], ["--package", "party-cove"]]) {
  const out = execFileSync(process.execPath,
    [path.join(PATHS.scripts, "find-media.js"), ...flag, "--limit", "200"],
    { cwd: PATHS.scripts, encoding: "utf8", stdio: "pipe" });
  for (const r of restricted) if (out.includes(r.path)) { leaked++; console.log("    LEAKED via " + flag.join(" ") + ": " + r.path); }
}
console.log("  " + (leaked ? "!! " + leaked + " restricted path(s) reachable" : "no search returns a restricted file"));

console.log("\n=== 5. do the tag vocabularies agree with what is tagged? ===");
const { PACKAGES, LOCATIONS, ACTIVITIES } = require(path.join(PATHS.scripts, "media-tags.js"));
const used = { packages: new Set(), locations: new Set(), activities: new Set() };
for (const e of index.entries) {
  for (const k of Object.keys(used)) for (const v of e[k]) used[k].add(v);
}
let orphan = 0;
for (const [k, vocab] of [["packages", PACKAGES], ["locations", LOCATIONS], ["activities", ACTIVITIES]]) {
  for (const v of used[k]) {
    if (!vocab[v]) { orphan++; console.log("    " + k + ": \"" + v + "\" is tagged but not in the vocabulary"); }
  }
}
console.log("  " + (orphan ? orphan + " orphaned tag(s)" : "every tag in use is a real vocabulary key"));
