// Fold two rows that turned out to be one person into one booking.
//
//     node scripts/merge-bookings.js NY-20260919-03 NY-20260919-11
//     node scripts/merge-bookings.js NY-... NY-... --keep NY-20260919-11
//     node scripts/merge-bookings.js NY-... NY-... --apply
//
// Runs as a PREVIEW unless --apply is given. Prints exactly what it would do,
// in full, before it does any of it.
//
// WHY THIS IS A SCRIPT AND NOT A BUTTON. Merging two guests is the one edit here
// that can destroy a real booking: if the two rows are actually two people, the
// loser's seat disappears and nobody finds out until somebody is standing on the
// ramp. scripts/check-output.js proposes candidates and says why; a person
// decides; this carries it out. Nothing in the running application merges
// anything on its own.
//
// NOTHING IS DELETED. The redundant row is marked cancelled and given a note
// pointing at the survivor. A hard delete would destroy the only evidence that
// the merge happened, and the reason to doubt a merge always arrives afterwards.
require("C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI/paths.js").loadSecrets();
const APP = "C:/Users/immex/Documents/Nauti-yachti-app";
const { PrismaClient } = require(APP + "/node_modules/@prisma/client");
const { looksLikeSamePerson } = require(APP + "/lib/duplicateBooking");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const keepIdx = args.indexOf("--keep");
const KEEP = keepIdx >= 0 ? args[keepIdx + 1] : null;
const refs = args.filter((a) => /^NY-/i.test(a)).map((a) => a.toUpperCase());

// A charter can be written as an Inquiry, an ExternalBooking, or both sharing a
// booking number. "Which row" is the wrong question -- the unit being merged is
// the charter.
async function group(db, ref) {
  const inquiry = await db.inquiry.findFirst({ where: { bookingId: ref } });
  const booking = await db.externalBooking.findFirst({ where: { bookingId: ref } });
  if (!inquiry && !booking) return null;
  const paid = (inquiry && inquiry.paymentStatus === "paid") || (booking && booking.paymentStatus === "paid");
  const money = Number((booking && booking.pricePaid) ?? (inquiry && inquiry.priceQuoted) ?? 0);
  return {
    ref, inquiry, booking, paid, money: paid ? money : 0,
    name: (inquiry && inquiry.name) || (booking && booking.guestName) || "(no name)",
    date: (inquiry && inquiry.date) || (booking && booking.date),
    created: (inquiry && inquiry.submittedAt) || (booking && booking.createdAt),
  };
}

const show = (g) => "  " + g.ref.padEnd(17) + g.name.padEnd(22) + String(g.date).padEnd(12)
  + (g.paid ? ("PAID $" + g.money).padEnd(12) : "unpaid".padEnd(12))
  + [g.inquiry ? "inquiry" : null, g.booking ? "booking" : null].filter(Boolean).join(" + ");

