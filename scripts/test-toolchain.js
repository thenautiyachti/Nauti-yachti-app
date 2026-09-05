// Run every read-only tool the crew is told to use, exactly as a brief tells
// them to, and report which ones actually answer.
//
// WHY NOW. All 28 crew scripts were rewritten in one pass to resolve their paths
// through paths.js instead of hardcoding them. That refactor was verified as a
// no-op by syntax-checking every file and spot-running three. Three is not
// twenty-eight, and a script that throws at 8:30am reports nothing -- the run
// simply produces no output and the agent looks quiet rather than broken.
//
// READ-ONLY ONLY. Nothing here writes to the board, publishes, or spends an API
// call that costs money. The write paths are exercised separately and
// deliberately.
const { execFileSync } = require("child_process");
const path = require("path");

const SCRIPTS = "C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI";

// Each entry is a command a brief actually contains, trimmed to its read-only
// form. `expect` is a string that must appear in the output for the tool to
// count as ANSWERING rather than merely exiting zero -- a script that prints
// nothing and succeeds is indistinguishable from one that did nothing.
const CHECKS = [
  ["paths resolve",        ["paths.js"],                              "resolved from"],
  ["board reads",          ["board.js"],                              "["],
  ["facts gather",         ["facts.js"],                              ""],
  ["crew statuses",        ["statuses.js"],                           ""],
  ["media index is built", ["find-media.js", "--coverage"],           "COVERAGE"],
  ["media search: activity", ["find-media.js", "--activity", "tubing", "--clean", "--limit", "2"], "match"],
  ["media search: package",  ["find-media.js", "--package", "birthday", "--limit", "2"], "match"],
  ["media search: charter",  ["find-media.js", "--charter", "Ashlea", "--limit", "2"], "match"],
  ["media vocabularies",   ["find-media.js", "--vocab"],              "party-cove"],
  ["due posts",            ["due-posts.js"],                          ""],
  ["draft queue",          ["drafts.js"],                             ""],
  ["owed charters",        ["owed-charters.js"],                      ""],
  ["proposed closures",    ["proposed-closures.js"],                  ""],
  ["booking audit",        ["booking-audit.js"],                      ""],
  ["review reminders",     ["review-reminder.js"],                    ""],
  ["status writing check", ["check-status-writing.js"],               ""],
  ["usage help is honest", ["log-agent-activity.js"],                 "Usage"],
  ["speak requires text",  ["speak-remote.js"],                       "Usage"],
];

const results = [];
for (const [label, argv, expect] of CHECKS) {
  const started = Date.now();
  let out = "", code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(SCRIPTS, argv[0]), ...argv.slice(1)], {
      cwd: SCRIPTS, stdio: "pipe", timeout: 120000, encoding: "utf8",
    });
  } catch (e) {
    code = e.status === undefined ? -1 : e.status;
    out = String(e.stdout || "") + String(e.stderr || "");
  }
  const ms = Date.now() - started;

  // Scripts that print a usage message exit non-zero ON PURPOSE. That is a pass
  // if the usage text is what we asked for.
  const answered = expect ? out.includes(expect) : out.trim().length > 0;
  const threw = /Error:|Cannot find module|ENOENT|is not a function|undefined is not/.test(out) && !answered;

  results.push({ label, cmd: argv.join(" "), ok: answered && !threw, code, ms, out });
}

const width = Math.max(...results.map((r) => r.label.length));
console.log("");
for (const r of results) {
  console.log("  " + (r.ok ? "ok   " : "FAIL ") + r.label.padEnd(width + 2) +
    String(r.ms + "ms").padStart(7) + "   " + r.cmd);
  if (!r.ok) {
    const first = r.out.split("\n").filter((l) => l.trim()).slice(0, 3).join("\n        ");
    console.log("        " + (first || "(no output at all)"));
  }
}
const bad = results.filter((r) => !r.ok);
console.log("\n  " + (results.length - bad.length) + " of " + results.length + " tools answer");
process.exitCode = bad.length ? 1 : 0;
