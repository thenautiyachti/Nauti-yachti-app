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
    // A brief may MENTION an old schedule while describing why it changed --
    // "you were briefly hourly" is history, not a claim. The retired-id check
    // above already draws this distinction; without it here, writing down why a
    // schedule changed is punished as a contradiction, which teaches people to
    // delete the explanation rather than keep it.
    const hourlyClaim = [...md.matchAll(/runs? every hour|hourly/gi)].some((m) => {
      const near = md.slice(Math.max(0, m.index - 120), m.index + 60);
      return !/was|were|used to|briefly|until|no longer|previously|stopped/i.test(near);
    });
    if (!hourly && hourlyClaim) {
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

// --- 8. the NDA guard must be identical everywhere it appears ---------------
//
// Three scripts decide whether media may be published: harvest-stills.js,
// harvest-sweep.js and media-index.js. They carry the same regex on purpose. If
// one of them drifts, restricted footage becomes reachable through whichever is
// laxest, and nobody finds out until it has been posted.
//
// The word boundaries in particular are load-bearing: without them the pattern
// matched the guest name "KuykeNDAll" and fenced off a charter with no
// restriction on it at all.
{
  const guards = {};
  for (const f of ["harvest-stills.js", "harvest-sweep.js", "media-index.js"]) {
    const src = read(path.join(SCRIPTS, f));
    if (!src) { fail("media guard", f + " is missing"); continue; }
    const m = src.match(/const FORBIDDEN = (\/.*\/[a-z]*);/);
    if (!m) { fail("media guard", f + " no longer defines FORBIDDEN"); continue; }
    guards[f] = m[1];
  }
  const distinct = [...new Set(Object.values(guards))];
  if (distinct.length > 1) {
    fail("media guard", "the three scripts disagree about what may not be published:\n        " +
      Object.entries(guards).map(([f, g]) => f + "  " + g).join("\n        "));
  }
  for (const [f, g] of Object.entries(guards)) {
    if (!/\\bNDA\\b/.test(g)) fail("media guard", f + " lost the word boundaries around NDA");
  }
}

// --- 9. the two board parsers must agree ------------------------------------
//
// The app ranks the board and the crew script writes to it. If their owner-
// prefix regexes differ, an agent files at one priority and the console shows
// another -- which already happened once, when "[SHELLY . T2]" parsed in
// neither and her name printed as literal text mid-sentence.
//
// Compared as literal text, not by a regex-matching-a-regex. The first attempt
// here did the latter and reported "other" for BOTH files, so it would have
// passed however far apart they drifted -- a check that cannot fail is worse
// than no check, because it is also a claim that somebody looked.
{
  // The separator between the owner name and the tier, exactly as written in
  // both files. Extracted rather than assumed, so this fails if either stops
  // having one at all.
  const sepOf = (src) => {
    const m = (src || "").match(/\(\?:(\[[^\]]+\])\+T\(\[0-9\]\)\)\?/);
    return m ? m[1] : null;
  };
  const appSep = sepOf(read(path.join(APP, "lib/board.js")));
  const crewSep = sepOf(read(path.join(SCRIPTS, "board.js")));

  if (!appSep) fail("board parser", "lib/board.js: could not find the owner/tier separator class");
  else if (!crewSep) fail("board parser", "Jarvis-Voice-UI/board.js: could not find the owner/tier separator class");
  else if (appSep !== crewSep) {
    fail("board parser",
      "the two parsers disagree, so an agent will file at one priority and the console show another:\n" +
      "        app  " + appSep + "\n        crew " + crewSep);
  }
}

