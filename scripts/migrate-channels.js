// Move the existing 77 bookings onto the three-field vocabulary.
//
//   node migrate-channels.js            what it would change, row by row
//   node migrate-channels.js --confirm  change it
//
// WHAT IS DELIBERATELY NOT DONE: no payment method is invented. Not one row
// gets "Cash" from this script, because no row anywhere proves cash changed
// hands -- that is the owner's whole point, and the reason the ledger was
// wrong. Historical platform payouts ARE knowable (a Boatsetter booking was
// paid by Boatsetter), so those are set; everything else is left null for him
// to assert.
const PATHS = { secrets: "C:/Users/immex/.secrets/nauti-yachti.env" };
require("C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI/node_modules/dotenv")
  .config({ path: PATHS.secrets });
const { Pool } = require("C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI/node_modules/pg");
const APP = require("path").join(__dirname, "..");
const { normaliseChannel, normaliseLeadSource } = require(APP + "/lib/channels.js");

const CONFIRM = process.argv.includes("--confirm");

// Only where the payout IS the payment, which is true by definition for the
// two booking platforms. Everything else stays null.
function knownPaymentMethod(b) {
  const channel = normaliseChannel(b.platform);
  if (channel === "Boatsetter") return "Boatsetter payout";
  if (channel === "GetMyBoat") return "GetMyBoat payout";
  // A website booking that carries a Stripe session really was paid by card.
  if (channel === "Website" && b.stripeSessionId) return "Stripe (card)";
  return null;
}

(async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } });

  const rows = (await p.query(
    `SELECT "id","bookingId","guestName","platform","referralSource","stripeSessionId",
            "paymentMethod","status","pricePaid"
       FROM "ExternalBooking" ORDER BY "date" DESC`)).rows;

  const changes = [];
  for (const b of rows) {
    const nextChannel = normaliseChannel(b.platform);
    const nextLead = normaliseLeadSource(b.referralSource);
    const nextPay = b.paymentMethod || knownPaymentMethod(b);

    const d = {};
    if (nextChannel && nextChannel !== b.platform) d.platform = nextChannel;
    if (nextLead !== b.referralSource) d.referralSource = nextLead;
    if (nextPay && nextPay !== b.paymentMethod) d.paymentMethod = nextPay;
    if (Object.keys(d).length) changes.push({ b, d });
  }

  const col = (v) => String(v === null ? "(null)" : v);
  console.log("\n  " + changes.length + " of " + rows.length + " bookings would change\n");
  for (const { b, d } of changes.slice(0, 80)) {
    const bits = Object.entries(d).map(([k, v]) =>
      k + ": " + col(b[k]) + " -> " + col(v));
    console.log("    " + String(b.bookingId || b.id.slice(0, 10)).padEnd(17)
      + String(b.guestName || "").slice(0, 16).padEnd(17) + bits.join("   "));
  }

  const tally = {};
  changes.forEach(({ d }) => Object.keys(d).forEach((k) => { tally[k] = (tally[k] || 0) + 1; }));
  console.log("\n  fields touched: "
    + Object.entries(tally).map(([k, n]) => k + " x" + n).join(", "));
  const noPay = rows.filter((b) => !(b.paymentMethod || knownPaymentMethod(b)));
  console.log("  left WITHOUT a payment method, for you to assert: " + noPay.length
    + " (of which completed & paid: "
    + noPay.filter((b) => b.status === "completed" && Number(b.pricePaid) > 0).length + ")");

  if (!CONFIRM) { console.log("\n  dry run. add --confirm\n"); await p.end(); return; }

  for (const { b, d } of changes) {
    const keys = Object.keys(d);
    await p.query(
      `UPDATE "ExternalBooking" SET ${keys.map((k, i) => `"${k}"=$${i + 2}`).join(",")} WHERE "id"=$1`,
      [b.id, ...keys.map((k) => d[k])]);
  }
  console.log("\n  " + changes.length + " row(s) updated");
  await p.end();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
