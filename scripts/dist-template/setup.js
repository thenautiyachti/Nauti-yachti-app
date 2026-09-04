// Turn this package into YOUR charter business.
//
//   1. Fill in business.config.json
//   2. node setup.js            see exactly what it would change
//   3. node setup.js --apply    change it
//
// It rewrites the previous owner's identity out of every file: business name,
// domain, water body, town, phone, and the crew's names if you renamed them.
//
// It does NOT invent your boats, your packages or your prices. Those are yours
// to write, and a website advertising vessels you do not own is worse than a
// blank one -- so the wizard stops and tells you where they go instead of
// guessing.
const fs = require("fs");
const path = require("path");
const { applyIdentity, missingFrom, FIELDS, LISTS } = require("./dist-identity");

const CONFIG = path.join(__dirname, "business.config.json");
const APPLY = process.argv.includes("--apply");
const TEXT = /\.(js|jsx|ts|tsx|md|json|txt|css|html|prisma)$/i;
const SKIP = new Set(["node_modules", ".next", ".git", "out"]);

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
} catch (e) {
  console.error("\n  Cannot read business.config.json: " + e.message + "\n");
  process.exit(1);
}

const missing = missingFrom(config);
if (missing.length) {
  console.log("\n  business.config.json is not finished. Still needed:\n");
  for (const k of missing) {
    const f = [...FIELDS, ...LISTS].find((x) => x.key === k);
    console.log("    " + k.padEnd(15) + (f ? f.q : ""));
  }
  console.log("\n  The _examples block in that file shows the shape of each answer.\n");
  process.exit(1);
}

let files = 0, changes = 0;
const sample = [];

(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!TEXT.test(e.name) || p === CONFIG) continue;
    const before = fs.readFileSync(p, "utf8");
    const r = applyIdentity(before, config);
    if (!r.changes || r.text === before) continue;
    files++;
    changes += r.changes;
    if (sample.length < 8) sample.push(path.relative(__dirname, p));
    if (APPLY) fs.writeFileSync(p, r.text);
  }
})(__dirname);

console.log("\n  " + changes + " identity patterns across " + files + " files");
for (const s of sample) console.log("      " + s);
if (files > sample.length) console.log("      ... and " + (files - sample.length) + " more files");

if (!APPLY) {
  console.log("\n  Dry run. Nothing was written. Add --apply when it looks right.\n");
  process.exit(0);
}

// The _examples block exists to show the shape of each answer, and it holds the
// previous owner's real details. Once the config is filled in it has done its
// job, and leaving it means their business name sits in your repository forever.
if (config._examples) {
  delete config._examples;
  delete config._comment;
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n");
  console.log("\n  cleared the examples from business.config.json -- they were the");
  console.log("  previous owner's details and are no longer needed");
}

// A find-and-replace across seventy files can break code -- a business name with
// an apostrophe in it lands inside a single-quoted string and ends it early. So
// check, rather than hand somebody a package that will not start.
{
  const { execFileSync } = require("child_process");
  const broken = [];
  (function verify(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { verify(p); continue; }
      if (!/\.js$/.test(e.name)) continue;
      try { execFileSync(process.execPath, ["--check", p], { stdio: "pipe" }); }
      catch { broken.push(path.relative(__dirname, p)); }
    }
  })(__dirname);
  if (broken.length) {
    console.log("\n  !! " + broken.length + " file(s) no longer parse after the rewrite:");
    for (const b of broken.slice(0, 10)) console.log("      " + b);
    console.log("\n  This is usually a quote or an apostrophe in one of your answers.");
    console.log("  Restore the package, simplify that answer, and run setup again.\n");
    process.exit(1);
  }
  console.log("  every JavaScript file still parses after the rewrite");
}

console.log("\n  Rewritten.");
console.log("\n  WHAT IS STILL YOURS TO DO. None of this is automatic, and none of it");
console.log("  should be -- it is the part that makes the business yours.\n");
console.log("    1. Your boats, packages and prices    app/prisma/seed.js");
console.log("    2. Your words on the site             app/lib/packageContent.js");
console.log("                                          app/lib/faqContent.js");
console.log("    3. Your photographs                   see the Photos library README;");
console.log("                                          tag them, do not re-file them");
console.log("    4. Your own API keys                  a .secrets file of your own.");
console.log("                                          DISASTER RECOVERY.md lists every");
console.log("                                          variable and where to get it");
console.log("    5. Your crew's schedules              crew/ holds the eight briefs and");
console.log("                                          the protocol they follow");
console.log("\n  Then check it:  node app/scripts/check-consistency.js\n");
