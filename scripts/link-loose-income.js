// Tie an income row to the charter it belongs to.
//
//   node scripts/link-loose-income.js                          list what is loose
//   node scripts/link-loose-income.js <ledgerId> <bookingId>   dry run one link
//   node scripts/link-loose-income.js <ledgerId> <bookingId> --apply
//
// WHY A TOOL RATHER THAN ANOTHER ONE-OFF SCRIPT. Two rows needed this in one
// week and the reason is structural: money that arrives off-platform -- Zelle,
// cash, a Venmo top-up -- is entered by hand and has nothing to attach itself
// to. It will keep happening, and the alternative is a new throwaway script
// each time, none of which check anything.
//
// LINKING IS NOT THE SAME AS ADDING. Nothing here creates an income row. If the
// money is genuinely absent this tool has nothing to offer, deliberately:
// writing a row for money that was in fact already recorded double-counts it on
// a tax return, which is how this whole thread started.
//
// NOT EVERY LOOSE ROW IS A FAULT. The May 2026 Glow Party seats are real income
// with no booking to attach to and never will have one. This lists them so a
// person can judge; it never guesses.

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

const { PrismaClient } = require(path.join(APP, "node_modules/@prisma/client"));
const { unlinkedIncome } = require(path.join(APP, "lib", "ledgerLinks"));
const prisma = new PrismaClient();

const args = process.argv.slice(2).filter((a) => a !== "--apply");
const APPLY = process.argv.includes("--apply");
const [ledgerId, bookingRef] = args;

(async () => {
  const ledger = await prisma.ledgerEntry.findMany();
  const bookings = await prisma.externalBooking.findMany();

  if (!ledgerId || !bookingRef) {
    const loose = unlinkedIncome(ledger);
    console.log("\n  INCOME TIED TO NO CHARTER: " + loose.length +
      "   ($" + loose.reduce((s, l) => s + Number(l.amount || 0), 0).toFixed(2) + ")\n");
    for (const l of loose) {
      console.log("   " + l.id);
      console.log("      " + l.date + "   $" + l.amount + "   " + (l.origin || "-") +
        "   vessel=" + (l.subcategory || "-"));
      console.log("      " + String(l.note || "").slice(0, 110));

      // A suggestion, never an action. Same date and vessel is a strong hint
      // and still only a hint.
      const near = bookings.filter((b) =>
        b.date === l.date &&
        String(b.vesselName || "").replace(/^the\s+/i, "").toLowerCase() ===
          String(l.subcategory || "").replace(/^the\s+/i, "").toLowerCase());
      if (near.length === 1) {
        console.log("      possibly " + near[0].bookingId + " (" + near[0].guestName +
          ", same date and boat) — check the note before linking");
      } else if (near.length > 1) {
        console.log("      " + near.length + " bookings share that date and boat; decide by hand");
      }
      console.log("");
    }
    console.log("  To link one:  node scripts/link-loose-income.js <ledgerId> <bookingId> --apply\n");
    return;
  }

  const row = ledger.find((l) => l.id === ledgerId);
  if (!row) { console.log("\n  No ledger row with id " + ledgerId + "\n"); process.exitCode = 1; return; }
  if (row.type !== "income") { console.log("\n  " + ledgerId + " is an expense, not income.\n"); process.exitCode = 1; return; }
  if (row.externalBookingId || row.bookingId) {
    console.log("\n  Already linked to " + (row.bookingId || row.externalBookingId) + ". Refusing.\n");
    process.exitCode = 1; return;
  }

  const booking = bookings.find((b) => b.bookingId === bookingRef || b.id === bookingRef);
  if (!booking) { console.log("\n  No booking " + bookingRef + "\n"); process.exitCode = 1; return; }

  const existing = ledger.filter((l) =>
    l.externalBookingId === booking.id || (l.bookingId && l.bookingId === booking.bookingId));

  console.log("\n  LINK");
  console.log("     " + row.date + "   $" + row.amount + "   " + (row.origin || "-"));
  console.log("     " + String(row.note || "").slice(0, 100));
  console.log("\n  TO");
  console.log("     " + booking.bookingId + "   " + (booking.guestName || "") + "   " +
    booking.date + "   " + (booking.vesselName || "") + "   [" + booking.status + "]");
  console.log("     already carries " + existing.length + " ledger row(s), $" +
    existing.filter((l) => l.type === "income").reduce((s, l) => s + Number(l.amount || 0), 0) + " income");

  if (row.date !== booking.date) {
    // Not a blocker: Boatsetter pays days after the trip, so a mismatch is
    // normal. Worth saying out loud before writing, all the same.
    console.log("\n     NOTE: the row is dated " + row.date + " and the charter is " + booking.date + ".");
  }

  if (!APPLY) { console.log("\n  Dry run. Re-run with --apply to write.\n"); return; }
  if (!process.env.ALLOW_PROD_WRITES) { console.log("\n  ALLOW_PROD_WRITES is not set. Refusing.\n"); process.exitCode = 1; return; }

  await prisma.ledgerEntry.update({
    where: { id: row.id },
    data: { externalBookingId: booking.id, bookingId: booking.bookingId },
  });
  console.log("\n  Linked. No new row was written.\n");
})()
  .catch((e) => { console.error("\n  " + e.message + "\n"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
