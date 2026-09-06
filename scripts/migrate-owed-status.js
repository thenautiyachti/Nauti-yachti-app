// One-off migration for the "owed" status, 5 Sep 2026.
//
// Three changes, all to a single booking, and all agreed with the owner first:
//
//   1. NY-20260711-GEHRING  ->  NY-20260711-03
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
//      conformed in the first place, and everything pointing at it is moved in
//      the same transaction.
//
//      He asked for -02. -02 is Haley's and -01 is abigail's, so it is -03.
//      Renaming Haley's to free up -02 would have broken the very rule this
//      establishes, on a booking that had done nothing wrong.
//
//   2. status "booked" -> "owed"
//      He paid $520 in June, the charter never ran, and he asked to reschedule.
//      He had been sitting as "booked" with a date of literally "TBD": counted
//      as a live charter while appearing on no list anyone reads.
//
//   3. His $520 income row LINKED to the booking.
//      The money was never missing -- that claim was wrong. It has been in the
//      ledger since 9 June as a Zelle income row whose note already said "NOT
//      EARNED INCOME: this is a deposit against a trip that has not run." What
//      it never had was a link back to the booking, so everything asking from
//      the booking's side answered "no money".
//
//      LINKED, NOT RE-ADDED. Writing a fresh income row for money already
//      recorded would have doubled $520 of revenue on a tax report. That is why
//      this is an explicit, separate step and not part of any generic "add the
//      missing income" routine.
//
// TWO INDEPENDENT STEPS, and they must stay independent. Step 1 ran before
// step 3 was known to be needed, and the first attempt at adding it put the new
// work behind step 1's early return -- so it silently did nothing. Each step
// checks its own state and is safe to re-run.
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

const canWrite = () => {
  if (!APPLY) { console.log("     Dry run — nothing written. Re-run with --apply."); return false; }
  if (!process.env.ALLOW_PROD_WRITES) { console.log("     ALLOW_PROD_WRITES is not set. Refusing to write."); return false; }
  return true;
};

