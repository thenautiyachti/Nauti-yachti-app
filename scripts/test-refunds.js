// What a Stripe refund does to a booking, and the gift certificate emails.
//
// Owner, 1 Oct 2026: a refunded status ("if that ever happens"), and "We
// definitely have to fix the gift certificates": the recipient emailed, the
// owner told once, with the real amount.
const { isFullRefund, refundUpdate, alreadyRecorded } = require("../lib/refunds");
const { STATUSES, holdsTheDay, isOff, INQUIRY_STATUS_BUCKET } = require("../lib/bookingStatus");
const { seatClass } = require("../lib/eventSeats");
const { owedCharters } = require("../lib/owedCharters");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(62) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "  want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

(async () => {
  console.log("\n  THE STATUS\n");
  ok("refunded is a status", STATUSES.includes("refunded"), true);
  ok("the inquiry side speaks it too", INQUIRY_STATUS_BUCKET.refunded, "refunded");
  ok("it holds no day", holdsTheDay("refunded"), false);
  ok("it holds no seat", seatClass("refunded", "external"), null);
  ok("it is off", isOff("refunded"), true);
  ok("a refunded charter is never an owed one",
    owedCharters([{ status: "refunded", pricePaid: 500, date: "2026-07-01" }], "2026-10-01").length, 0);
  ok("  while the same row cancelled still is (a refund question)",
    owedCharters([{ status: "cancelled", pricePaid: 500, date: "2026-07-01" }], "2026-10-01").length, 1);

  console.log("\n  A REFUND FROM STRIPE\n");
  ok("all of it is full", isFullRefund({ charged: 200, refunded: 200 }), true);
  ok("Stripe saying so is full", isFullRefund({ charged: 200, refunded: 0, stripeSaysFull: true }), true);
  ok("some of it is partial", isFullRefund({ charged: 200, refunded: 50 }), false);

  const booking = { id: "b1", status: "booked", note: "Booked by text." };
  const fullB = refundUpdate({ row: booking, kind: "external", charged: 200, refunded: 200, full: true, day: "2026-10-02" });
  ok("full: booking is marked refunded", [fullB.status, fullB.paymentStatus], ["refunded", "refunded"]);
  ok("full: pricePaid becomes the net", fullB.pricePaid, 0);
  ok("full: the original amount stays in the note",
    fullB.note, "Booked by text.\nRefunded $200.00 of $200.00 in full through Stripe on 2026-10-02.");

  const partB = refundUpdate({ row: booking, kind: "external", charged: 200, refunded: 50, full: false, day: "2026-10-02" });
  ok("partial: status left alone", partB.status, undefined);
  ok("partial: pricePaid becomes the net", partB.pricePaid, 150);

  const inq = refundUpdate({ row: { id: "i1", status: "booked" }, kind: "inquiry", charged: 100, refunded: 100, full: true });
  ok("full on an inquiry: refunded, type and amount recorded",
    [inq.status, inq.paymentStatus, inq.refundType, inq.refundAmount], ["refunded", "refunded", "full", 100]);

  const after = { ...booking, ...fullB };
  ok("a Stripe retry is recognised and changes nothing",
    alreadyRecorded({ row: after, kind: "external", refunded: 200, full: true }), true);
  ok("  and a second partial refund is not mistaken for the first",
    alreadyRecorded({ row: { ...booking, ...partB }, kind: "external", refunded: 80, full: false }), false);
  const twice = refundUpdate({ row: after, kind: "external", charged: 200, refunded: 200, full: true, day: "2026-10-02" });
  ok("  and the note line is never written twice", twice.note, undefined);

  console.log("\n  GIFT CERTIFICATE EMAILS\n");
  // Every send captured instead of sent.
  const sent = [];
  process.env.RESEND_API_KEY = "test";
  process.env.OWNER_EMAIL = "owner@example.com";
  global.fetch = async (url, opts) => {
    sent.push(JSON.parse(opts.body));
    return { ok: true, text: async () => "" };
  };
  const { sendGiftCertificateEmail, sendGiftCertificateOwnerEmail } = require("../lib/email");
  const cert = {
    code: "NY-GIFT-TEST01", initialAmount: 250, balance: 250,
    purchaserName: "Pat Buyer", purchaserEmail: "pat@example.com",
    recipientName: "Sam Friend", recipientEmail: "sam@example.com", message: "Happy birthday",
  };
  const delivery = await sendGiftCertificateEmail(cert);
  await sendGiftCertificateOwnerEmail(cert, delivery);
  const to = sent.map((m) => m.to[0]);
  ok("the buyer gets the certificate", to.includes("pat@example.com"), true);
  ok("the person it is for gets it too", to.includes("sam@example.com"), true);
  ok("the owner is told exactly once", to.filter((t) => t === "owner@example.com").length, 1);
  const owner = sent.find((m) => m.to[0] === "owner@example.com");
  ok("the owner's notice states the real amount", owner.subject.includes("$250.00"), true);
  ok("  and no blank dash for it", /Value: \$250\.00/.test(owner.text), true);
  ok("  and says who it reached", /recipient \(sam@example\.com\) sent/.test(owner.text), true);
  const toSam = sent.find((m) => m.to[0] === "sam@example.com");
  ok("the recipient is told who it is from", /Pat Buyer has sent you a gift certificate/.test(toSam.text), true);

  sent.length = 0;
  await sendGiftCertificateEmail({ ...cert, recipientEmail: "PAT@example.com" });
  ok("a recipient address that is the buyer's own is sent once", sent.length, 1);

  console.log("\n  " + pass + " passed, " + fail + " failed\n");
  process.exit(fail ? 1 : 0);
})();
