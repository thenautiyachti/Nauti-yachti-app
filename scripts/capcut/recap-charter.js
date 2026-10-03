// Coral's one-step CapCut recap for a single charter (added 2 Oct 2026).
//
//   node recap-charter.js "<charter folder, or a unique part of it>"
//
// Run AFTER the charter's Completed folder is curated: the recap is built from
// the stills Coral promoted there (found in their clips, held only while the
// camera stays on them), cut to a song from the owner's Music shelf.
//
// Prints ONE JSON line and exits:
//   0  {"built": "<draft name>", seconds, shots, song}   tell him it is in CapCut
//   2  {"skipped": "already built"}                       nothing to do
//   3  {"skipped": "CapCut is open"}                      try again next run
//   4  {"skipped": "too little footage"}                  say so; no recap
//   1  {"error": "..."}                                   report it
// It never opens, closes or ends CapCut, and never publishes anything.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const PY = fs.existsSync("C:/Users/immex/AppData/Local/Programs/Python/Python312/python.exe")
  ? "C:/Users/immex/AppData/Local/Programs/Python/Python312/python.exe" : "python";
const STORE = path.join(process.env.LOCALAPPDATA, "CapCut/User Data/Projects/com.lveditor.draft");
const CHARTERS = "C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos/02 Charters/_By charter";
const say = (code, obj) => { console.log(JSON.stringify(obj)); process.exit(code); };
const run = (cmd, args) => spawnSync(cmd, args, { cwd: HERE, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" }, maxBuffer: 1 << 26 });

const want = process.argv[2];
if (!want) say(1, { error: "usage: node recap-charter.js \"<charter folder>\"" });
// The crew's restricted-folder guard (Crew\_Scripts\media-guard.js), anchored:
// a bare /NDA/ matched "KuykeNDAll" and kept Sara Kuykendall's charter from ever
// getting a recap.
const RESTRICTED = /\bNDA\b|NO MEDIA|DO NOT POST|NOT FOR (?:POST|PUBLIC|USE)|\bNOT USED?\b/i;
const matches = fs.readdirSync(CHARTERS).filter((f) => f.toLowerCase().includes(want.toLowerCase()) && !RESTRICTED.test(f));
if (matches.length !== 1) say(1, { error: matches.length ? "more than one charter matches: " + matches.join(" | ") : "no charter folder matches " + want });
const folder = matches[0];

if (/CapCut\.exe/i.test(spawnSync("tasklist", ["/FI", "IMAGENAME eq CapCut.exe"], { encoding: "utf8" }).stdout || ""))
  say(3, { skipped: "CapCut is open", charter: folder });
if (!fs.existsSync(path.join(STORE, "media shelf", "draft_content.json")))
  say(1, { error: "the Music shelf project ('media shelf') is missing from CapCut" });

const date = folder.slice(0, 10), who = folder.slice(11).replace(/\s*\(.*$/, "").split(" + ")[0].trim();
const name = `${date} ${who} recap (Claude)`;
if (fs.existsSync(path.join(STORE, name))) say(2, { skipped: "already built", draft: name });

for (const [script, args] of [["read_shelf.py", []], ["locate_moments.py", [folder]], ["plan_recaps.py", [folder]]]) {
  const r = run(PY, [script, ...args]);
  if (r.status !== 0) say(1, { error: script + " failed: " + (r.stderr || r.stdout).slice(-300) });
  if (script === "plan_recaps.py" && /skip \(too little\)/.test(r.stdout)) say(4, { skipped: "too little footage", charter: folder });
}
const planFile = path.join(HERE, "plans", name.replace(/[^\w.-]+/g, "_") + ".json");
if (!fs.existsSync(planFile)) say(1, { error: "no plan written for " + name });
const b = run(process.execPath, [path.join(HERE, "build-from-plan.js"), planFile]);
if (b.status !== 0) say(1, { error: "build failed: " + (b.stderr || b.stdout).slice(-300) });
const out = JSON.parse(b.stdout.trim().split("\n").pop());
say(0, { built: out.name, seconds: out.seconds, shots: out.shots, song: out.song, lint: out.lint });
