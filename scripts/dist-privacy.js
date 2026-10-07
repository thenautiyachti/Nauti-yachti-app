// Guest privacy for make-distributable.js: find every real person's name, email
// and phone in the database, scrub them out of the built package, and refuse the
// build if any full name survives.
//
// WHY THIS EXISTS. On 7 Oct 2026 the package was about to be put in
// C:\Users\Public\Documents, readable by every Windows login on the PC (one per
// customer). A scan of the output against the guest list found real guest names
// in dozens of files: code comments that explain a bug by the booking it
// happened to, test fixtures copied from real rows, the CapCut "moments" plans
// (a rider list per clip), and the crew's facts cache. The deny-lists only ever
// looked at filenames and credential shapes. A name is neither.
//
// So the guest list itself is the test. It is read from the live database (read
// only), held in memory, and never written anywhere.
//
// WHAT IT DOES TO THE PACKAGE
//   - every full name                        -> "Guest"
//   - every distinctive first or last name   -> "Guest"
//   - every guest email                      -> guest@example.com
//   - every guest phone                      -> left to the wizard's phone rule,
//                                               which already rewrites them all
//   - this business's social account ids     -> placeholders, so a new owner's
//                                               crew cannot post to our pages
// Then it scans again and fails if any FULL name is still there.
//
// Common words that are also somebody's name ("Chance", "Mason", "Snow",
// "Drew", "Bell") are not replaced on their own -- they occur in ordinary code
// and prose, and replacing "chance" breaks sentences while identifying nobody.
// Their full names are still caught.
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..");
const SECRETS = process.env.NAUTI_SECRETS || "C:/Users/immex/.secrets/nauti-yachti.env";

// Tokens never replaced on their own because they are ordinary English words or
// this business's own vocabulary (still caught inside a full name). ONLY words
// belong here -- never a first name, or this file becomes a list of guests.
const AMBIGUOUS = new Set(`
  text trip char chance drew mason snow bell will mark grace hope faith rose page
  story chase hunter wade lane dean long young king brown white black green
  austin enquiry party cove lake test guest owner crew boat team family group
  birthday bachelor bachelorette island explorer islander glow sunset conroe
  montgomery texas nauti yachti pearl coral siren penny joy reef shelly nova jarvis
`.split(/\s+/).filter(Boolean));

// This business's own accounts. Public, but functional: left in, a new owner's
// crew would publish to our Facebook page.
const ACCOUNT_IDS = [
  [/\b630671406805108\b/g, "YOUR_FACEBOOK_PAGE_ID"],
  [/(accountId:\s*")(49334|67877|57393)(")/g, "$1YOUR_BLOTATO_ACCOUNT_ID$3"],
  [/\b(49334|67877|57393)\b/g, "YOUR_BLOTATO_ACCOUNT_ID"],
  [/\baustinhefty\b/gi, "your-instagram-handle"],
  [/\bAustin Hefty\b/g, "the owner"],
  [/\bThomas (Austin )?Hefty\b/g, "the owner"],
  // The owner's personal mailboxes (a crew skill names them). The business's
  // own address stays: it is on the public site and the wizard rewrites it.
  [/\b(?!thenautiyachti@)[A-Za-z0-9._%+-]+@(gmail|googlemail|yahoo|hotmail|icloud|outlook|aol|live|me)\.com\b/gi, "owner-personal@example.com"],
];

// Everything the scrub reads. Wider than the identity wizard's TEXT on purpose:
// the CapCut planners are Python and carried rider names.
const SCRUBBABLE = /\.(js|jsx|mjs|cjs|ts|tsx|md|json|txt|csv|css|html|yml|yaml|env|sh|ps1|py|sql|prisma)$/i;

