// The webhook must WAIT for anything it wants to actually happen.
//
//     node scripts/test-webhook-awaits.js
//
// This is a source check rather than a behavioural one, deliberately. The bug it
// guards against is invisible at runtime and invisible in review: the code reads
// perfectly, the tests pass, the payment succeeds, the row updates, and the
// guest hears nothing -- because a serverless function is frozen the instant its
// response goes back to Stripe, and a promise nobody awaited dies where it
// stands.
//
// It cost four guests before it was found. Slade's confirmation went; Carlyn,
// Jim, Josh and Stephen all paid and were told nothing. Same code, same kind of
// payment, different outcome, which is what sent everyone looking at Resend and
// at the email template instead of at the missing word.
//
// A returned promise that nobody waits for is not a background job here. There
// is no background.
const fs = require("fs");
const path = require("path");

const WEBHOOK = path.join(__dirname, "..", "app", "api", "webhooks", "stripe", "route.js");
const src = fs.readFileSync(WEBHOOK, "utf8");

// Anything that reaches the outside world and must finish before the response.
const MUST_AWAIT = [
  "sendBookingConfirmationEmail",
  "sendPaymentFailedEmail",
  "sendGiftCertificateEmail",
  "sendGiftCertificateOwnerEmail",
];

let pass = 0;
const fails = [];

for (const fn of MUST_AWAIT) {
  // Every call site, ignoring the import line and any mention in a comment.
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    const call = line.indexOf(fn + "(");
    if (call < 0) return;
    const before = line.slice(0, call);
    if (/require\(|^\s*(\/\/|\*)/.test(before) || /^\s*(\/\/|\*)/.test(line)) return;
    if (/\bconst\b|\bimport\b/.test(before)) return;

    if (/await\s*$/.test(before)) {
      pass++;
    } else {
      fails.push(fn + " is called without await at line " + (i + 1)
        + "\n        " + line.trim().slice(0, 90)
        + "\n        A promise nobody waits for is killed when the handler returns.");
    }
  });
}

if (!pass && !fails.length) {
  fails.push("found no call sites at all — has the webhook moved? This test is then blind.");
}

// And the guarantee the await must not break: an email that throws must never
// fail the webhook, or Stripe retries the payment forever.
for (const fn of ["sendBookingConfirmationEmail"]) {
  const idx = src.indexOf("await " + fn + "(");
  if (idx < 0) continue;
  const after = src.slice(idx, idx + 2600);
  if (after.includes(".catch(")) pass++;
  else fails.push(fn + " is awaited but its chain has no .catch — a mail outage would make Stripe retry the payment.");
}

console.log("\n  " + pass + " passed, " + fails.length + " failed");
for (const f of fails) console.log("   FAIL  " + f);
process.exitCode = fails.length ? 1 : 0;