// The owner asked for -02. It was taken, which is exactly why this is computed
// rather than typed: the sequence number is "the order it was taken that day",
// so the right answer is the first free slot, whatever number that turns out to
// be. Printed loudly so the id he ends up with is never a surprise.
async function nextFreeId() {
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

// --- step 1: the id and the status -------------------------------------------
async function step1Rename() {
  const row = await prisma.externalBooking.findFirst({ where: { bookingId: OLD_ID } });
  if (!row) {
    const done = await prisma.externalBooking.findFirst({
      where: { guestName: { contains: "Gehring" } },
    });
    console.log("\n  STEP 1 (id and status): already done" +
      (done ? " — he is " + done.bookingId + " [" + done.status + "]" : " — he is not here at all"));
    return done;
  }

  console.log("\n  STEP 1 (id and status)");
  console.log("     BEFORE   " + row.bookingId + "   [" + row.status + "]   date " +
    JSON.stringify(row.date) + "   $" + (row.pricePaid || 0) +
    "   " + (row.phone || row.email || "NO CONTACT ON FILE"));

  const NEW_ID = await nextFreeId();
  if (!NEW_ID) { console.log("     STOP: no free slot on 11 July 2026."); process.exitCode = 1; return null; }

  // Anything pointing at the old id has to move with it, or it is orphaned.
  const pointing = await prisma.ledgerEntry.findMany({ where: { bookingId: OLD_ID } });
  const twin = await prisma.inquiry.findFirst({ where: { bookingId: OLD_ID } });
  console.log("     pointing at the old id: " + pointing.length + " ledger row(s), " +
    (twin ? "1 inquiry" : "no inquiry"));
  console.log("     AFTER    " + NEW_ID + "   [owed]");

  if (!canWrite()) return null;

  // One transaction: an id that moved on the booking but not on its ledger
  // entries would be worse than either change alone.
  await prisma.$transaction([
    prisma.externalBooking.update({ where: { id: row.id }, data: { bookingId: NEW_ID, status: "owed" } }),
    ...pointing.map((l) => prisma.ledgerEntry.update({ where: { id: l.id }, data: { bookingId: NEW_ID } })),
    ...(twin ? [prisma.inquiry.update({ where: { id: twin.id }, data: { bookingId: NEW_ID, status: "owed" } })] : []),
  ]);
  console.log("     written.");
  return prisma.externalBooking.findUnique({ where: { id: row.id } });
}

// --- step 2: tie his money to him --------------------------------------------
async function step2LinkTheMoney(booking) {
  if (!booking) { console.log("\n  STEP 2 (link the money): skipped, no booking to link to."); return; }

  const already = await prisma.ledgerEntry.findMany({
    where: { OR: [{ externalBookingId: booking.id }, { bookingId: booking.bookingId }] },
  });
  if (already.length) {
    console.log("\n  STEP 2 (link the money): already done — " + already.length + " row(s) worth $" +
      already.reduce((s, l) => s + Number(l.amount || 0), 0) + " point at " + booking.bookingId + ".");
    return;
  }

  const loose = await prisma.ledgerEntry.findMany({
    where: { type: "income", externalBookingId: null, bookingId: null },
  });
  const his = loose.filter((l) =>
    Number(l.amount) === Number(booking.pricePaid) && /gehring/i.test(String(l.note || "")));

  console.log("\n  STEP 2 (link the money)");
  if (!his.length) {
    console.log("     No unlinked income row matches him. His money may genuinely never have");
    console.log("     been recorded — find out what happened before writing anything.");
    return;
  }
  if (his.length > 1) {
    console.log("     " + his.length + " unlinked rows match him. NOT guessing — link by hand:");
    his.forEach((l) => console.log("        " + l.id + "   " + l.date + "   $" + l.amount));
    return;
  }

  const l = his[0];
  console.log("     found    " + l.date + "   $" + l.amount + "   " + l.origin);
  console.log("     note     " + String(l.note || "").slice(0, 96));
  if (!canWrite()) return;

  await prisma.ledgerEntry.update({
    where: { id: l.id },
    data: { externalBookingId: booking.id, bookingId: booking.bookingId },
  });
  console.log("     LINKED to " + booking.bookingId + ". No new row was written.");
}

// --- anyone else in the same shape, reported and never changed ---------------
// A genuine cancellation with a refund issued must stay cancelled, and only the
// owner knows which is which.
async function reportOthers(booking) {
  const cancelled = await prisma.externalBooking.findMany({ where: { status: "cancelled" } });
  const withMoney = cancelled.filter((b) => Number(b.pricePaid) > 0 && (!booking || b.id !== booking.id));
  console.log("\n  OTHER CANCELLED BOOKINGS THAT TOOK MONEY: " + withMoney.length);
  withMoney.forEach((b) => console.log("     " + (b.bookingId || "no id") + "   " +
    (b.guestName || "") + "   $" + b.pricePaid + "   " + b.date));
  if (withMoney.length) {
    console.log("     Left alone. If a refund went back they are cancelled; if it did not,");
    console.log("     they are owed. That is a judgement call, not a migration.");
  }

  // Income that belongs to no charter at all. Also reported, never touched: the
  // Glow Party seats are real income with nothing to attach to and never will
  // have. A person decides; this only makes sure nobody has to go looking.
  const { unlinkedIncome } = require(path.join(APP, "lib", "ledgerLinks"));
  const ledger = await prisma.ledgerEntry.findMany();
  const loose = unlinkedIncome(ledger);
  console.log("\n  INCOME TIED TO NO CHARTER: " + loose.length +
    "  ($" + loose.reduce((s, l) => s + Number(l.amount || 0), 0).toFixed(2) + ")");
  loose.forEach((l) => console.log("     " + l.date + "   $" + l.amount + "   " +
    (l.origin || "-") + "   " + String(l.note || "").slice(0, 70)));
}

(async () => {
  const booking = await step1Rename();
  await step2LinkTheMoney(booking);
  await reportOthers(booking);
  console.log("");
})()
  .catch((e) => { console.error("\n  " + e.message + "\n"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
