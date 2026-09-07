// Give every boat its own service schedule.
//
//   node scripts/split-maintenance-per-boat.js            what it would do
//   node scripts/split-maintenance-per-boat.js --apply    do it
//
// There were 13 maintenance items and no vesselId on any of them: one shared
// checklist judged against whichever engine had the most hours. That was
// defensible while nothing had ever been logged. It stops being defensible the
// moment hours are real — an oil change belongs to an engine, and judging the
// Islander's against the Explorer's 120 hours reports it overdue for work its
// own engine has not earned.
//
// This gives each of the three boats its own copy of every item.
//
// WHAT IT DOES WITH THE ONE REAL RECORD. Exactly one of the 13 has ever been
// marked done: "Engine Oil & Filter Change", 2026-08-01, with no hours against
// it. Nobody wrote down which boat that was, and copying the date onto all
// three would assert that all three had their oil changed — inventing two
// service records. So the date stays on ONE copy (the Explorer, the boat that
// actually runs), every copy carries a note saying where it came from, and the
// owner can move it in one tap if it was a different boat.
//
// Idempotent: it looks for an existing per-boat copy of each label before
// creating one, so running it twice does not produce six schedules.

const fs = require("fs");
const path = require("path");

const APP = path.resolve(__dirname, "..");
const SECRETS = "C:/Users/immex/.secrets/nauti-yachti.env";
if (fs.existsSync(SECRETS)) {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const APPLY = process.argv.includes("--apply");
if (APPLY) process.env.ALLOW_PROD_WRITES = "1";

const { PrismaClient } = require(path.join(APP, "node_modules/@prisma/client"));
const prisma = new PrismaClient();

// The boat that keeps any existing last-done record. The Explorer is the boat
// that actually runs — 4 of the 5 logged hours are its — so it is the least
// wrong single guess, and the note says it IS a guess.
const KEEPS_HISTORY = "explorer";

const PROVENANCE = "Was a fleet-wide item before per-boat schedules (6 Sep 2026).";

(async () => {
  const vessels = await prisma.vessel.findMany({ orderBy: { sortOrder: "asc" } });
  const items = await prisma.maintenanceItem.findMany({ orderBy: { sortOrder: "asc" } });
  const loose = items.filter((i) => !i.vesselId);

  if (!vessels.length) {
    console.log("No vessels. Nothing to do.");
    await prisma.$disconnect();
    return;
  }
  if (!loose.length) {
    console.log(`\nNothing to split — all ${items.length} items already belong to a boat.\n`);
    for (const v of vessels) {
      console.log(`  ${v.name.padEnd(18)} ${items.filter((i) => i.vesselId === v.id).length} items`);
    }
    console.log("");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n${loose.length} fleet-wide items, ${vessels.length} boats.\n`);

  const plan = [];
  for (const item of loose) {
    const carriesHistory = !!(item.lastDoneDate || item.lastDoneHours != null);
    for (const v of vessels) {
      // Already split? Same label, already on this boat.
      const existing = items.find((x) => x.vesselId === v.id && x.label === item.label);
      if (existing) {
        plan.push({ action: "skip", label: item.label, vessel: v.name, why: "already exists" });
        continue;
      }
      const keepsIt = carriesHistory && v.id === KEEPS_HISTORY;
      if (v.id === vessels[0].id) {
        // The original row is reused for the first boat rather than duplicated
        // and deleted — no row is destroyed, and the one real record stays put.
        plan.push({
          action: "assign", id: item.id, label: item.label, vessel: v.name,
          keepsHistory: carriesHistory,
        });
      } else {
        plan.push({
          action: "create", label: item.label, vessel: v.name, vesselId: v.id,
          keepsHistory: keepsIt,
        });
      }
    }
  }

  for (const p of plan) {
    const tag = p.action === "assign" ? "REUSE " : p.action === "create" ? "CREATE" : "skip  ";
    console.log(`  ${tag} ${p.vessel.padEnd(16)} ${p.label.slice(0, 34).padEnd(35)}` +
      (p.keepsHistory ? "  << keeps the last-done record" : ""));
  }

  const creates = plan.filter((p) => p.action === "create").length;
  const assigns = plan.filter((p) => p.action === "assign").length;
  console.log(`\n  ${assigns} reassigned, ${creates} created, ` +
    `${plan.filter((p) => p.action === "skip").length} skipped.`);
  console.log(`  Result: ${assigns + creates} items across ${vessels.length} boats.\n`);

  if (!APPLY) {
    console.log("  Dry run. Re-run with --apply to write it.\n");
    await prisma.$disconnect();
    return;
  }

  for (const item of loose) {
    const carriesHistory = !!(item.lastDoneDate || item.lastDoneHours != null);
    for (const v of vessels) {
      if (items.find((x) => x.vesselId === v.id && x.label === item.label)) continue;
      const note = [item.notes, PROVENANCE,
        carriesHistory && v.id === KEEPS_HISTORY
          ? `Last-done ${item.lastDoneDate} was recorded before boats were separated — the boat was not written down, and this is the best guess. Move it if it was another.`
          : null,
      ].filter(Boolean).join(" ");

      if (v.id === vessels[0].id) {
        await prisma.maintenanceItem.update({
          where: { id: item.id },
          data: {
            vesselId: v.id,
            notes: note,
            // If the first boat is not the one keeping history, strip it rather
            // than assert a service that may never have happened here.
            ...(carriesHistory && v.id !== KEEPS_HISTORY ? { lastDoneDate: null, lastDoneHours: null } : {}),
          },
        });
      } else {
        await prisma.maintenanceItem.create({
          data: {
            vesselId: v.id,
            label: item.label,
            intervalHours: item.intervalHours,
            intervalMonths: item.intervalMonths,
            // A fresh boat's copy starts with no history. Copying the date
            // would fabricate a service record for an engine nobody touched.
            lastDoneDate: carriesHistory && v.id === KEEPS_HISTORY ? item.lastDoneDate : null,
            lastDoneHours: carriesHistory && v.id === KEEPS_HISTORY ? item.lastDoneHours : null,
            notes: note,
            sortOrder: item.sortOrder,
          },
        });
      }
    }
  }

  const after = await prisma.maintenanceItem.findMany();
  console.log("  Done.\n");
  for (const v of vessels) {
    console.log(`  ${v.name.padEnd(18)} ${after.filter((i) => i.vesselId === v.id).length} items`);
  }
  const stillLoose = after.filter((i) => !i.vesselId).length;
  if (stillLoose) console.log(`  ${stillLoose} still fleet-wide`);
  console.log("");
  await prisma.$disconnect();
})();
