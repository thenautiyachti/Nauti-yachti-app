// A guest must be told where THEIR boat is, not where the business is.
//
//     node scripts/test-dock-address.js
//
// Owner, 18 Sep 2026: "for the explorer pearl Bay is the address. And the other
// two boats have the other dock location." And, on the glow night: "The glow
// party, all pickup locations will be at scotts ridge."
//
// Two failures sit behind this file. Slade Deliberto paid for two glow seats on
// the morning of the 18th and was emailed 12198 Pearl Bay Ct -- a private gated
// residence across the lake from the Scott's Ridge ramp his boat was leaving
// from -- with a gate code promised that does not exist there. And underneath
// that, quietly since 5 Sep, DOCK_ADDRESS was a single value printed for every
// booking, so two thirds of the fleet had been mailing guests to the wrong
// shore without anybody noticing, because nobody on those two boats had paid by
// card yet.
//
// The email is rendered rather than inspected. A test that read dockAddressFor
// directly would have passed on the day the bug shipped: the address was right,
// the email that used it was not.
const { sendBookingConfirmationEmail } = require("../lib/email");

// Exactly what production holds. DOCK_ADDRESS means the Explorer's, which is
// what it has always meant; the west dock is deliberately left unset so the
// no-address path is the one under test rather than an untested fallback.
process.env.RESEND_API_KEY = "test-only";
process.env.DOCK_ADDRESS = "12198 Pearl Bay Ct, Conroe, TX 77304";
delete process.env.DOCK_ADDRESS_ISLANDER;
delete process.env.DOCK_ADDRESS_YACHTI;
delete process.env.DOCK_ADDRESS_EXPLORER;

let captured = null;
global.fetch = async (url, opts) => {
  captured = JSON.parse(opts.body);
  return { ok: true, status: 200, text: async () => "", json: async () => ({}) };
};

let pass = 0;
const fails = [];
function ok(label, got, want) {
  if (got === want) pass++;
  else fails.push(label + "  expected " + JSON.stringify(want) + ", got " + JSON.stringify(got));
}

const BASE = {
  name: "Test Guest", email: "nobody@example.com", date: "2026-10-03",
  hours: 4, partySize: 6, startTime: "10:00", priceQuoted: 700,
  packageId: "tubing-wakeboarding", packageName: "Tubing & Wakeboarding Charter",
};

async function render(extra) {
  captured = null;
  await sendBookingConfirmationEmail(Object.assign({}, BASE, extra));
  const html = captured ? captured.html : "";
  return {
    html,
    pearlBay: html.includes("Pearl Bay Ct"),
    scottsRidge: html.includes("Scott's Ridge"),
    gatePromise: html.includes("gate code on the morning"),
    noAddress: html.includes("We'll be in touch"),
  };
}

(async () => {
  // --- the Explorer is the one boat at Pearl Bay ----------------------------
  const explorer = await render({ vesselId: "explorer", vesselName: "Nauti Explorer" });
  ok("the Explorer gets Pearl Bay", explorer.pearlBay, true);
  ok("Pearl Bay is gated, so the code is promised", explorer.gatePromise, true);

  // --- the other two are three miles WSW and have no address set yet --------
  //
  // NO ADDRESS BEATS THE WRONG ADDRESS. Falling back to DOCK_ADDRESS would put
  // these guests back on the wrong side of the lake, and a confidently wrong
  // address is the one failure a guest cannot catch before they are driving.
  for (const [id, name] of [["islander", "Nauti Islander"], ["yachti", "Nauti Yachti"]]) {
    const r = await render({ vesselId: id, vesselName: name });
    ok(name + " is NOT sent to Pearl Bay", r.pearlBay, false);
    ok(name + " is told we will be in touch", r.noAddress, true);
    // A dock nobody has described is not described, and a gate nobody has
    // confirmed is not promised.
    ok(name + " is promised no gate code", r.gatePromise, false);
  }

  // --- a row that carries the name but not the id ---------------------------
  //
  // The mirror ExternalBooking rows and the object the Stripe webhook builds by
  // hand have each been one or the other, so the name has to work alone.
  ok("the Explorer by name alone still gets Pearl Bay",
    (await render({ vesselName: "Nauti Explorer" })).pearlBay, true);
  ok("the Islander by name alone is still not sent there",
    (await render({ vesselName: "Nauti Islander" })).pearlBay, false);

  // --- no vessel at all ------------------------------------------------------
  const nameless = await render({});
  ok("a booking with no boat names no dock", nameless.pearlBay, false);
  ok("a booking with no boat says we will be in touch", nameless.noAddress, true);

  // --- glow beats the boat ---------------------------------------------------
  //
  // Owner, 18 Sep 2026: "The glow party, all pickup locations will be at scotts
  // ridge." So the package decides, and it decides for all three boats -- the
  // Explorer included, which is the one whose own dock address IS set and would
  // otherwise win.
  for (const [id, name] of [["explorer", "Nauti Explorer"], ["islander", "Nauti Islander"], ["yachti", "Nauti Yachti"]]) {
    const r = await render({ vesselId: id, vesselName: name, packageId: "glowz", packageName: "Boatz & Glowz Package" });
    ok("glow on the " + name + " meets at Scott's Ridge", r.scottsRidge, true);
    ok("glow on the " + name + " is never sent to the dock", r.pearlBay, false);
    ok("glow on the " + name + " is promised no gate code", r.gatePromise, false);
  }

  // Recognised by name when the id is missing, which is how the mirror rows
  // reach this function.
  ok("glow recognised by package name alone",
    (await render({ vesselId: "explorer", vesselName: "Nauti Explorer", packageName: "Boatz & Glowz Package" })).scottsRidge,
    true);

  // --- the time the boat leaves ----------------------------------------------
  //
  // The email said "arrive 15 minutes before your start time" and never said
  // what the start time was: the one number a guest needs, missing from the
  // message they keep. Stated once, not twice.
  const timed = await render({ vesselId: "explorer", vesselName: "Nauti Explorer" });
  ok("an ordinary charter states its start time", timed.html.includes("10:00 AM"), true);
  ok("and states it once", (timed.html.match(/10:00 AM/g) || []).length, 1);

  const glowTimes = await render({ vesselId: "yachti", vesselName: "Nauti Yachti", packageId: "glowz", packageName: "Boatz & Glowz Package" });
  ok("glow states its check-in", glowTimes.html.includes("4:30 PM"), true);
  ok("glow states its rope-off", glowTimes.html.includes("5:00 PM"), true);

  // A malformed startTime must omit the line, never render NaN at a guest.
  const junk = await render({ vesselId: "explorer", vesselName: "Nauti Explorer", startTime: "not a time" });
  ok("a malformed start time renders nothing rather than NaN", /NaN|undefined/.test(junk.html), false);

  console.log("\n  " + pass + " passed, " + fails.length + " failed");
  for (const f of fails) console.log("   FAIL  " + f);
  process.exitCode = fails.length ? 1 : 0;
})().catch((e) => { console.error("  ERR " + e.message); process.exitCode = 1; });
