// A partner's own copy of a shared charter's recap.
//
//   node partner-recap.js "<charter folder name>"
//
// OWNER, 10 Oct 2026, of Robert Snow's recap (a shared charter on YOLO Lake
// Conroe's boat): "I like Roberts video too, can u do the same video but one for
// yololakeconroe too?" Same shots, same song, same length as our recap; the
// opening title and the end card are theirs instead of ours, so they can post
// it on their own account.
//
// Reads the charter's partner from Photos/_media-tags.json ("partner": {name,
// site}), takes the newest recap plan for that charter, writes
// "<date> <who> recap for <partner> (Claude)" and builds it in CapCut. Coral
// then exports and finishes it like any recap, but files it in
// "<charter folder>\For <partner>\" and NEVER drafts or posts it: the owner
// sends it to the partner himself.
//
// Prints one JSON line: {"built": name, plan, project} or {"error": ...}.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const HERE = __dirname;
const TAGS = "C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos/_media-tags.json";
const say = (code, o) => { console.log(JSON.stringify(o)); process.exit(code); };

const folder = process.argv[2];
if (!folder) say(1, { error: 'usage: node partner-recap.js "<charter folder name>"' });
let partner;
try { partner = (JSON.parse(fs.readFileSync(TAGS, "utf8")).charters[folder] || {}).partner; } catch {}
if (!partner || !partner.name) say(1, { error: "no partner on this charter's _media-tags.json entry" });

const date = folder.slice(0, 10);
const who = folder.slice(11).replace(/\s*\(.*$/, "").split(" + ")[0].trim();
const prefix = (date + " " + who + " recap").replace(/[^\w.-]+/g, "_");
const plans = fs.readdirSync(path.join(HERE, "plans"))
  .filter((f) => f.startsWith(prefix) && !/for_/i.test(f))
  .map((f) => path.join(HERE, "plans", f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
if (!plans.length) say(1, { error: "no recap plan for " + folder + "; build the recap first" });

const plan = JSON.parse(fs.readFileSync(plans[0], "utf8"));
const site = partner.site || "";
const project = `${date} ${who} recap for ${partner.name}`;
plan.name = project + " (Claude)";
plan.hook = `Day on the water with ${partner.name}`;
plan.endText = site ? `Book your day\n${site}` : `Book with ${partner.name}`;
const out = path.join(HERE, "plans", plan.name.replace(/[^\w.-]+/g, "_") + ".json");
fs.writeFileSync(out, JSON.stringify(plan, null, 1), "utf8");

try {
  execFileSync(process.execPath, [path.join(HERE, "build-from-plan.js"), out], { stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  say(1, { error: "build failed: " + String((e.stderr || e.message || "")).slice(-300), plan: out });
}
say(0, { built: plan.name, plan: out, project, from: path.basename(plans[0]),
  fileAs: `${folder}\\For ${partner.name}\\${date}_${who.replace(/\s+/g, "_")}_recap_for_${partner.name.replace(/\s+/g, "_")}_9x16.mp4` });
