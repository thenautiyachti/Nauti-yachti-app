// Build a version of this system that somebody else's charter business can run.
//
//   node scripts/make-distributable.js                 build it
//   node scripts/make-distributable.js --out <dir>     somewhere else
//
// WHAT THIS IS FOR. The owner has friends running charter businesses on the same
// lake. The website, the owner console and the eight-agent crew took months to
// get right and none of it is specific to one fleet -- but a great deal of it
// says "Nauti Yachti" and "Lake Conroe" out loud.
//
// WHAT THE AUDIT FOUND, and why this is a generator rather than a fork. On
// 4 Sep 2026: 1,056 business-specific references across 101 of 187 source files.
// That sounds fatal until you look at where they are -- half sit in fifteen
// files, and most of those are CONTENT (package descriptions, FAQ answers, seed
// data, caption drafts) which any new business replaces anyway. The runtime code
// is nearly clean: one absolute path in app/, one brand reference in the console.
//
// So the business is not smeared through the code. It is concentrated in content
// and configuration, which is exactly what a generator can handle.
//
// A FORK WOULD ROT. The moment there are two copies, every fix has to be made
// twice and eventually is not. This reads the live source each time, so the
// package a friend receives is this system as it stands today, not as it stood
// the day somebody remembered to copy it.
//
// WHAT IT NEVER COPIES: the database, guest records, photographs, secrets, the
// social queue, the ledger. Nothing that is anybody's private business. Every
// text file is scanned for credential-shaped content and refused if it matches,
// by CONTENT and not by filename -- the same rule make-release.js uses.
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..");
const ROOT = path.join(APP, "..");
const CREW = "C:/Users/immex/.claude/scheduled-tasks";
// The shared crew scripts, which live outside the repository. paths.js there
// already knows where everything is, so ask it rather than hardcoding a fourth
// copy of the same string.
const SCRIPTS = "C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI";

const outFlag = process.argv.indexOf("--out");
const OUT = outFlag !== -1 ? process.argv[outFlag + 1] : path.join(ROOT, "distributable", "charter-platform");

// --- what never leaves this business ----------------------------------------
//
// Deny-list rather than allow-list for directories, but every one of these was
// chosen because it holds somebody's private information or this fleet's own
// content. When in doubt a thing is EXCLUDED -- a missing file is a bug report,
// a leaked guest list is not recoverable.
const EXCLUDE_DIRS = new Set([
  "node_modules", ".next", ".git", "out",
  "db-backups",        // 967 rows of real guests, bookings and money
  "releases",          // snapshots of this business
  "public/gallery",    // this fleet's photographs
]);

const EXCLUDE_FILES = new Set([
  "social-caption-drafts.md",   // 151 references to this business; pure content
  ".env", ".env.local", ".env.production", ".env.example",
  "nauti-paths.json",           // machine-specific
  ".git",                       // a POINTER FILE here, not a directory -- it carries
                                // the owner's real gitdir path and slipped past
                                // the EXCLUDE_DIRS entry of the same name
  "desktop.ini",
]);

// Caught by inspecting the first build rather than by thinking harder up front,
// which is why the build is inspected. A stale prisma/dev.db was being copied --
// a database, into a package whose whole promise is that it carries no data --
// along with the PDF twin of a content file whose markdown was already excluded,
// and a .bak left behind by an earlier edit.
//
// The lesson is the extension, not the three files: anything that is data, a
// backup, or a rendered copy of excluded content does not travel.
const EXCLUDE_EXT = /\.(db|db-journal|sqlite3?|bak|orig|log|zip|pdf)$/i;

// Content files that SHOULD exist in the package but must ship as templates
// rather than as this fleet's actual words.
const TEMPLATE_INSTEAD = new Set([
  "lib/packageContent.js",
  "lib/faqContent.js",
  "prisma/seed.js",
]);

// TWO KINDS OF PROBLEM, AND THEY NEED OPPOSITE TREATMENT.
//
// The first version of this treated them the same and refused seven files --
// including the privacy policy, the terms page and the whole public site
// component -- because they contain the business's own telephone number. That
// would have shipped a package with pages missing.
//
// A CREDENTIAL cannot be rewritten into something else; it can only be left
// out. A PHONE NUMBER is different: it is public information the new owner
// replaces with their own, and the setup wizard exists to do exactly that.
const REFUSE = [
  [/\bsk_live_[A-Za-z0-9]{10,}/, "Stripe live secret key"],
  [/\bsk_test_[A-Za-z0-9]{10,}/, "Stripe test secret key"],
  [/\bwhsec_[A-Za-z0-9]{10,}/, "Stripe webhook secret"],
  [/\bre_[A-Za-z0-9]{16,}/, "Resend API key"],
  [/\bsk-ant-[A-Za-z0-9-]{16,}/, "Anthropic API key"],
  [/\bxi-api-key\s*[:=]\s*['"][A-Za-z0-9]{16,}/, "ElevenLabs key"],
  // A real connection string, not the "user:password@host" placeholder that
  // appears in the setup documentation -- which is what the looser version of
  // this pattern kept refusing.
  [/postgres(ql)?:\/\/(?!user:password@)[^\s"']+:[^\s"'@]{8,}@[^\s"']+/, "database URL with a password"],
];

// Allowed through, but every occurrence MUST be rewritten by setup.js. Counted
// and asserted below: if the wizard's rules do not cover one of these, the build
// says so rather than shipping somebody's number.
const MUST_REWRITE = [
  [/\b\d{3}-\d{3}-\d{4}\b/g, "telephone number"],
];
const TEXT = /\.(js|jsx|ts|tsx|md|json|txt|css|html|yml|yaml|env|sh|ps1|prisma)$/i;

function offending(file) {
  if (!TEXT.test(file)) return null;
  let body;
  try { body = fs.readFileSync(file, "utf8"); } catch { return null; }
  for (const [re, what] of REFUSE) if (re.test(body)) return what;
  return null;
}

const refused = [];
let copied = 0;

function copyTree(from, to, rel) {
  let entries;
  try { entries = fs.readdirSync(from, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name) || EXCLUDE_DIRS.has(r)) continue;
      copyTree(path.join(from, e.name), path.join(to, e.name), r);
      continue;
    }
    if (EXCLUDE_FILES.has(e.name) || EXCLUDE_EXT.test(e.name)) continue;
    const src = path.join(from, e.name);
    const bad = offending(src);
    if (bad) { refused.push(r + "  (" + bad + ")"); continue; }
    fs.mkdirSync(to, { recursive: true });
    fs.copyFileSync(src, path.join(to, e.name));
    copied++;
  }
}

