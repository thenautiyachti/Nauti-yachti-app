// The identity of a charter business, and how to swap one for another.
//
// Shared by make-distributable.js (which writes the template config) and by the
// setup wizard that ships inside the package (which applies it). Kept in one
// file so the list of things that must be renamed cannot fall out of step with
// the list of things that get asked about -- which is how a setup wizard ends up
// leaving somebody else's brand in the footer.

// The questions a new owner has to answer, in the order a person would think of
// them. `find` is what to look for in the copied source; `example` is this
// business, shown so the shape of the answer is obvious.
// ORDER MATTERS, and it is the reason this is a list rather than an object.
// The domain must be replaced BEFORE the business name: "thenautiyachti" is a
// substring of "thenautiyachti.com", so the other way round turned
// "thenautiyachti.com" into "Reef Runners.com". Most specific first, always.
const FIELDS = [
  { key: "domain", q: "Website domain (no https://)", example: "thenautiyachti.com",
    find: [/thenautiyachti\.com/gi] },
  { key: "businessName", q: "Business name", example: "The Nauti Yachti",
    find: [/The Nauti Yachti LLC/g, /The Nauti Yachti/g, /Nauti Yachti/g, /thenautiyachti/gi] },
  { key: "waterBody", q: "Lake, river or bay you operate on", example: "Lake Conroe",
    find: [/Lake Conroe/g] },
  { key: "town", q: "Nearest town, with state", example: "Conroe, TX",
    find: [/Conroe,?\s*(TX|Texas)/g] },
  { key: "ownerEmail", q: "Owner email", example: "owner@example.com", find: [] },
  { key: "phone", q: "Business phone", example: "555-555-5555",
    find: [/\b\d{3}-\d{3}-\d{4}\b/g] },
  { key: "installRoot", q: "Where you unpacked this, full path", example: "C:/Users/sam/charter-platform",
    find: [] }, // handled by rewritePaths, which needs the sub-paths too
];

// The previous owner's machine, written into 38 files.
//
// The crew briefs are full of absolute paths -- that is how an agent is told
// which script to run -- and the app's own scripts carry a few more. None of
// them exist on anybody else's computer, so an unrewritten package hands a
// friend a crew that cannot find its own tools.
//
// Ordered longest-first: "C:/Users/immex/Documents/.../Jarvis-Voice-UI" contains
// "C:/Users/immex", and rewriting the short one first would leave the tail of
// the long one dangling off a new root.
// The last three entries were added after inspecting a finished package rather
// than by reasoning about it, which is the only way this kind of list ever gets
// finished. What survived the first complete run:
//
//   - the "AI & Website" folder itself, one level above the app, which appears
//     in scripts/secrets-inventory.js. Missing it produced the worst possible
//     result: a path HALF rewritten, "C:/Users/sam/charter-platform/Documents/
//     _MyFiles/_O'Malley's Reef Runners/AI & Website/..." -- the new owner's
//     root glued to the old owner's folder structure with their own business
//     name substituted into the middle of it.
//   - the LLC folder above that.
//   - a RELATIVE reference, "Documents/_MyFiles/Jarvis-Voice-UI", with no drive
//     letter at all, in the crew protocol's where-things-live table.
const PATH_MAP = [
  ["C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/AI & Website/nauti-yachti-app", "/app"],
  ["C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos", "/Photos"],
  ["C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/AI & Website", ""],
  ["C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC", ""],
  ["C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI", "/scripts"],
  ["C:/Users/immex/.claude/scheduled-tasks", "/crew"],
  ["C:/Users/immex/.secrets/nauti-yachti.env", "/.secrets/env"],
  ["C:/Users/immex", ""],
];

// References with no drive letter. Rewritten to a path relative to the package,
// because that is what they mean once the package is somewhere else.
const RELATIVE_MAP = [
  ["Documents/_MyFiles/Jarvis-Voice-UI", "scripts"],
  ["Documents/_MyFiles/_The Nauti Yachti LLC/Photos", "Photos"],
  ["Documents/_MyFiles/_The Nauti Yachti LLC", "."],
  // The bare folder name, which appears in prose: "the Jarvis-Voice-UI folder".
  // Not personal data, but a friend reading their own documentation should not
  // be sent to a folder that does not exist in their package. Last, so the
  // longer paths above have already consumed their own copies of it.
  ["Jarvis-Voice-UI", "scripts"],
];

// The named things: places on the water, and boats.
//
// The wizard was ASKING for these and doing nothing with them, which is worse
// than not asking -- somebody fills in their own coves, runs setup, and the
// package still talks about Party Cove and The Island in eighteen files. Mapped
// positionally: the first place the original business named becomes the first
// place you named.
//
// "Nauti Yachti" is deliberately absent from the vessel list even though it was
// a boat. It is also the business name, and the business-name rule has already
// claimed it -- a boat and a brand cannot both win the same string.
const LIST_SOURCES = {
  locations: ["Party Cove", "The Island", "The Dam"],
  vessels: ["Nauti Explorer", "Nauti Islander"],
};

function rewriteLists(text, config) {
  let out = String(text);
  let changes = 0;
  for (const [key, originals] of Object.entries(LIST_SOURCES)) {
    const replacements = config[key];
    if (!Array.isArray(replacements) || !replacements.length) continue;
    originals.forEach((original, i) => {
      // Fewer answers than the original had? Everything past the end folds onto
      // the last one supplied, rather than being left as somebody else's cove.
      const to = replacements[i] || replacements[replacements.length - 1];
      const before = out;
      out = out.replace(new RegExp(esc(original), "g"), to);
      if (out !== before) changes++;
    });
  }
  return { text: out, changes };
}

