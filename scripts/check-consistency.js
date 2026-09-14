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
  // The definition now lives ONCE, in media-guard.js, so this no longer compares
  // three copies — it checks that no copy has come back. A script that defines
  // its own FORBIDDEN has re-opened the door this closed.
  const GUARD = "media-guard.js";
  const guardSrc = read(path.join(SCRIPTS, GUARD));
  if (!guardSrc) {
    fail("media guard", GUARD + " is missing — the three readers have nothing to share");
  } else {
    const m = guardSrc.match(/const FORBIDDEN = (\/.*\/[a-z]*);/);
    if (!m) fail("media guard", GUARD + " no longer defines FORBIDDEN");
    // Load-bearing: without the word boundaries the pattern matched the guest
    // name "KuykeNDAll" and fenced off a charter with no restriction at all.
    else if (!/\\bNDA\\b/.test(m[1])) fail("media guard", GUARD + " lost the word boundaries around NDA");
    // Added 9 Sep 2026 for a "_not for use" folder, and the reason this check
    // exists at all: it was in one reader and not the other two.
    else if (!/NOT FOR \(\?:POST\|PUBLIC\|USE\)/.test(m[1])) {
      fail("media guard", GUARD + " no longer blocks NOT FOR USE");
    }
  }
  for (const f of ["harvest-stills.js", "harvest-sweep.js", "media-index.js"]) {
    const src = read(path.join(SCRIPTS, f));
    if (!src) { fail("media guard", f + " is missing"); continue; }
    if (/const FORBIDDEN = \/.*\/[a-z]*;/.test(src)) {
      fail("media guard", f + " defines its own FORBIDDEN again — it must require ./media-guard");
    } else if (!src.includes('require("./media-guard")')) {
      fail("media guard", f + " does not read the shared guard in " + GUARD);
    }
  }
}

// --- 8b. the approved -> scheduled promotion must still be wired ------------
//
// dueDrafts considers ONLY status "scheduled". Nothing promotes an approved
// draft to it except promote-approved.js, run by Siren at the top of her run.
// Lose either half and dated approved drafts stop publishing SILENTLY — which
// is exactly what happened on 12 Sep 2026: a post's Facebook copy went out and
// its Instagram and TikTok twins did not, with no error anywhere.
{
  const SCRIPT = "promote-approved.js";
  if (!read(path.join(SCRIPTS, SCRIPT))) {
    fail("publish path", SCRIPT + " is missing — dated approved drafts will never publish");
  }
  const siren = read(path.join(TASKS, "nauti-siren", "SKILL.md")) || "";
  if (!siren) {
    fail("publish path", "Siren has no brief to run the promotion from");
  } else if (!siren.includes(SCRIPT)) {
    fail("publish path", "Siren's brief no longer runs " + SCRIPT
      + " — an approved draft with a date would sit unpublished with no error");
  }
}

// --- 8c. duplicate-inquiry detection must stay wired in ---------------------
//
// Both halves of the 12 Sep 2026 double-submit fix are invisible when they stop
// working: the confirmation panel just stops appearing, and the dedupe just
// starts writing the second row again. Nothing errors, and the only symptom is
// a duplicate somebody notices days later — which is how it was found the first
// time.
//
// Checked as "the route still calls it" rather than "the file exists", because
// the file existing is not the part that failed before. The media guard drifted
// exactly this way: the module was fine and a caller had quietly stopped asking.
{
  const MODULE = "duplicateInquiry";
  const route = read(path.join(APP, "app", "api", "inquiries", "route.js")) || "";
  if (!route) {
    fail("duplicate inquiries", "the inquiries route is missing entirely");
  } else {
    if (!route.includes(MODULE)) {
      fail("duplicate inquiries", "the inquiries route no longer requires lib/" + MODULE
        + ".js — the same inquiry sent twice would write two rows again, silently");
    }
    // The lookup has to happen BEFORE the create, or it is decoration.
    const iFind = route.indexOf("findDuplicate");
    const iCreate = route.indexOf("inquiry.create");
    if (iFind >= 0 && iCreate >= 0 && iFind > iCreate) {
      fail("duplicate inquiries", "findDuplicate runs after inquiry.create — the row is"
        + " already written by then, so the check cannot prevent anything");
    }
  }
  if (!read(path.join(APP, "lib", MODULE + ".js"))) {
    fail("duplicate inquiries", "lib/" + MODULE + ".js is missing");
  }
  // The guest-facing half. Without the panel there is nothing on screen after a
  // submission, which is the REASON people send it twice.
  const site = read(path.join(APP, "components", "SiteView.js")) || "";
  if (site && !/INQUIRY RECEIVED|Inquiry received/i.test(site)) {
    fail("duplicate inquiries", "the inquiry form no longer shows a confirmation panel"
      + " — a guest gets a blank form back and no way to tell it worked");
  }
}

