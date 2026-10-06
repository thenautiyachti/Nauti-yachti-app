// Coral's theme compilations, one step (added 3 Oct 2026).
//
//   node theme-compilations.js          build every theme whose trips changed
//   node theme-compilations.js --all    rebuild every theme (only when he asks)
//   node theme-compilations.js swim-stop   rebuild one theme (its last song is avoided)
//   node theme-compilations.js --pick   one theme at random, tubing weighted x3, a fresh shuffled cut
//   node theme-compilations.js --rebuild party-cove the-dam
//                                       replace those themes' cuts: owner, 5 Oct 2026, "a cut
//                                       being replaced does not count", so their earlier
//                                       drafts' clips and today's songs are free again; clips
//                                       within this run still never repeat
//
// One CapCut draft per theme, "Party Cove compilation 2026-10-03 (Claude)", cut
// from every charter carrying that tag and then his outings, to a song from his
// Music shelf. The rules are in plan_themes.py. Owner, 3 Oct 2026: "a Party Cove
// collaboration of all charters we've had that have gone to Party Cove, pulling
// the best moments of each one of them ... This logic should follow for every
// theme that we have as well." Coral exports each draft (export-from-capcut in
// her brief, since 5 Oct 2026), fills its bars with blur-bars.js and files it in
// Photos\02 Charters\_Compilations; it goes through the queue like anything else.
//
// Prints ONE JSON line and exits:
//   0  {"built": [{theme, draft, plan, seconds, shots, trips, song}], "unchanged", "thin"}
//      plan is the plan file the draft was built from: blur-bars.js --plan reads it.
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
// --pick: Coral's daily random compilation. Owner, 5 Oct 2026: "They should be
// created at random with a little more focus on tubing/wakeboarding since that
// is our main seller." One theme, drawn by weight, planned with --shuffle so it
// is a fresh cut even when its trips have not changed. A thin theme is set aside
// and another drawn. Keep SLUGS in step with THEMES in plan_themes.py.
const SLUGS = ["tubing-wakeboarding", "party-cove", "the-dam", "the-island", "swim-stop",
  "birthday", "bachelorette", "boatz-and-glowz", "night-cruise", "cruising", "corporate"];
const WEIGHT = { "tubing-wakeboarding": 3 };
const picking = process.argv.includes("--pick");
let out = null;
if (picking) {
  let pool = SLUGS.slice();
  const thin = [];
  while (pool.length && !out) {
    let r = Math.random() * pool.reduce((n, s) => n + (WEIGHT[s] || 1), 0), slug = pool[pool.length - 1];
    for (const s of pool) { r -= WEIGHT[s] || 1; if (r < 0) { slug = s; break; } }
    const pl = run(PY, ["plan_themes.py", slug, "--shuffle"]);
    const o = pl.status === 0 ? lastJson(pl.stdout) : null;
    if (!o) say(1, { error: "plan_themes.py failed: " + (pl.stderr || pl.stdout).slice(-300) });
    if (o.plans.length) out = { ...o, thin };
    else { thin.push(...o.thin); pool = pool.filter((s) => s !== slug); }
  }
  if (!out) say(2, { skipped: "every theme is thin", thin });
} else {
  // Theme slugs on the command line ("swim-stop") rebuild just those, as when he
  // asks for one theme again with a different song.
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const flags = ["--all", "--rebuild"].filter((f) => process.argv.includes(f));
  const planned = run(PY, ["plan_themes.py"].concat(flags, only));
  out = planned.status === 0 ? lastJson(planned.stdout) : null;
  if (!out) say(1, { error: "plan_themes.py failed: " + (planned.stderr || planned.stdout).slice(-300) });
  if (!out.plans.length) say(2, { skipped: "nothing changed", unchanged: out.unchanged, thin: out.thin });
}

let state = {};
try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { /* first run */ }
// A theme whose cut the owner approved is LOCKED ("locked": true in
// themes-built.json): the change-driven run never rebuilds it; only naming its
// slug does, and the daily --pick still makes fresh cuts of it. Owner, 5 Oct
// 2026, on Boatz & Glowz: "looks good". Without this, the next plain run would
// have rebuilt the cut he had just approved.
if (!picking) {
  const named = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const locked = out.plans.filter((p) => (state[p.theme] || {}).locked && !named.includes(p.theme)).map((p) => p.theme);
  out.plans = out.plans.filter((p) => !locked.includes(p.theme));
  out.locked = locked;
  if (!out.plans.length) say(2, { skipped: "nothing changed", unchanged: out.unchanged, thin: out.thin, locked });
}
const built = [], failed = [];
for (const p of out.plans) {
  const plan = JSON.parse(fs.readFileSync(p.file, "utf8"));
  const record = () => {
    // A shuffled pick has a random signature; keep the last real one, or every
    // ordinary run afterwards would see the theme as changed and rebuild it.
    const sig = picking ? (state[p.theme] || {}).signature : plan.signature;
    // clips: what this draft used, so other themes keep off them for a week
    // (owner, 5 Oct 2026, question 12; plan_themes.recent_clips reads it).
    const clips = [...new Set(plan.shots.map((s) => path.basename(s.file)))];
    state[p.theme] = { charters: plan.charters, signature: sig, song: String(plan.song.name).split("\uff08")[0].trim(), draft: plan.name, built: new Date().toISOString().slice(0, 10), clips };
    fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
  };
  // A second build the same day (its shots changed since the first): never
  // touch the first, which he may have opened and changed. Number the new one,
  // "Party Cove compilation 2026-10-03 v2 (Claude)".
  // plan_themes.py numbers it already; this is the fallback. The renamed plan
  // goes to its own file, so the first build's plan is kept.
  if (fs.existsSync(path.join(STORE, plan.name))) {
    let n = 2, name;
    do { name = plan.name.replace(/ \(Claude\)$/, ` v${n++} (Claude)`); } while (fs.existsSync(path.join(STORE, name)));
    plan.name = name;
    p.file = path.join(path.dirname(p.file), name.replace(/[^\w.-]+/g, "_") + ".json");
    fs.writeFileSync(p.file, JSON.stringify(plan, null, 1));
  }
  const b = run(process.execPath, [path.join(HERE, "build-from-plan.js"), p.file]);
  const r = b.status === 0 ? lastJson(b.stdout) : null;
  if (!r) { failed.push({ theme: p.theme, error: (b.stderr || b.stdout).slice(-200) }); continue; }
  record();
  built.push({ theme: p.theme, draft: r.name, plan: p.file, seconds: r.seconds, shots: r.shots, trips: p.charters, song: r.song, lint: r.lint });
}
if (failed.length && !built.length) say(1, { error: "every build failed", failed });
say(0, { built, failed, unchanged: out.unchanged, thin: out.thin });