// Escape a string for use inside a regular expression.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function rewritePaths(text, installRoot) {
  if (!installRoot) return { text, changes: 0 };
  const root = String(installRoot).replace(/[\\/]+$/, "");
  let out = String(text);
  let changes = 0;
  for (const [from, suffix] of PATH_MAP) {
    // Both slash styles, and both the escaped-backslash form that appears
    // inside JavaScript string literals and the plain form in markdown.
    for (const variant of [from, from.replace(/\//g, "\\"), from.replace(/\//g, "\\\\")]) {
      const re = new RegExp(esc(variant), "g");
      const before = out;
      const replacement = variant.includes("\\\\")
        ? (root + suffix).replace(/\//g, "\\\\")
        : variant.includes("\\") ? (root + suffix).replace(/\//g, "\\") : root + suffix;
      out = out.replace(re, replacement);
      if (out !== before) changes++;
    }
  }
  // Drive-letterless references, after the absolute ones so an absolute path is
  // never half-consumed by its own relative tail.
  for (const [from, to] of RELATIVE_MAP) {
    for (const variant of [from, from.replace(/\//g, "\\"), from.replace(/\//g, "\\\\")]) {
      const re = new RegExp(esc(variant), "g");
      const before = out;
      out = out.replace(re, variant.includes("\\") ? to.replace(/\//g, "\\") : to);
      if (out !== before) changes++;
    }
  }
  return { text: out, changes };
}

// Named things that are lists rather than single values.
//
// The names ARE find-and-replaced, positionally, by rewriteLists above -- your
// first cove for their first cove. That is enough to clear the previous
// business out of the prose and the media vocabulary.
//
// It is NOT enough to build your fleet. The real boats, with their capacities
// and prices, are yours to write in prisma/seed.js, and the wizard says so
// rather than pretending a rename is a business.
const LISTS = [
  { key: "vessels", q: "Your boats, one per line", example: ["Nauti Explorer", "Nauti Islander"] },
  { key: "locations", q: "Spots you actually go, one per line", example: ["Party Cove", "The Island", "The Dam"] },
  { key: "packages", q: "What you sell, one per line", example: ["Party Cove Package", "Birthday Party", "Tubing / Wakeboarding"] },
];

// The crew. Their names are this owner's invention and a friend may want their
// own -- but the personas, registers and the protocol they follow are the part
// worth inheriting, so renaming is offered and defaulted to keeping.
const CREW_NAMES = ["Pearl", "Coral", "Siren", "Penny", "Joy", "Reef", "Shelly", "Nova"];

// Applied last, after the named fields, because "Nauti Pearl" contains "Nauti"
// and would otherwise be half-renamed by the business-name rule into something
// like "Reef Charters Pearl".
function crewFind(name) {
  return new RegExp("Nauti " + name, "g");
}

// Rewrite one file's text. Returns { text, changes } so the caller can report
// what actually happened rather than claiming success.
function applyIdentity(text, config) {
  let out = String(text);
  let changes = 0;

  // MACHINE PATHS FIRST. They are the longest and most specific strings here,
  // and they CONTAIN the business name: ".../_The Nauti Yachti LLC/Photos".
  // Running the business-name rule first rewrote the middle of the path, after
  // which it no longer matched anything and the result was the new owner's root
  // glued to the old owner's folder structure --
  // "C:/Users/sam/charter-platform/Documents/_MyFiles/_Reef Runners/Photos".
  // Most specific first, the same rule that put the domain before the name.
  {
    const p = rewritePaths(out, config.installRoot);
    out = p.text;
    changes += p.changes;
  }

  // Crew names next, into placeholders, so the business-name pass cannot touch
  // them. Restored at the end.
  const holds = {};
  CREW_NAMES.forEach((n, i) => {
    const token = " CREW" + i + " ";
    holds[token] = (config.crew && config.crew[n]) ? config.crew[n] : "Nauti " + n;
    const before = out;
    out = out.replace(crewFind(n), token);
    if (out !== before) changes++;
  });

  for (const f of FIELDS) {
    const value = config[f.key];
    if (!value) continue;
    for (const re of f.find) {
      const before = out;
      out = out.replace(re, value);
      if (out !== before) changes++;
    }
  }

  // Places and boats after the named fields, before the crew placeholders are
  // restored, so a boat name can never be half-eaten by the business name.
  {
    const l = rewriteLists(out, config);
    out = l.text;
    changes += l.changes;
  }

  for (const [token, value] of Object.entries(holds)) out = out.split(token).join(value);

  return { text: out, changes };
}

// What a new business fills in. Written into the package as a starting point,
// with this business's values as EXAMPLES rather than defaults -- so an
// unfinished config produces something obviously unfinished rather than a site
// quietly advertising somebody else's boats.
function templateConfig() {
  const cfg = { _comment: "Fill this in, then run: node setup.js" };
  for (const f of FIELDS) cfg[f.key] = "";
  for (const l of LISTS) cfg[l.key] = [];
  cfg.crew = {};
  for (const n of CREW_NAMES) cfg.crew[n] = "Nauti " + n;
  cfg._examples = {};
  for (const f of FIELDS) cfg._examples[f.key] = f.example;
  for (const l of LISTS) cfg._examples[l.key] = l.example;
  return cfg;
}

function missingFrom(config) {
  const missing = [];
  for (const f of FIELDS) if (!config[f.key]) missing.push(f.key);
  for (const l of LISTS) if (!config[l.key] || !config[l.key].length) missing.push(l.key);
  return missing;
}

module.exports = { FIELDS, LISTS, CREW_NAMES, PATH_MAP, LIST_SOURCES, rewriteLists, applyIdentity, rewritePaths, templateConfig, missingFrom };
