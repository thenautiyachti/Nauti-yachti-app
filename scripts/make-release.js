// Freeze everything this business runs on into one restorable folder.
//
//   node scripts/make-release.js 1.0
//   node scripts/make-release.js 1.0 --notes "First commissioned launch"
//
// WHY THIS EXISTS. Git already versions the website. It does not version the
// crew -- the eight briefs, the shared protocol, the cron schedules, the
// permission rules and the shared scripts all live OUTSIDE the repository, in
// C:\Users\immex\.claude and C:\Users\immex\Documents\_MyFiles\Jarvis-Voice-UI.
// That is the part which took months to get right and the part that would be
// most painful to lose, and until now nothing captured it at all.
//
// A release folder is what a cold Claude Code session can be pointed at to
// rebuild this system from nothing.
//
// WHAT IS DELIBERATELY NOT IN IT:
//
//   * Secrets. .env, the store at C:\Users\immex\.secrets, and any file whose
//     contents look like a key. The manifest lists which variables are REQUIRED
//     so a restore knows what to go and fetch, and never what they contain.
//   * node_modules and .next. Both rebuild from package-lock.json.
//   * Guest data. The database backup is taken separately by backup-db.js and
//     referenced by name here, not copied in. It holds real people's phone
//     numbers and email addresses, and a folder meant to be copied around is
//     the wrong home for it.
//
// The last point is the one that matters most, because the distributable
// version for other charter operators is derived from this folder by
// subtraction. Anything personal that gets in here gets in there too.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const APP = path.join(__dirname, "..");
const LLC = path.resolve(APP, "..");
const TASKS = "C:/Users/immex/.claude/scheduled-tasks";
const SHARED = "C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI";
const SETTINGS = "C:/Users/immex/.claude/settings.json";

const version = (process.argv[2] || "").replace(/^v/, "");
if (!/^\d+\.\d+(\.\d+)?$/.test(version)) {
  console.error("Usage: node scripts/make-release.js <version>   e.g. 1.0");
  process.exit(1);
}
const notesFlag = process.argv.indexOf("--notes");
const notes = notesFlag > 0 ? process.argv[notesFlag + 1] || "" : "";

const OUT = path.join(LLC, "releases", "v" + version);
if (fs.existsSync(OUT)) {
  console.error("  v" + version + " already exists at " + OUT);
  console.error("  A release is a fixed point. Pick a new version rather than overwriting one.");
  process.exit(1);
}

