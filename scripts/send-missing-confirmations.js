// Everybody who has paid and has never been told.
//
//   node scripts/send-missing-confirmations.js            who is owed one
//   node scripts/send-missing-confirmations.js --apply    send them
//
// WHY THIS KEEPS BEING NEEDED. The webhook fired the confirmation without
// awaiting it. On a serverless function the platform freezes everything the
// moment the response goes back to Stripe, so the request to Resend was killed
// in flight -- no error, no retry, on a payment that had otherwise gone
// perfectly. The database write survived because IT was awaited.
//
// That is why it looked random. Slade's confirmation went. Carlyn's, Jim's,
// Josh's and Stephen's did not. Same code, same kind of payment, different
// outcome, which is exactly the signature of a promise nobody waited for.
//
// The webhook is fixed. This exists for the guests stranded before it was, and
// for the next time something between here and Resend goes quiet -- because the
// thing that matters is not that the send failed, it is that nobody knew.
//
// It reads the same question scripts/check-output.js asks every morning: paid,
// with money against it, and no confirmationSentAt. One charter written as two
// rows is counted once.
require("C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI/paths.js").loadSecrets();
const APP = "C:/Users/immex/Documents/Nauti-yachti-app";
const { PrismaClient } = require(APP + "/node_modules/@prisma/client");
const { sendBookingConfirmationEmail } = require(APP + "/lib/email");
const APPLY = process.argv.includes("--apply");

// Production has these; this machine does not. Sending from here must produce
// the same email the site would, not a degraded one.
process.env.DOCK_ADDRESS = process.env.DOCK_ADDRESS || "12198 Pearl Bay Ct, Conroe, TX 77304";

function asEmailBooking(row, kind) {
  if (kind === "inquiry") return row;
  return {
    name: row.guestName, email: row.email, phone: row.phone,
    date: row.date, hours: row.hours, partySize: row.partySize,
    startTime: row.startTime, packageId: row.packageId, packageName: row.packageName,
    vesselId: row.vesselId, vesselName: row.vesselName, bookingId: row.bookingId,
    priceQuoted: row.pricePaid != null ? row.pricePaid : row.priceQuoted,
  };
}

(async () => {
  const db = new PrismaClient();
  try {
    const owed = [];

    const inquiries = await db.inquiry.findMany({ where: { paymentStatus: "paid", confirmationSentAt: null } });
    for (const r of inquiries) {
      if (!(Number(r.priceQuoted) > 0)) continue; // nothing was charged
      owed.push({ kind: "inquiry", row: r, ref: r.bookingId, who: r.name, to: r.email });
    }

    // A website charter is two rows sharing a number, and the inquiry is the one
    // that carries the stamp. Telling the guest twice is worse than late.
    const told = new Set(inquiries.map((r) => r.bookingId).filter(Boolean));
    const alreadyStamped = new Set(
      (await db.inquiry.findMany({ where: { confirmationSentAt: { not: null } }, select: { bookingId: true } }))
        .map((r) => r.bookingId).filter(Boolean)
    );

    const bookings = await db.externalBooking.findMany({ where: { paymentStatus: "paid", confirmationSentAt: null } });
    for (const r of bookings) {
      if (!(Number(r.pricePaid) > 0)) continue; // the crew ride free
      if (r.bookingId && (told.has(r.bookingId) || alreadyStamped.has(r.bookingId))) continue;
      owed.push({ kind: "external", row: r, ref: r.bookingId, who: r.guestName, to: r.email });
    }

    if (!owed.length) { console.log("\n  nobody is waiting on a confirmation.\n"); return; }

    console.log("\n  " + owed.length + " guest(s) have paid and never been told:\n");
    for (const j of owed) {
      console.log("  " + String(j.ref).padEnd(17) + String(j.who).padEnd(20)
        + (j.to || "NO EMAIL ON FILE \u2014 nothing can be sent").padEnd(30) + "(" + j.kind + ")");
    }
    if (!APPLY) { console.log("\n  nothing sent. re-run with --apply\n"); return; }

    console.log("");
    for (const j of owed) {
      const r = await sendBookingConfirmationEmail(asEmailBooking(j.row, j.kind));
      console.log("  " + String(j.ref).padEnd(17) + JSON.stringify(r));
      if (!r || !r.sent) { console.log("      NOT RECORDED \u2014 the send failed, so nothing is written down."); continue; }
      const model = j.kind === "inquiry" ? db.inquiry : db.externalBooking;
      await model.update({ where: { id: j.row.id }, data: { confirmationSentAt: new Date() } });
      console.log("      confirmationSentAt stamped");
    }
  } finally { await db.$disconnect(); }
})().catch((e) => { console.error("  ERR " + e.message); process.exitCode = 1; });