(async () => {
  if (refs.length !== 2) throw new Error("give exactly two booking references, e.g. NY-20260919-03 NY-20260919-11");

  const db = new PrismaClient();
  try {
    const a = await group(db, refs[0]);
    const b = await group(db, refs[1]);
    if (!a) throw new Error("no booking " + refs[0]);
    if (!b) throw new Error("no booking " + refs[1]);

    console.log("\n" + show(a) + "\n" + show(b) + "\n");

    // Say out loud why these were thought to be one person, so the operator is
    // agreeing with a stated reason rather than with the fact that a script ran.
    const evidence = looksLikeSamePerson(
      { ...(a.inquiry || a.booking), name: a.name, date: a.date, packageId: (a.inquiry || a.booking).packageId, status: "booked" },
      { ...(b.inquiry || b.booking), name: b.name, date: b.date, packageId: (b.inquiry || b.booking).packageId, status: "booked" },
    );
    console.log("  why they look like one person: "
      + (evidence ? evidence.confidence + " \u2014 " + evidence.reasons.join("; ")
                  : "NOTHING MATCHES. Check this is really the same guest."));

    // BOTH PAID IS NOT A DUPLICATE TO TIDY AWAY. It is either two real bookings
    // or one person charged twice, and merging would bury whichever it is --
    // along with somebody's refund.
    if (a.paid && a.money > 0 && b.paid && b.money > 0) {
      console.log("\n  REFUSING: both have money against them ($" + a.money + " and $" + b.money + ").");
      console.log("  That is two payments, not a duplicate row. Either they are two real");
      console.log("  bookings, or one guest was charged twice and is owed a refund. Settle");
      console.log("  that in Stripe first.");
      process.exitCode = 1;
      return;
    }

    // The row holding the money survives; it is the one Stripe, the ledger and
    // the guest's confirmation all point at. Failing that, the older row, which
    // is the one whose booking number has already been said out loud.
    let keep = a.paid ? a : b.paid ? b : (a.created <= b.created ? a : b);
    let drop = keep === a ? b : a;
    if (KEEP) {
      const forced = [a, b].find((g) => g.ref === KEEP.toUpperCase());
      if (!forced) throw new Error("--keep " + KEEP + " is not one of the two");
      keep = forced; drop = keep === a ? b : a;
    }
    if (drop.paid && drop.money > 0) throw new Error("refusing to drop " + drop.ref + ", which holds $" + drop.money);

    console.log("\n  KEEP  " + keep.ref + "   (" + (keep.paid ? "holds the money" : KEEP ? "you chose it" : "booked first") + ")");
    console.log("  DROP  " + drop.ref);

    // Fill blanks only. Anything already on the surviving row was put there by
    // somebody who knew more than this script does.
    const fill = {};
    const from = drop.booking || drop.inquiry;
    const onto = keep.booking || keep.inquiry;
    for (const field of ["email", "phone", "packageId", "packageName", "partySize", "vesselId", "vesselName"]) {
      const value = from[field];
      if (value != null && value !== "" && (onto[field] == null || onto[field] === "")) fill[field] = value;
    }

    console.log("\n  onto " + keep.ref + ":");
    if (Object.keys(fill).length) {
      for (const [k, v] of Object.entries(fill)) console.log("      " + k.padEnd(13) + "(blank) -> " + v);
    } else {
      console.log("      nothing to fill \u2014 it already has everything the other row knew");
    }
    const carried = (from.note || from.message || "").trim();
    console.log("      note          += merged from " + drop.ref + (carried ? " (carrying its note)" : ""));
    console.log("\n  onto " + drop.ref + ":");
    console.log("      status        -> cancelled  (kept, not deleted)");
    console.log("      note          += merged into " + keep.ref);

    if (!APPLY) { console.log("\n  preview only. re-run with --apply\n"); return; }

    const stamp = new Date().toISOString().slice(0, 10);
    const keepNote = "Merged " + drop.ref + " into this booking on " + stamp
      + ": the same guest was recorded twice for " + keep.date + "."
      + (carried ? " Carried over from " + drop.ref + ': "' + carried.replace(/\s+/g, " ").slice(0, 300) + '"' : "");
    const dropNote = "Duplicate of " + keep.ref + ", merged into it on " + stamp
      + ". Cancelled rather than deleted so the merge stays visible. This row holds no money.";

    if (keep.booking) {
      await db.externalBooking.update({
        where: { id: keep.booking.id },
        data: { ...fill, note: ((keep.booking.note || "").trim() + "\n" + keepNote).trim() },
      });
    }
    if (drop.booking) {
      await db.externalBooking.update({
        where: { id: drop.booking.id },
        data: { status: "cancelled", note: ((drop.booking.note || "").trim() + "\n" + dropNote).trim() },
      });
    }
    if (drop.inquiry) {
      await db.inquiry.update({ where: { id: drop.inquiry.id }, data: { status: "cancelled" } });
    }

    console.log("\n  MERGED\n");
    const after = await group(db, keep.ref);
    const gone = await group(db, drop.ref);
    console.log(show(after));
    console.log("  " + gone.ref.padEnd(17) + "now: "
      + [gone.inquiry && gone.inquiry.status, gone.booking && gone.booking.status].filter(Boolean).join(" / "));
  } finally { await db.$disconnect(); }
})().catch((e) => { console.error("\n  ERR " + e.message + "\n"); process.exitCode = 1; });