// --- 10. the priority rules must still reproduce the owner's own calls -------
//
// lib/boardPriority.js is derived entirely from fourteen decisions he made by
// hand on 4 Sep 2026. A rule set that quietly stops agreeing with them is worse
// than none, because it still looks principled. These four are the ones that
// each cost a separate bug to get right.
try {
  const { classify } = require(path.join(APP, "lib/boardPriority.js"));
  const cases = [
    ["BAREBOAT: list the Nauti Islander without a captain on Boatsetter and GetMyBoat.",
      "Boatsetter requires the renter to hold a boating license and carry insurance.", "medium",
      "an aside about insurance must not make a listing item High"],
    ["REVENUE IDEA: Seven Saturdays are open before the end of October.",
      "At the $532 average charter that is $3,726 of unsold capacity.", "low",
      "upside is not exposure -- an amount only ranks when something is wrong with it"],
    ["Mechanical failure is the single biggest cause of lost 2026 demand.",
      "6 Jun: the Nauti Lexi would not start.", "medium",
      "a past failure is not a boat down today"],
    ["TPWD Party Boat rule took effect 2026-05-01: liability insurance minimum raised to $500k.",
      "", "high", "a live insurance exposure is the one thing that IS High"],
  ];
  for (const [lead, rest, want, why] of cases) {
    const got = classify([lead, rest].join(" "), null, { lead });
    if (got.priority !== want) {
      fail("board priority", why + "\n        wanted " + want + ", got " + got.priority + " (" + got.why + ")");
    }
  }
} catch (e) {
  fail("board priority", "could not evaluate lib/boardPriority.js: " + e.message);
}

// --- 11. the status vocabulary must cover what the API accepts --------------
{
  const vocab = read(path.join(APP, "lib/bookingStatus.js")) || "";
  for (const st of ["inquiry", "lapsed", "booked", "completed", "cancelled"]) {
    if (!vocab.includes('"' + st + '"')) fail("booking status", "lib/bookingStatus.js no longer defines " + st);
  }
  // Nothing may compare the status field to a literal outside that file: that is
  // how four call sites came to use "not cancelled" to mean "a real booking",
  // one of them being the public availability calendar.
  for (const f of ["app/page.js", "app/api/partial-dates/route.js", "lib/serialize.js"]) {
    const src = read(path.join(APP, f)) || "";
    if (/status:\s*\{\s*not:\s*"cancelled"\s*\}|status !== "cancelled"/.test(src)) {
      fail("booking status", f + " is back to using 'not cancelled' as a proxy for a real booking");
    }
  }
}

