// Coral's theme compilations, one step (added 3 Oct 2026).
//
//   node theme-compilations.js          build every theme whose trips changed
//   node theme-compilations.js --all    rebuild every theme (only when he asks)
//
// One CapCut draft per theme, "Party Cove compilation 2026-10-03 (Claude)", cut
// from every charter carrying that tag and then his outings, to a song from his
// Music shelf. The rules are in plan_themes.py. Owner, 3 Oct 2026: "a Party Cove
// collaboration of all charters we've had that have gone to Party Cove, pulling
// the best moments of each one of them ... This logic should follow for every
// theme that we have as well." He exports each draft into
// Photos\02 Charters\_Compilations; a draft is not a post until he has, and it
// goes through the queue like anything else.
//
// Prints ONE JSON line and exits:
//   0  {"built": [{theme, draft, seconds, shots, trips, song}], "unchanged", "thin"}
//   2  {"skipped": "nothing changed", "unchanged", "thin"}
//   3  {"skipped": "CapCut is open"}            the next run tries again
//   1  {"error": "..."}                          report it
// It never opens, closes or ends CapCut, never overwrites a draft (each build is
// dated), and never publishes anything. A theme is recorded in themes-built.json
// only after its draft is built, so a failed build is retried next run.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const PY = fs.existsSync("C:/Users/immex/AppData/Local/Programs/Python/Python312/python.exe")
  ? "C:/Users/immex/AppData/Local/Programs/Python/Python312/python.exe" : "python";
const STORE = path.join(process.env.LOCALAPPDATA, "CapCut/User Data/Projects/com.lveditor.draft");
const STATE = path.join(HERE, "themes-built.json");
const say = (code, obj) => { console.log(JSON.stringify(obj)); process.exit(code); };
const run = (cmd, args) => spawnSync(cmd, args, { cwd: HERE, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" }, maxBuffer: 1 << 26 });
const lastJson = (text) => { try { return JSON.parse(String(text || "").trim().split("\n").pop()); } catch { return null; } };

if (/CapCut\.exe/i.test(spawnSync("tasklist", ["/FI", "IMAGENAME eq CapCut.exe"], { encoding: "utf8" }).stdout || ""))
  say(3, { skipped: "CapCut is open" });
if (!fs.existsSync(path.join(STORE, "media shelf", "draft_content.json")))
  say(1, { error: "the Music shelf project ('media shelf') is missing from CapCut" });

const shelf = run(PY, ["read_shelf.py"]);
if (shelf.status !== 0) say(1, { error: "read_shelf.py failed: " + (shelf.stderr || shelf.stdout).slice(-300) });
const planned = run(PY, ["plan_themes.py"].concat(process.argv.includes("--all") ? ["--all"] : []));
const out = planned.status === 0 ? lastJson(planned.stdout) : null;
if (!out) say(1, { error: "plan_themes.py failed: " + (planned.stderr || planned.stdout).slice(-300) });
if (!out.plans.length) say(2, { skipped: "nothing changed", unchanged: out.unchanged, thin: out.thin });

let state = {};
try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { /* first run */ }
const built = [], failed = [];
for (const p of out.plans) {
  const plan = JSON.parse(fs.readFileSync(p.file, "utf8"));
  const record = () => {
    state[p.theme] = { charters: plan.charters, song: String(plan.song.name).split("\uff08")[0].trim(), draft: plan.name, built: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
  };
  // Already built today under this name (a second run the same day): keep his
  // copy, which he may have opened and changed, and just record it.
  if (fs.existsSync(path.join(STORE, plan.name))) { record(); continue; }
  const b = run(process.execPath, [path.join(HERE, "build-from-plan.js"), p.file]);
  const r = b.status === 0 ? lastJson(b.stdout) : null;
  if (!r) { failed.push({ theme: p.theme, error: (b.stderr || b.stdout).slice(-200) }); continue; }
  record();
  built.push({ theme: p.theme, draft: r.name, seconds: r.seconds, shots: r.shots, trips: p.charters, song: r.song, lint: r.lint });
}
if (failed.length && !built.length) say(1, { error: "every build failed", failed });
say(0, { built, failed, unchanged: out.unchanged, thin: out.thin });