function loadEnv() {
  if (!fs.existsSync(SECRETS)) throw new Error("secrets file not found: " + SECRETS);
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// Every field in the schema that holds a real person's name, email or phone.
const PEOPLE = {
  inquiry:          { name: ["name"], email: ["email"], phone: ["phone"] },
  externalBooking:  { name: ["guestName"], email: ["email"], phone: ["phone"] },
  guestUpload:      { name: ["uploaderName"], email: ["uploaderEmail"], phone: ["uploaderPhone"] },
  tripMessage:      { name: ["author"] },
  testimonial:      { name: ["name"] },
  giftCertificate:  { name: ["purchaserName", "recipientName"], email: ["purchaserEmail", "recipientEmail"], phone: ["purchaserPhone"] },
  photoRequest:     { name: ["name"], email: ["email"], phone: ["phone"] },
  commentReplyDraft:{ name: ["author"] },
  messageReplyDraft:{ name: ["author"] },
};

async function loadPeople() {
  loadEnv();
  const { prisma } = require(path.join(APP, "lib/db.js"));
  const names = new Set(), emails = new Set();
  try {
    for (const [model, f] of Object.entries(PEOPLE)) {
      const select = {};
      for (const k of [...(f.name || []), ...(f.email || [])]) select[k] = true;
      let rows;
      try { rows = await prisma[model].findMany({ select }); }
      catch (e) { throw new Error("could not read " + model + ": " + e.message); }
      for (const r of rows) {
        for (const k of f.name || []) if (r[k]) names.add(String(r[k]).trim());
        for (const k of f.email || []) if (r[k]) emails.add(String(r[k]).trim().toLowerCase());
      }
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
  return { names: [...names].filter((n) => n.length >= 3), emails: [...emails].filter((e) => e.includes("@")) };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function buildRules({ names, emails }) {
  // Full names first (longest first), then distinctive single tokens.
  const full = names
    .filter((n) => /\s/.test(n))
    .sort((a, b) => b.length - a.length)
    .map((n) => new RegExp("\\b" + n.trim().split(/\s+/).map(esc).join("\\s+") + "\\b", "gi"));
  const tokens = new Set();
  for (const n of names) {
    for (const t of n.split(/[^A-Za-z'-]+/)) {
      const k = t.toLowerCase().replace(/'s$/, "");
      if (k.length >= 4 && !AMBIGUOUS.has(k)) tokens.add(k);
    }
  }
  const single = [...tokens].sort((a, b) => b.length - a.length).map((t) => new RegExp("\\b" + esc(t) + "\\b", "gi"));
  const mail = emails.map((e) => new RegExp(esc(e), "gi"));
  return { full, single, mail };
}

function scrubText(text, rules) {
  let n = 0;
  const rep = (re, by) => { text = text.replace(re, () => { n++; return by; }); };
  for (const re of rules.mail) rep(re, "guest@example.com");
  for (const re of rules.full) rep(re, "Guest");
  for (const re of rules.single) rep(re, "Guest");
  for (const [re, by] of ACCOUNT_IDS) text = text.replace(re, (...m) => { n++; return by.replace(/\$(\d)/g, (_, i) => m[i] || ""); });
  return { text, changes: n };
}

function walk(dir, isText, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, isText, fn);
    else if (isText(e.name)) fn(p);
  }
}

// Scrub the built package in place, then verify. Returns a report; sets
// process.exitCode = 1 if anything identifying survives.
async function scrubPackage(out, isText = (n) => SCRUBBABLE.test(n)) {
  const people = await loadPeople();
  const rules = buildRules(people);
  let files = 0, changes = 0;
  walk(out, isText, (p) => {
    const before = fs.readFileSync(p, "utf8");
    const r = scrubText(before, rules);
    if (r.changes) { fs.writeFileSync(p, r.text); files++; changes += r.changes; }
  });

  // Verify: a full name or a guest email anywhere is a failed build.
  const survivors = [];
  walk(out, isText, (p) => {
    const t = fs.readFileSync(p, "utf8");
    for (const re of [...rules.full, ...rules.mail]) {
      re.lastIndex = 0;
      if (re.test(t)) { survivors.push(path.relative(out, p)); break; }
    }
  });
  return {
    people: people.names.length, emails: people.emails.length,
    files, changes, survivors,
  };
}

module.exports = { scrubPackage, scrubText, buildRules, AMBIGUOUS, SCRUBBABLE };