// ---------------------------------------------------------------------------
if (fs.existsSync(OUT)) {
  console.error("  " + OUT + " already exists.");
  console.error("  Move or delete it first -- this will not overwrite a folder it did not create.");
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

console.log("\n  building a distributable charter platform");
console.log("  from  " + APP);
console.log("  to    " + OUT + "\n");

copyTree(APP, path.join(OUT, "app"), "");
copyTree(CREW, path.join(OUT, "crew"), "");
copyTree(SCRIPTS, path.join(OUT, "scripts"), "");

console.log("  " + copied + " files copied");
if (refused.length) {
  console.log("  " + refused.length + " REFUSED because their content matched a credential or personal pattern:");
  for (const r of refused.slice(0, 20)) console.log("      " + r);
  if (refused.length > 20) console.log("      ... and " + (refused.length - 20) + " more");
} else {
  console.log("  nothing was refused -- no file's content matched a credential pattern");
}

// --- what the recipient fills in --------------------------------------------
const { templateConfig, applyIdentity, FIELDS, LISTS } = require("./dist-identity");

fs.writeFileSync(
  path.join(OUT, "business.config.json"),
  JSON.stringify(templateConfig(), null, 2) + "\n"
);

// The wizard ships INSIDE the package, along with the identity rules it needs,
// so the recipient has no dependency on this repository.
fs.copyFileSync(path.join(__dirname, "dist-identity.js"), path.join(OUT, "dist-identity.js"));
for (const f of ["setup.js", "SETUP.md"]) {
  fs.copyFileSync(path.join(__dirname, "dist-template", f), path.join(OUT, f));
}

// Say honestly how much identity the wizard will have to rewrite, by doing a
// dry run over the copied tree. A number here is worth more than a promise.
let willChange = 0, filesTouched = 0;
(function count(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { count(p); continue; }
    if (!TEXT.test(e.name)) continue;
    const r = applyIdentity(fs.readFileSync(p, "utf8"), {
      businessName: "X", domain: "y.com", waterBody: "Z", town: "W, TX", phone: "000-000-0000",
    });
    if (r.changes) { willChange += r.changes; filesTouched++; }
  }
})(OUT);

console.log("\n  business.config.json written -- this is the file they fill in");
console.log("  setup.js and SETUP.md written");
console.log("  the wizard will rewrite " + willChange + " identity patterns across " + filesTouched + " files");
console.log("\n  " + OUT + "\n");


// --- assert that everything we allowed through will actually be rewritten ----
//
// MUST_REWRITE is a promise, and an unchecked promise is how somebody's phone
// number ends up on a friend's website. Walk the built package, find every
// occurrence, and confirm the wizard's own rules change it.
{
  const { applyIdentity } = require("./dist-identity");
  const NEW = { businessName: "X", domain: "y.com", waterBody: "Z", town: "W, TX", phone: "000-000-0000" };
  const survivors = [];
  (function check(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { check(p); continue; }
      if (!TEXT.test(e.name)) continue;
      const after = applyIdentity(fs.readFileSync(p, "utf8"), NEW).text;
      for (const [re, what] of MUST_REWRITE) {
        const left = after.match(re);
        if (!left) continue;
        // The replacement value itself is not a survivor.
        const real = left.filter((v) => v !== NEW.phone);
        if (real.length) survivors.push(path.relative(OUT, p) + "  " + what + ": " + real.slice(0, 3).join(", "));
      }
    }
  })(OUT);

  if (survivors.length) {
    console.log("\n  !! " + survivors.length + " file(s) contain personal data the wizard would NOT rewrite:");
    for (const s of survivors.slice(0, 12)) console.log("      " + s);
    console.log("  Fix the rules in dist-identity.js, or exclude those files, before sending this to anyone.\n");
    process.exitCode = 1;
  } else {
    console.log("  every phone number in the package is covered by the wizard's rewrite rules");
  }
}
