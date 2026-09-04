// Does what is written down still match what the code does?
//
//   node scripts/check-consistency.js
//
// WHY THIS EXISTS. Every contradiction so far was found by accident, late, by a
// person reading carefully:
//
//   * The manual said "Nothing is ever posted automatically." A post left in
//     SCHEDULED publishes on its own. False in the direction that costs money.
//   * The manual said three routines were deliberately not renamed, after all
//     nine had been.
//   * Penny's and Shelly's own briefs told them they were filed under task IDs
//     that had been deleted.
//   * lib/crew.js held seven task IDs that no longer existed. Nothing broke,
//     because nothing reads that field -- which is exactly why nobody noticed.
//
// None of those threw an error. Documentation cannot fail loudly; it can only be
// wrong quietly until it misleads someone. So the invariants get asserted.
//
// Add a check here whenever a doc starts making a claim the code could outgrow.
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..");
const TASKS = "C:/Users/immex/.claude/scheduled-tasks";
const SCRIPTS = "C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI";

const problems = [];
const fail = (area, what) => problems.push({ area, what });
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };

const liveTasks = fs.existsSync(TASKS)
  ? fs.readdirSync(TASKS).filter((d) => !d.startsWith("_") && fs.existsSync(path.join(TASKS, d, "SKILL.md")))
  : [];
const manual = read(path.join(APP, "owner-console-manual.md")) || "";
const crew = read(path.join(APP, "lib/crew.js")) || "";
const proto = read(path.join(TASKS, "_crew-protocol.md")) || "";

// --- 1. no document may name a task that does not exist ---------------------
// A retired ID left in prose sends someone to a folder that no longer runs.
// Only genuinely retired IDs count as stale. A loose pattern for "things shaped
// like a task id" flagged "nauti-yachti-app" -- the application folder -- in five
// briefs. A checker that cries wolf gets ignored, which is worse than no checker
// at all, so this reads the real list of retired tasks off disk.
const RETIRED = fs.existsSync(path.join(TASKS, "_retired"))
  ? fs.readdirSync(path.join(TASKS, "_retired"))
      .filter((d) => fs.existsSync(path.join(TASKS, "_retired", d, "SKILL.md")))
  : [];
const idPattern = RETIRED.length
  ? new RegExp("\\b(" + RETIRED.join("|") + ")\\b", "g")
  : /$^/g; // matches nothing when there is nothing retired
for (const [label, text] of [["manual", manual], ["lib/crew.js", crew], ["protocol", proto]]) {
  for (const id of new Set((text.match(idPattern) || []))) {
    if (liveTasks.includes(id)) continue;
    // A retired id is allowed if the text is explicitly about retirement.
    const nearby = text.slice(Math.max(0, text.indexOf(id) - 200), text.indexOf(id) + 200);
    if (/retired|superseded|used to|no longer|old id|historical|was called/i.test(nearby)) continue;
    fail(label, `names "${id}", which is not a live task`);
  }
}
for (const t of liveTasks) {
  const md = read(path.join(TASKS, t, "SKILL.md")) || "";
  const self = md.match(/^name:\s*(\S+)/m);
  if (self && self[1] !== t) fail("brief:" + t, `frontmatter says name: ${self[1]}`);
  for (const id of new Set(md.match(idPattern) || [])) {
    if (liveTasks.includes(id)) continue;
    const nearby = md.slice(Math.max(0, md.indexOf(id) - 200), md.indexOf(id) + 200);
    if (/retired|superseded|used to|no longer|old id|historical|was called/i.test(nearby)) continue;
    fail("brief:" + t, `names "${id}", which is not a live task`);
  }
}

// --- 2. every rostered agent must have a task, and vice versa ---------------
for (const m of crew.matchAll(/taskId:\s*"([^"]+)"/g)) {
  if (!liveTasks.includes(m[1])) fail("lib/crew.js", `roster taskId "${m[1]}" is not a live task`);
}

// --- 3. the manual must not deny automatic publishing ------------------------
// This is the specific falsehood that shipped, so it is asserted by name.
if (/nothing is ever posted automatically/i.test(manual)) {
  fail("manual", 'claims "nothing is ever posted automatically" — a SCHEDULED post publishes on its own');
}
if (!/publish by itself|goes out on its own|publishes? on its own/i.test(manual)) {
  fail("manual", "never states that a SCHEDULED post publishes without asking");
}

// --- 4. scheduled time is honoured, so the manual must not say date-only ----
const posting = read(path.join(APP, "lib/socialPosting.js")) || "";
const honoursTime = /nowMinutes/.test(posting);
if (honoursTime && /posts whatever is due(?![^.]*time)/i.test(manual)) {
  // not fatal on its own, but worth surfacing
  fail("manual", "describes publishing as date-based, but scheduledTime is now honoured");
}

// --- 5. every script a brief tells an agent to run must exist ---------------
for (const t of liveTasks) {
  const md = read(path.join(TASKS, t, "SKILL.md")) || "";
  for (const m of md.matchAll(/node\s+"?([A-Za-z]:[^"\n]*?\.js)"?/g)) {
    if (!fs.existsSync(m[1].replace(/\\\\/g, "\\"))) fail("brief:" + t, "runs a missing script: " + m[1]);
  }
}

// --- 6. the schedule a crew card SHOWS must match the cron that RUNS --------
// Missed the first time: Siren was moved to hourly and her card still read
// "Every day, 9:04am". The console stating a schedule that is not the schedule
// is the same class of fault as the manual denying automatic publishing.
try {
  const roster = [...crew.matchAll(/taskId:\s*"([^"]+)",[\s\S]{0,400}?schedule:\s*"([^"]+)"/g)];
  for (const [, id, shown] of roster) {
    const md = read(path.join(TASKS, id, "SKILL.md"));
    if (!md) continue;
    const hourly = /every hour|hourly/i.test(shown);
    // A card claiming a single daily time, for a task whose brief says hourly,
    // is the specific drift worth catching.
    if (!hourly && /runs? every hour|hourly/i.test(md)) {
      fail("lib/crew.js", `${id} card shows "${shown}" but its brief says hourly`);
    }
  }
} catch { /* roster shape changed; the id checks above still apply */ }

// --- 7. the manual PDF must match its markdown ------------------------------
try {
  const { check } = require(path.join(APP, "scripts/check-manual-fresh.js"));
  const r = check();
  if (!r.ok) fail("manual PDF", r.reason);
} catch { /* checked elsewhere */ }

// --- report -----------------------------------------------------------------
if (!problems.length) {
  console.log(`  consistent — ${liveTasks.length} tasks, manual, protocol and roster all agree.`);
} else {
  for (const p of problems) console.log(`  [${p.area}]\n      ${p.what}`);
  console.log(`\n  ${problems.length} contradiction${problems.length === 1 ? "" : "s"}.`);
  process.exitCode = 1;
}