// --- 11b. no document may carry the same heading twice ----------------------
//
// A bad paste on or before 5 Sep 2026 left _crew-protocol.md with sections 3f,
// 4, 5, 5b, 5c, 6 and 7 all present TWICE. Six copies were byte-identical, so
// nothing read differently and nothing failed. The seventh was not: section 7,
// "Honesty rules that override everything above", existed as one complete copy
// and one truncated one -- and the truncation had swallowed the tail of section
// 3e-iii, the --detail-file rule, which then existed nowhere else in the file.
//
// So the shared rulebook every agent reads first was internally contradictory,
// was missing a rule, and gave no sign of either. A repeated heading is the
// cheapest possible signal that a document has been pasted into twice, and it
// would have caught this the day it happened.
{
  const docs = [
    ["crew protocol", path.join(TASKS, "_crew-protocol.md")],
    ["owner manual", path.join(APP, "owner-console-manual.md")],
    ["versioning", path.join(APP, "..", "VERSIONING.md")],
    ["recovery", path.join(APP, "..", "DISASTER RECOVERY.md")],
    ["changelog", path.join(APP, "..", "CHANGELOG.md")],
  ];
  // Every crew brief too — they are edited far more often than the protocol.
  try {
    for (const d of fs.readdirSync(TASKS, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith("_")) continue;
      const brief = path.join(TASKS, d.name, "SKILL.md");
      if (fs.existsSync(brief)) docs.push([d.name + " brief", brief]);
    }
  } catch { /* no tasks directory */ }

  for (const [label, file] of docs) {
    const body = read(file);
    if (!body) continue;
    const heads = body.split(/\r?\n/).filter((l) => /^#{2,3} /.test(l.trim())).map((l) => l.trim());
    const counts = {};
    for (const h of heads) counts[h] = (counts[h] || 0) + 1;
    const repeated = Object.keys(counts).filter((h) => counts[h] > 1);
    if (repeated.length) {
      fail(label, "carries " + repeated.length + " repeated heading(s), which usually means a\n" +
        "        section was pasted in twice and one copy has since drifted:\n" +
        repeated.slice(0, 5).map((h) => "          " + h.slice(0, 62) + "  (×" + counts[h] + ")").join("\n"));
    }
  }
}

// --- 12. the recovery document must name the newest release -----------------
//
// DISASTER RECOVERY.md tells somebody which release folder to restore from. It
// was written naming v1.1 and was still naming v1.1 two releases later, which is
// the single worst place in this system for a stale fact: it is read exactly
// once, by someone having a bad day, who will follow it literally.
{
  const relDir = path.join(APP, "..", "releases");
  const doc = read(path.join(APP, "..", "DISASTER RECOVERY.md"));
  if (doc) {
    // Releases are kept as ONE compressed archive now, not as folders, so this
    // must match "v1.4.zip" as well as a bare directory. It briefly did not,
    // and therefore passed by finding nothing to check -- which is worse than
    // failing, because it also reports that somebody looked.
    let versions = [];
    try {
      versions = fs.readdirSync(relDir)
        .map((d) => (d.match(/^(v\d+\.\d+(?:\.\d+)?)(?:\.zip)?$/) || [])[1])
        .filter(Boolean)
        .sort((a, b) => {
          const pa = a.slice(1).split(".").map(Number);
          const pb = b.slice(1).split(".").map(Number);
          return (pa[0] - pb[0]) || (pa[1] - pb[1]) || ((pa[2] || 0) - (pb[2] || 0));
        });
    } catch { /* no releases directory at all */ }

    // Exactly one is the policy. More than one means a prune did not happen.
    if (versions.length > 1) {
      fail("releases", "there are " + versions.length + " releases (" + versions.join(", ") +
        ").\n        VERSIONING.md says exactly one is kept. make-release.js prunes on the next cut.");
    }
    if (!versions.length) {
      fail("releases", "there is no release at all. The crew — briefs, protocol, schedules,\n" +
        "        permissions, shared scripts — exists on this disk only until one is cut.");
    }

    // One version, spelled the same way everywhere.
    //
    // It was briefly spelled three ways at once: package.json said "1.4.0", the
    // git tag said "v1.4", and the archive said "v1.4.zip". Nothing broke, which
    // is the problem — three answers to "what version is this" and no way to
    // tell which one anything else meant.
    //
    // The spec settles the format: X.Y.Z, always three numbers.
    {
      const pkgVersion = (function () {
        try { return JSON.parse(read(path.join(APP, "package.json"))).version; } catch { return null; }
      })();
      if (pkgVersion && !/^\d+\.\d+\.\d+$/.test(pkgVersion)) {
        fail("package.json", 'version "' + pkgVersion + '" is not X.Y.Z. See VERSIONING.md.');
      }
      const rel = versions[versions.length - 1];
      if (rel && !/^v\d+\.\d+\.\d+$/.test(rel)) {
        fail("releases", 'the release is named "' + rel + '", which is not vX.Y.Z.');
      }
      if (pkgVersion && rel && rel !== "v" + pkgVersion) {
        fail("version", "package.json says " + pkgVersion + " but the release is " + rel +
          ".\n        One version, one spelling.");
      }
    }

    const latest = versions[versions.length - 1];
    if (latest && !doc.includes(latest)) {
      fail("DISASTER RECOVERY.md",
        "does not name the release that exists. It is " + latest +
        ",\n        and somebody restoring from this document would go looking for the wrong one.");
    }
  }
}

// --- report -----------------------------------------------------------------
if (!problems.length) {
  console.log(`  consistent — ${liveTasks.length} tasks, manual, protocol and roster all agree.`);
} else {
  for (const p of problems) console.log(`  [${p.area}]\n      ${p.what}`);
  console.log(`\n  ${problems.length} contradiction${problems.length === 1 ? "" : "s"}.`);
  process.exitCode = 1;
}
