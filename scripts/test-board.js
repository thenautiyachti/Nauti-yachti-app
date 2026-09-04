// The board's two guarantees, asserted against the real board.
//
//   node scripts/test-board.js
//
// 1. READING AN ITEM LOSES NOTHING. formatBody() splits an item into a lead,
//    its supporting points and its dated note trail. Every character has to come
//    out somewhere. That is not fussiness: these items are the evidence trail
//    for money and maintenance, and a renderer that quietly eats a clause is
//    worse than no renderer. Two real bugs were caught this way -- a sentence
//    splitter that dropped any run containing an interior full stop (a URL,
//    "@handle, @handle", "31 TAC 55.401" -- eighty characters of one item), and
//    a date pattern that split "took effect 2026-05-01:" mid-sentence and left a
//    lead reading "410) took effect".
//
// 2. THE RANKING STILL AGREES WITH THE OWNER. lib/boardPriority.js is derived
//    entirely from fourteen decisions he made by hand on 4 Sep 2026. A rule set
//    that quietly stops agreeing with them is worse than none, because it still
//    looks principled.
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..");
for (const line of fs.readFileSync("C:/Users/immex/.secrets/nauti-yachti.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { prisma } = require(path.join(APP, "lib/db.js"));
const { parseItem } = require(path.join(APP, "lib/board.js"));
const { formatBody } = require(path.join(APP, "lib/boardText.js"));
const { classify } = require(path.join(APP, "lib/boardPriority.js"));

// Punctuation and spacing are the renderer's business, and so are the two
// joining words inside a stamp: "MEASURED 2026-09-04 by Pearl" is shown as a
// date chip plus an attribution, and "2026-09-03 update:" as a date chip, so
// "by" and "update" legitimately do not reappear. A full stop between the stamp
// and its note is consumed the same way a colon or comma is.
//
// Digits are NOT normalised away, so a mangled amount would still fail this.
const norm = (s) =>
  String(s).toLowerCase().replace(/\b(?:by|update)\b/g, "").replace(/[^a-z0-9$]/g, "");

// His rulings, keyed by a phrase unique to each item.
const RULINGS = [
  ["The social queue ends 20 Sept", "medium"],
  ["GetMyBoat stopped converting", "medium"],
  ["Lockaway Storage payment is entered twice", "medium"],
  ["Maintenance is reported as", "medium"],
  ["Klarna is charging", "low"],
  ["Mechanical failure is the single biggest cause", "medium"],
  ["Only 2 past guests can still be asked", "low"],
  ["REVENUE IDEA: Seven Saturdays are open", "low"],
  ["Sell gift certificates before Christmas", "medium"],
  ["No production required", "low"],
  ["CAPACITY: Saturday 6 Jun 2026", "low"],
  ["BAREBOAT: list the Nauti Islander", "medium"],
  ["Warm lead: Allison", "low"],
  ["TPWD Party Boat rule", "high"],
];

(async () => {
  const rows = await prisma.jarvisTodo.findMany({ where: { done: false } });
  const problems = [];

  // --- 1. lossless ---------------------------------------------------------
  for (const r of rows) {
    const { body } = parseItem(r.text);
    const f = formatBody(body);
    const out = [f.lead, ...f.points, ...f.updates.map((u) => (u.stamp || "") + (u.who || "") + u.text)].join("");
    if (norm(out) === norm(body)) continue;
    const a = norm(body), b = norm(out);
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    problems.push("text lost or changed in: " + f.lead.slice(0, 60) +
      "\n        near: ..." + a.slice(Math.max(0, i - 20), i + 40));
  }
  console.log("  " + rows.length + " open items read; " +
    (problems.length ? problems.length + " lost text" : "nothing lost"));

  // --- 2. the ranking ------------------------------------------------------
  let matched = 0, missing = 0;
  for (const [needle, want] of RULINGS) {
    const row = rows.find((r) => r.text.includes(needle));
    if (!row) { missing++; continue; }
    const { tier, body } = parseItem(row.text);
    const f = formatBody(body);
    const got = classify([f.lead, ...f.points].join(" "), tier, { lead: f.lead });
    if (got.priority === want) { matched++; continue; }
    problems.push("ranking disagrees with the owner on \"" + needle + "\"" +
      "\n        he said " + want + ", the rules say " + got.priority + " (" + got.why + ")");
  }
  console.log("  " + matched + " of " + (RULINGS.length - missing) + " of his rulings reproduced" +
    (missing ? "   (" + missing + " item(s) since closed, not checked)" : ""));

  if (problems.length) {
    console.log("");
    for (const p of problems) console.log("  [board] " + p);
    console.log("\n  " + problems.length + " problem" + (problems.length === 1 ? "" : "s") + ".");
    process.exitCode = 1;
  } else {
    console.log("\n  board reads cleanly and ranks the way he does.");
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