// --- 8d. a failed payment must still be recorded ----------------------------
//
// The webhook listened only for success until 13 Sep 2026, so a declined card
// existed nowhere but Stripe's dashboard. Sarah Griffith's $100 was declined at
// 10:47pm on 12 Sep and her inquiry went on reading "new / unpaid" -- identical
// to somebody who never opened the link, and those two need opposite replies.
//
// This checks the three parts that have to agree, because losing any one of them
// is silent: the handler, the clear-on-success, and the column the console reads.
{
  const hook = read(path.join(APP, "app", "api", "webhooks", "stripe", "route.js")) || "";
  if (!hook) {
    fail("failed payments", "the Stripe webhook route is missing");
  } else {
    if (!hook.includes("payment_intent.payment_failed")) {
      fail("failed payments", "the webhook no longer handles payment_intent.payment_failed"
        + " — a declined card would be invisible outside Stripe again");
    }
    // A success that does not clear the flag leaves a paid booking wearing a
    // decline, which is worse than not recording it: it is actively wrong.
    const successes = (hook.match(/paymentStatus: "paid"/g) || []).length;
    const clears = (hook.match(/CLEAR_FAILURE/g) || []).length - 1; // minus the definition
    if (successes > 0 && clears < successes) {
      fail("failed payments", "there are " + successes + " places that mark a payment paid but only "
        + clears + " that clear the failure — a paid booking could still show as declined");
    }
    // The origin written for a gift certificate is the one place left that could
    // put a SOURCE back into the ledger's origin column. See lib/channels.js.
    if (/origin: "Website"/.test(hook)) {
      fail("failed payments", 'the webhook writes a ledger origin of "Website", which is a'
        + " source, not a payment method — see the 13 Sep 2026 ruling in lib/channels.js");
    }
  }
  if (!read(path.join(APP, "lib", "paymentFailure.js"))) {
    fail("failed payments", "lib/paymentFailure.js is missing — nothing turns a decline code into words");
  }
  // The console half. A recorded failure nobody can see is the same bug again.
  const admin = read(path.join(APP, "components", "AdminView.js")) || "";
  if (admin && !/paymentFailedAt/.test(admin)) {
    fail("failed payments", "the console no longer shows paymentFailedAt — a declined guest"
      + " would look the same as one who never tried");
  }
  // And the schema must actually have somewhere to put it, on BOTH payable rows.
  const schema = read(path.join(APP, "prisma", "schema.prisma")) || "";
  const cols = (schema.match(/paymentFailedAt/g) || []).length;
  if (schema && cols < 2) {
    fail("failed payments", "paymentFailedAt appears on " + cols + " model(s); Inquiry and"
      + " ExternalBooking both take payments and both need it");
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
  for (const st of ["inquiry", "lapsed", "booked", "owed", "completed", "cancelled"]) {
    if (!vocab.includes('"' + st + '"')) fail("booking status", "lib/bookingStatus.js no longer defines " + st);
  }
  // The inquiry-side list was hand-kept in two places and drifted the instant a
  // sixth status appeared: the console offered "owed" and the PATCH route that
  // has to accept it did not, which is a 400 behind a dropdown that looks like
  // it works. Both must derive from the bucket map.
  for (const f of ["app/api/inquiries/[id]/route.js", "components/AdminView.js"]) {
    const src = read(path.join(APP, f)) || "";
    if (/const INQUIRY_STATUSES\s*=\s*\[/.test(src)) {
      fail("booking status", f + " has gone back to a hand-typed inquiry status list");
    }
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

    // The changelog is checked ENTRY BY ENTRY, not as one document.
    //
    // It is append-only, and every release entry legitimately carries the same
    // subheadings -- "If you are restoring this" is meant to appear once per
    // version, and did the moment a second entry was written that way. Checking
    // the whole file would train everyone to ignore this warning, which is
    // exactly how the crew protocol came to be pasted into itself unnoticed.
    //
    // Splitting on the "## vX.Y.Z" boundaries keeps the real protection: an
    // entry pasted in twice still repeats its own headings, inside its own
    // section, and still fails.
    const chunks = label === "changelog"
      ? body.split(/\n(?=## v\d)/)
      : [body];

    for (const chunk of chunks) {
      const heads = chunk.split(/\r?\n/).filter((l) => /^#{2,3} /.test(l.trim())).map((l) => l.trim());
      const counts = {};
      for (const h of heads) counts[h] = (counts[h] || 0) + 1;
      const repeated = Object.keys(counts).filter((h) => counts[h] > 1);
      if (repeated.length) {
        const where = label === "changelog"
          ? label + " (" + (heads.find((h) => /^## v/.test(h)) || "an entry") + ")"
          : label;
        fail(where, "carries " + repeated.length + " repeated heading(s), which usually means a\n" +
          "        section was pasted in twice and one copy has since drifted:\n" +
          repeated.slice(0, 5).map((h) => "          " + h.slice(0, 62) + "  (×" + counts[h] + ")").join("\n"));
      }
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

// --- 13. the manual must name the console's actual tabs ---------------------
//
// WHY THIS EXISTS. On 13 Sep 2026 the Subscriptions tab was renamed to
// "Subscriptions & bills" and the manual went on calling it Subscriptions.
// check-manual-fresh.js said "ok" the whole time, and was right to: it compares
// the PDF to the markdown, and those matched. Nothing compared the markdown to
// the console.
//
// The same blind spot had already let three tabs go undocumented — Comments,
// Messages and Photo Requests existed in Marketing for days while the manual's
// layout table listed three tabs where the console had six.
//
// THIS CANNOT CATCH EVERYTHING, and it is worth being honest about what it
// misses. The manual said "The guest gets nothing" about a declined payment,
// which stayed true for seventeen hours and then became false when the Text
// button landed. No checker reads English for truth. What CAN be checked
// mechanically is the structure — the names of the things — and a rename is by
// far the most common way this manual goes wrong, because renaming is cheap and
// remembering every place a name appears is not.
//
// Labels are not all plain strings: several carry a live count, either as a
// template literal or via tabLabel(). The leading words are what is stable
// across a render, so that is what is compared.
try {
  const adminSrc = read(path.join(APP, "components/AdminView.js")) || "";

  const stableName = (expr) => {
    let m, raw = null;
    if ((m = expr.match(/^"([^"]+)"/))) raw = m[1];
    else if ((m = expr.match(/^tabLabel\(\s*"([^"]+)"/))) raw = m[1];
    else if ((m = expr.match(/^`([^`${]*)/))) raw = m[1];
    if (raw === null) return null;
    // `Contacts (${count})` leaves a dangling bracket once the interpolation is
    // cut away. Trim the opening punctuation the count was about to sit in.
    return raw.replace(/[\s([{]+$/, "").trim() || null;
  };

  const start = adminSrc.indexOf("const TAB_GROUPS = [");
  const groups = [];
  if (start >= 0) {
    const block = adminSrc.slice(start, adminSrc.indexOf("\n  ];", start));
    const re = /id:\s*"([a-zA-Z]+)",\s*label:\s*"([^"]+)",[\s\S]*?tabs:\s*\[([\s\S]*?)\n\s{6}\],/g;
    let g;
    while ((g = re.exec(block))) {
      const tabs = [];
      for (const line of g[3].split(/\r?\n/)) {
        const t = line.match(/^\s*\{\s*id:\s*"([^"]+)",\s*label:\s*(.+?)\s*\},?\s*$/);
        if (!t) continue;
        const name = stableName(t[2]);
        if (name) tabs.push(name);
      }
      if (tabs.length) groups.push({ label: g[2], tabs });
    }
  }

  // The manual's layout table, read by group name.
  const rows = {};
  const secAt = manual.indexOf("## How the console is laid out");
  if (secAt >= 0) {
    for (const line of manual.slice(secAt).split(/\r?\n/)) {
      const m = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|\s*(.+?)\s*\|\s*$/);
      if (m) rows[m[1].trim()] = m[2].trim();
    }
  }

  // Only run if both sides parsed. A silently-empty checker that reports
  // "consistent" is worse than one that is obviously broken.
  if (!groups.length) {
    fail("manual", "could not read TAB_GROUPS from AdminView.js — the tab check did not run");
  } else if (!Object.keys(rows).length) {
    fail("manual", 'could not find the "How the console is laid out" table — the tab check did not run');
  } else {
    for (const grp of groups) {
      const row = rows[grp.label];
      if (row === undefined) {
        fail("manual", `has no row for the ${grp.label} group, which exists in the console`);
        continue;
      }
      const listed = row.split("·").map((s) => s.trim()).filter(Boolean);
      // A row is a tab list if it names several things, or one thing that IS a
      // tab. Anything else is prose describing the group — Overview is written
      // that way deliberately — and prose is not a list to be checked.
      const isList = listed.length > 1 || (listed.length === 1 && grp.tabs.includes(listed[0]));
      if (!isList) continue;
      const missing = grp.tabs.filter((t) => !listed.includes(t));
      const gone = listed.filter((l) => !grp.tabs.includes(l));
      if (missing.length) {
        fail("manual", `the ${grp.label} row omits ${missing.map((x) => `"${x}"`).join(", ")}` +
          `,\n        ${missing.length === 1 ? "a tab that exists" : "tabs that exist"} in the console`);
      }
      if (gone.length) {
        fail("manual", `the ${grp.label} row names ${gone.map((x) => `"${x}"`).join(", ")}` +
          `,\n        which the console no longer has — most likely a rename nobody carried across`);
      }
    }
  }
} catch { /* a shape change here must not take the whole checker down */ }

// --- 14. the manual must have been reviewed at the current version ----------
//
// The structural check above catches renames. Nothing can catch a sentence that
// quietly stopped being true — "The guest gets nothing" was accurate when it was
// written and false by the same evening. The only thing that catches that is a
// person reading it, and the only moment anyone reliably will is when a release
// is being cut.
//
// So this does not try to be clever. It records the version the manual was last
// read against, and says so when the code has moved past it. Clearing it is one
// line, and the point is that clearing it requires opening the manual.
//
// It is deliberately tied to the VERSION and not to file timestamps or commit
// counts: a check that fired on every edit to AdminView.js would fire several
// times a day, and a checker that cries wolf gets ignored.
try {
  const REVIEWED = path.join(APP, "owner-console-manual.reviewed");
  const pkg = JSON.parse(read(path.join(APP, "package.json")) || "{}");
  const at = (read(REVIEWED) || "").trim();
  if (!pkg.version) {
    // nothing to compare against; the version checks elsewhere will say so
  } else if (!at) {
    fail("manual", "has no review stamp — nobody has recorded reading it against any version.\n" +
      "        Read it, then: echo " + pkg.version + " > owner-console-manual.reviewed");
  } else if (at !== pkg.version) {
    fail("manual", "was last read against v" + at + "; the code is now v" + pkg.version + ".\n" +
      "        Something in it may have quietly stopped being true. Read it, then:\n" +
      "        echo " + pkg.version + " > owner-console-manual.reviewed");
  }
} catch { /* stamp unreadable; not worth failing the whole run over */ }

// --- report -----------------------------------------------------------------
if (!problems.length) {
  console.log(`  consistent — ${liveTasks.length} tasks, manual, protocol and roster all agree.`);
} else {
  for (const p of problems) console.log(`  [${p.area}]\n      ${p.what}`);
  console.log(`\n  ${problems.length} contradiction${problems.length === 1 ? "" : "s"}.`);
  process.exitCode = 1;
}