// --- anything that looks like a credential must not leave this machine -------
// Checked on content, not on filename, because the filename is the thing most
// likely to be wrong. A release that leaks a live Stripe key is worse than no
// release, and this is the check that makes "no secrets" a fact rather than an
// intention.
const SECRET_PATTERNS = [
  [/\bsk_live_[A-Za-z0-9]{10,}/, "Stripe live secret key"],
  [/\bsk_test_[A-Za-z0-9]{10,}/, "Stripe test secret key"],
  [/\bwhsec_[A-Za-z0-9]{10,}/, "Stripe webhook secret"],
  [/\bre_[A-Za-z0-9]{16,}/, "Resend API key"],
  [/\bsk-ant-[A-Za-z0-9-]{16,}/, "Anthropic API key"],
  [/postgres(ql)?:\/\/[^\s"']*:[^\s"'@]+@/, "database URL with a password"],
  [/\bxi-api-key\s*[:=]\s*['"][A-Za-z0-9]{16,}/, "ElevenLabs key"],
];

const TEXT = /\.(js|jsx|ts|tsx|md|json|txt|css|html|yml|yaml|env|sh|ps1|prisma)$/i;

function scan(file) {
  if (!TEXT.test(file)) return null;
  let body;
  try { body = fs.readFileSync(file, "utf8"); } catch { return null; }
  for (const [re, what] of SECRET_PATTERNS) if (re.test(body)) return what;
  return null;
}

const SKIP = new Set(["node_modules", ".next", ".git", "releases", "out", "coverage", ".vercel"]);
const findings = [];
let copied = 0;

function copyTree(from, to, label) {
  if (!fs.existsSync(from)) return;
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    const base = path.basename(from);
    if (SKIP.has(base)) return;
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) copyTree(path.join(from, entry), path.join(to, entry), label);
    return;
  }
  if (/^\.env/.test(path.basename(from))) return; // never, under any name
  const hit = scan(from);
  if (hit) { findings.push(hit + " in " + from); return; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
}

const git = (cmd) => { try { return execSync("git " + cmd, { cwd: APP }).toString().trim(); } catch { return null; } };

console.log("  building v" + version + "\n");

// --- 1. the crew ------------------------------------------------------------
copyTree(TASKS, path.join(OUT, "crew"), "crew");
console.log("  crew briefs and protocol");

// --- 2. the shared scripts every agent runs ---------------------------------
fs.mkdirSync(path.join(OUT, "shared-scripts"), { recursive: true });
for (const f of fs.readdirSync(SHARED)) {
  if (!/\.js$/.test(f)) continue;
  copyTree(path.join(SHARED, f), path.join(OUT, "shared-scripts", f), "shared");
}
console.log("  shared scripts");

// --- 3. permission rules, which are hard-won and easy to forget -------------
try {
  const s = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  fs.writeFileSync(
    path.join(OUT, "claude-permissions.json"),
    JSON.stringify({ permissions: s.permissions || {} }, null, 2)
  );
  console.log("  permission rules");
} catch (e) {
  console.log("  permission rules SKIPPED: " + e.message);
}

// --- 4. the schedule table --------------------------------------------------
// Written by hand from lib/crew.js rather than read from the scheduler, because
// the scheduler is only reachable through an MCP tool and a restore needs this
// to be a plain file it can read.
const crewSrc = fs.readFileSync(path.join(APP, "lib/crew.js"), "utf8");
const roster = [...crewSrc.matchAll(/name:\s*"(Nauti [A-Za-z]+)"[\s\S]{0,900}?taskId:\s*"([^"]+)"[\s\S]{0,400}?schedule:\s*"([^"]+)"/g)]
  .map(([, name, taskId, schedule]) => ({ name, taskId, schedule }));
fs.writeFileSync(path.join(OUT, "schedules.json"), JSON.stringify(roster, null, 2));
console.log("  schedule table (" + roster.length + " agents)");

// --- 5. the manual, and the database shape ---------------------------------
copyTree(path.join(APP, "owner-console-manual.md"), path.join(OUT, "owner-console-manual.md"), "manual");
copyTree(path.join(APP, "prisma/schema.prisma"), path.join(OUT, "db-schema.prisma"), "schema");
console.log("  manual and database schema");

// --- 6. the manifest --------------------------------------------------------
const backups = (() => {
  try {
    return fs.readdirSync("C:/Users/immex/backups").filter((d) => d.startsWith("nauti-")).sort().pop() || null;
  } catch { return null; }
})();

const required = (() => {
  try {
    const r = fs.readFileSync(path.join(APP, "app/api/admin/env-check/route.js"), "utf8");
    return [...r.matchAll(/\["([A-Z0-9_]+)",\s*"/g)].map((m) => m[1]);
  } catch { return []; }
})();

const manifest = {
  version: "v" + version,
  createdAt: new Date().toISOString(),
  notes,
  app: {
    repo: git("remote get-url origin"),
    commit: git("rev-parse HEAD"),
    branch: git("rev-parse --abbrev-ref HEAD"),
    tag: "v" + version,
    dirty: (git("status --porcelain") || "").length > 0,
  },
  crew: roster,
  // NAMES ONLY. What has to exist for a restore to work, never what is in them.
  requiredEnvVars: required,
  secretsLiveAt: "C:/Users/immex/.secrets/nauti-yachti.env  (NOT in this folder, by design)",
  databaseBackup: backups
    ? { folder: "C:/Users/immex/backups/" + backups, note: "Holds real guest contact details. Not copied here, and must never go into a distributable clone." }
    : null,
  filesCopied: copied,
  secretsRefused: findings,
};
fs.writeFileSync(path.join(OUT, "MANIFEST.json"), JSON.stringify(manifest, null, 2));

// --- report -----------------------------------------------------------------
console.log("\n  " + copied + " files, " + roster.length + " agents, " + required.length + " required variables named");
if (findings.length) {
  console.log("\n  REFUSED to copy " + findings.length + " file(s) containing what look like live credentials:");
  for (const f of findings) console.log("    " + f);
  console.log("  They are excluded. Check whether any of them should be excluded at source too.");
} else {
  console.log("  no file containing a credential pattern was copied.");
}
console.log("\n  " + OUT);
console.log("  Now tag the code:  git tag -a v" + version + " -m \"...\"  &&  git push origin v" + version);

// --- compress, prune, and record --------------------------------------------
//
// THE POLICY, from VERSIONING.md: exactly ONE release folder is kept, as a zip,
// and it is the last version verified working. Everything older goes.
//
// Four releases accumulated in a single afternoon before this existed, at 2.4MB
// and climbing, none of them meaningfully different from the next. The value of
// a backup is not how many there are -- it is knowing which one was good.
//
// The GIT TAGS are untouched and always will be. They cost nothing, they live on
// GitHub, and they are the real history of the code. This prunes only the
// release folders, which hold the part git does not version: the crew.
{
  const { execFileSync } = require("child_process");
  const RELEASES = path.dirname(OUT);

  // Compress with PowerShell, which is present on every Windows box. Node has
  // no zip built in and pulling a dependency in for one call would put this
  // script at the mercy of an install that a restore might not have.
  const zip = OUT + ".zip";
  let compressed = false;
  try {
    execFileSync("powershell", [
      "-NoProfile", "-Command",
      "Compress-Archive -Path '" + OUT.replace(/'/g, "''") + "\*' -DestinationPath '" +
        zip.replace(/'/g, "''") + "' -Force",
    ], { stdio: "pipe" });
    compressed = fs.existsSync(zip);
  } catch (e) {
    console.log("\n  could not compress: " + String(e.message).split("\n")[0]);
    console.log("  the folder is still there and is still a valid release.");
  }

  if (compressed) {
    const before = (function size(d) {
      let t = 0;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        t += e.isDirectory() ? size(p) : fs.statSync(p).size;
      }
      return t;
    })(OUT);
    const after = fs.statSync(zip).size;
    console.log("\n  compressed to " + path.basename(zip) +
      "  (" + Math.round(before / 1024) + "KB -> " + Math.round(after / 1024) + "KB)");

    // The uncompressed copy of THIS release goes too -- the zip is the backup.
    fs.rmSync(OUT, { recursive: true, force: true });
  }

  // Everything older than this release.
  const keep = new Set([path.basename(zip), path.basename(OUT)]);
  const removed = [];
  for (const e of fs.readdirSync(RELEASES, { withFileTypes: true })) {
    if (keep.has(e.name) || e.name === "desktop.ini") continue;
    if (!/^v\d+\.\d+/.test(e.name)) continue;
    const p = path.join(RELEASES, e.name);
    try {
      fs.rmSync(p, { recursive: true, force: true });
      removed.push(e.name);
    } catch (err) {
      console.log("  could not remove " + e.name + ": " + String(err.message).split("\n")[0]);
    }
  }
  if (removed.length) {
    console.log("  removed " + removed.length + " older release(s): " + removed.join(", "));
    console.log("  their git tags are untouched -- the code for each is still on GitHub.");
  }

  // The changelog entry. A stub, not a fabrication: the notes flag carries what
  // the owner actually said changed, and the rest is for a person to finish.
  const CHANGELOG = path.join(RELEASES, "..", "CHANGELOG.md");
  try {
    const existing = fs.readFileSync(CHANGELOG, "utf8");
    if (!existing.includes("## v" + version + " ")) {
      const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const entry = "## v" + version + " — " + today + " — SIZE?\n\n" +
        "**" + (notes || "TODO: one sentence you would say out loud.") + "**\n\n" +
        "- TODO: what changed, and what it means if you restore this.\n\n---\n\n";
      const marker = "\n---\n\n";
      const at = existing.indexOf(marker);
      fs.writeFileSync(CHANGELOG,
        at === -1 ? existing + "\n" + entry
                  : existing.slice(0, at + marker.length) + entry + existing.slice(at + marker.length));
      console.log("  CHANGELOG.md: stub written for v" + version + " -- finish it before you move on.");
      console.log("  Mark it SMALL, MODERATE or LARGE. See VERSIONING.md.");
    }
  } catch {
    console.log("  no CHANGELOG.md found; skipped the entry.");
  }
}
