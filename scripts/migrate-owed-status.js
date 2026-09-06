// One-off migration for the "owed" status, 5 Sep 2026.
//
// Two changes, both to a single booking, and both agreed with the owner first:
//
//   1. NY-20260711-GEHRING  ->  NY-20260711-02
//      Every other booking id in the business is NY-YYYYMMDD-NN. This one was
//      written by hand and ends in a surname. The owner's decision, in his own
//      words: "renaming this ID is a one time thing, ur right they shouldn't
//      change moving forward."
//
//      THAT RULE IS THE POINT, and it is why this script exists rather than a
//      quiet edit in a database console. A booking id is what a guest quotes on
//      the phone and what a ledger entry points at. It does not change when a
//      charter is rescheduled, refunded or renamed -- the date inside it records
//      when the booking was FIRST made for, and the `date` column is the one
//      that moves. This is the single exception, made because the id never
//      conformed in the first place, and it is checked below for anything
//      pointing at it before it moves.
//
//   2. status "cancelled" -> "owed"
//      He paid $520 in June, the charter never ran, and he asked to reschedule.
//      Calling that cancelled says a refund is owed and the relationship is
//      over; both are wrong, and it is why he sat unchased for two months.
//
// Dry run by default. Nothing is written without --apply.

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
const prisma = new PrismaClient();

const OLD_ID = "NY-20260711-GEHRING";
const DAY = "NY-20260711-";
const APPLY = process.argv.includes("--apply");

// The owner asked for -02. It was taken, which is exactly why this is computed
// rather than typed: the sequence number is "the order it was taken that day",
// so the right answer is the first free slot, whatever number that turns out to
// be. Printed loudly below so the id he ends up with is never a surprise.
async function nextFreeId(prisma) {
  const ext = await prisma.externalBooking.findMany({
    where: { bookingId: { startsWith: DAY } }, select: { bookingId: true, guestName: true },
  });
  const inq = await prisma.inquiry.findMany({
    where: { bookingId: { startsWith: DAY } }, select: { bookingId: true, name: true },
  });
  const taken = [
    ...ext.map((r) => ({ id: r.bookingId, who: r.guestName })),
    ...inq.map((r) => ({ id: r.bookingId, who: r.name })),
  ];
  console.log("\n  IDS ALREADY USED ON 11 JULY 2026");
  taken.forEach((t) => console.log("     " + t.id + "   " + (t.who || "-")));
  const used = new Set(taken.map((t) => t.id));
  for (let n = 1; n < 100; n++) {
    const id = DAY + String(n).padStart(2, "0");
    if (!used.has(id)) return id;
  }
  return null;
}

(async () => {
  const row = await prisma.externalBooking.findFirst({ where: { bookingId: OLD_ID } });
  if (!row) {
    console.log("\n  " + OLD_ID + " not found. Already migrated, or never existed.\n");
    return;
  }

  console.log("\n  BEFORE");
  console.log("     id        " + row.bookingId);
  console.log("     guest     " + (row.guestName || "-"));
  console.log("     date      " + JSON.stringify(row.date));
  console.log("     status    " + row.status);
  console.log("     paid      $" + (row.pricePaid || 0));
  console.log("     contact   " + (row.phone || row.email || "NONE ON FILE"));

  // Colliding with a real booking would merge two charters into one identifier,
  // which is far worse than an ugly id, so the slot is computed from what is
  // actually in use rather than assumed to be free.
  const NEW_ID = await nextFreeId(prisma);
  if (!NEW_ID) {
    console.log("\n  STOP: no free slot on 11 July 2026.\n");
    process.exitCode = 1;
    return;
  }

  // Anything pointing at the old id has to move with it, or it is orphaned.
  const ledger = await prisma.ledgerEntry.findMany({ where: { bookingId: OLD_ID } });
  const twin = await prisma.inquiry.findFirst({ where: { bookingId: OLD_ID } });
  console.log("\n  POINTING AT THE OLD ID");
  console.log("     ledger entries   " + ledger.length);
  ledger.forEach((l) => console.log("        " + l.date + "  " + l.type + "  $" + l.amount));
  console.log("     inquiry row      " + (twin ? twin.id : "none"));

  console.log("\n  AFTER");
  console.log("     id        " + NEW_ID);
  console.log("     status    owed");

  if (!APPLY) {
    console.log("\n  Dry run. Nothing written. Re-run with --apply to commit.\n");
    return;
  }
  if (!process.env.ALLOW_PROD_WRITES) {
    console.log("\n  ALLOW_PROD_WRITES is not set. Refusing to write.\n");
    process.exitCode = 1;
    return;
  }

  // One transaction: an id that moved on the booking but not on its ledger
  // entries would be worse than either change alone.
  await prisma.$transaction([
    prisma.externalBooking.update({
      where: { id: row.id },
      data: { bookingId: NEW_ID, status: "owed" },
    }),
    ...ledger.map((l) =>
      prisma.ledgerEntry.update({ where: { id: l.id }, data: { bookingId: NEW_ID } })
    ),
    ...(twin
      ? [prisma.inquiry.update({ where: { id: twin.id }, data: { bookingId: NEW_ID, status: "owed" } })]
      : []),
  ]);
  console.log("\n  Written: booking, " + ledger.length + " ledger entr(ies)" +
    (twin ? " and the matching inquiry" : "") + ".\n");

  // Anyone else who looks owed but is not labelled it. Reported, never changed:
  // a genuine cancellation with a refund issued must stay cancelled, and only
  // the owner knows which is which.
  const others = await prisma.externalBooking.findMany({
    where: { status: "cancelled", NOT: { bookingId: NEW_ID } },
  });
  const withMoney = others.filter((b) => Number(b.pricePaid) > 0);
  if (withMoney.length) {
    console.log("  ALSO WORTH A LOOK -- cancelled, but money was taken:\n");
    withMoney.forEach((b) => console.log("     " + (b.bookingId || "no id") + "  " +
      (b.guestName || "") + "  $" + b.pricePaid + "  " + b.date));
    console.log("\n  Left alone. If a refund went back they are cancelled; if it did not,\n" +
      "  they are owed. That is a judgement call, not a migration.\n");
  } else {
    console.log("  No other cancelled booking has money against it.\n");
  }
})()
  .catch((e) => { console.error("\n  " + e.message + "\n"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
