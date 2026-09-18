// Put a booking on the books that was agreed somewhere else, and hand back the
// text to send.
//
//   node scripts/add-booking.js --name "Josh Ramirez" --phone "(619) 248-2317" \
//        --package glowz --date 2026-09-19 --seats 1 --amount 20
//
//   node scripts/add-booking.js --name "Mia Torres" --phone 8325551234 \
//        --package tubing --date 2026-10-04 --seats 8 --vessel yachti --hours 4
//
// Runs as a PREVIEW unless --apply is given.
//
// WHY THIS EXISTS. Most of this business does not arrive through the website. It
// arrives as a forwarded contact card, a text, or a Facebook message, and until
// now each one was typed in by hand-writing a one-off script. Owner, 18 Sep
// 2026: "we should be able to upload these new direct bookings I send you so it
// works all the way through. I may be sending more direct contacts via here for
// any future glow party or regular reservations like wakeboarding or tubing."
//
// ALL THE WAY THROUGH means: the row is created with a package and a price, so
// /pay/<id> can charge it; the payment carries externalBookingId, so the webhook
// flips this exact row to paid; and paying writes the guest's email onto the row
// and sends the confirmation. Every link in that chain needs packageId and
// priceQuoted to be set at creation, which is the thing a hand-typed row most
// often lacks.
//
//   --name      required
//   --phone     required
//   --package   required, a Package id: glowz, tubing, partycove, night,
//               birthday, bachelor, corporate, wakesurf
//   --date      required, YYYY-MM-DD
//   --seats     party size (default 1)
//   --amount    what to charge IN TOTAL. Omit to price from the package.
//   --vessel    explorer | islander | yachti. Omit and the roomiest is chosen.
//   --hours     for the hourly packages; defaults to the package's fixedHours
//   --email     if known. Otherwise Stripe collects it at checkout.
//   --note      anything worth remembering about how it was agreed
//   --source    referralSource, default "Word of mouth"
require("C:/Users/immex/Documents/_MyFiles/Jarvis-Voice-UI/paths.js").loadSecrets();
const APP = "C:/Users/immex/Documents/Nauti-yachti-app";
const { PrismaClient } = require(APP + "/node_modules/@prisma/client");
const { phoneKey } = require(APP + "/lib/duplicateBooking");
const { quoteTotal, durationText } = require(APP + "/lib/pricing");
const { HOLDS_THE_DAY } = require(APP + "/lib/bookingStatus");
// A Package row keeps its price tables as JSON STRINGS; quoteTotal wants them
// parsed. lib/serialize is what every other caller uses to cross that gap, and
// re-parsing by hand here is how the booking form and the server came to
// disagree about a price once already.
const { parsePackage } = require(APP + "/lib/serialize");

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const val = (f) => { const i = argv.indexOf("--" + f); return i >= 0 ? argv[i + 1] : null; };

// Store numbers the way Stripe hands them back, so the same guest booked twice
// compares equal. See lib/duplicateBooking.
function e164(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return String(raw || "").trim();
}

(async () => {
  const name = val("name");
  const phone = val("phone");
  const packageId = val("package");
  const date = val("date");
  if (!name || !phone || !packageId || !date) {
    console.error("\n  --name, --phone, --package and --date are all required.");
    console.error("  Read the top of this file for the rest.\n");
    process.exitCode = 1;
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("\n  --date must be YYYY-MM-DD, got " + date + "\n");
    process.exitCode = 1;
    return;
  }

  const db = new PrismaClient();
  try {
    const raw = await db.package.findUnique({ where: { id: packageId } });
    const pkg = raw ? parsePackage(raw) : null;
    if (!pkg) {
      const all = await db.package.findMany({ select: { id: true } });
      console.error("\n  No package \"" + packageId + "\". Try: " + all.map((p) => p.id).join(", ") + "\n");
      process.exitCode = 1;
      return;
    }

    const seats = Number(val("seats") || 1);
    const hours = val("hours") != null ? Number(val("hours")) : (pkg.fixedHours ?? null);

    // WHO IS ALREADY ON THAT DAY. The duplicate check built this afternoon, used
    // on the way in rather than the morning after -- the cheapest moment to
    // catch a second row is before it exists.
    const key = phoneKey(phone);
    // ONE CHARTER CAN BE TWO ROWS. A website checkout writes an inquiry and a
    // mirror booking sharing a booking number, and counting both puts a party of
    // two on the boat twice. app/glow/page.js had exactly this bug and told the
    // public there were four seats left when there were six.
    const seen = new Set();
    const sameDay = [];
    for (const r of [
      ...(await db.externalBooking.findMany({ where: { date } })),
      ...(await db.inquiry.findMany({ where: { date } })),
    ]) {
      if (r.bookingId) {
        if (seen.has(r.bookingId)) continue;
        seen.add(r.bookingId);
      }
      sameDay.push(r);
    }
    const clash = sameDay.filter((r) => r.status !== "cancelled"
      && (phoneKey(r.phone) === key
        || String(r.guestName || r.name || "").trim().toLowerCase() === name.trim().toLowerCase()));
    if (clash.length) {
      console.error("\n  REFUSING: somebody is already on " + date + " with that number or name:");
      for (const r of clash) console.error("      " + r.bookingId + "  " + (r.guestName || r.name) + "  " + (r.phone || ""));
      console.error("\n  If this really is a second booking, add --force.\n");
      if (!argv.includes("--force")) { process.exitCode = 1; return; }
    }

    // A vessel with room, unless one was named. Capacity INCLUDES the captain --
    // the easiest thing on this whole system to get wrong.
    let vesselId = val("vessel");
    const vessels = await db.vessel.findMany({ orderBy: { sortOrder: "asc" } });
    if (!vesselId) {
      const taken = {};
      for (const r of sameDay) {
        // AN OPEN INQUIRY IS NOT A SEAT. Somebody who filled the form and never
        // paid is a lead, not a passenger -- counting them would have said the
        // Explorer was carrying 18 on the night it was carrying 15, and pushed
        // real guests onto a boat that had room. HOLDS_THE_DAY is the same
        // vocabulary the availability calendar uses.
        if (!HOLDS_THE_DAY.includes(r.status) || !r.vesselId) continue;
        taken[r.vesselId] = (taken[r.vesselId] || 0) + (Number(r.partySize) || 0);
      }
      const room = vessels
        .map((v) => ({ v, free: (v.capacity - 1) - (taken[v.id] || 0) }))
        .sort((a, b) => b.free - a.free);
      vesselId = room[0] && room[0].free >= seats ? room[0].v.id : (room[0] && room[0].v.id);
      if (room[0]) {
        console.log("\n  vessel not given \u2014 picked " + room[0].v.name
          + " (" + room[0].free + " seats free of " + (room[0].v.capacity - 1) + ")");
      }
    }
    const vessel = vessels.find((v) => v.id === vesselId);
    if (!vessel) {
      console.error("\n  No vessel \"" + vesselId + "\". Try: " + vessels.map((v) => v.id).join(", ") + "\n");
      process.exitCode = 1;
      return;
    }

    // THE PRICE. --amount is a total and wins, because the owner's circle rate
    // is not a discount the pricing code knows about and never should be: it is
    // not offered on the website and must not leak into a public quote.
    let amount = val("amount") != null ? Number(val("amount")) : null;
    let pricedBy = "--amount";
    if (amount == null) {
      amount = quoteTotal(pkg, [], { date, vesselId, hours, partySize: seats });
      pricedBy = "the package";
    }
    if (amount == null || !(amount >= 0)) {
      console.error("\n  Could not price " + pkg.name + " for " + seats + " on " + vessel.name
        + (hours ? " for " + hours + " hours" : "") + ".");
      console.error("  Pass --amount <dollars>, or check --hours against what that package offers.\n");
      process.exitCode = 1;
      return;
    }

    const prefix = "NY-" + date.replace(/-/g, "") + "-";
    const used = [
      ...(await db.externalBooking.findMany({ where: { bookingId: { startsWith: prefix } }, select: { bookingId: true } })),
      ...(await db.inquiry.findMany({ where: { bookingId: { startsWith: prefix } }, select: { bookingId: true } })),
    ].map((r) => parseInt(r.bookingId.slice(prefix.length), 10)).filter((n) => !Number.isNaN(n));
    const bookingId = prefix + String(Math.max(0, ...used) + 1).padStart(2, "0");

    const data = {
      guestName: name.trim(),
      phone: e164(phone),
      email: val("email") || null,
      partySize: seats,
      priceQuoted: amount,
      packageId: pkg.id,
      packageName: pkg.name,
      vesselId: vessel.id,
      vesselName: vessel.name,
      date,
      hours,
      startTime: val("start") || (pkg.id === "glowz" ? "17:00" : null),
      platform: "Direct",
      status: "booked",
      paymentStatus: "unpaid",
      referralSource: val("source") || "Word of mouth",
      bookingId,
      note: (pkg.name + " \u2014 " + seats + (seats === 1 ? " seat" : " seats") + ", $" + amount + " total. "
        + "Added by the owner " + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        + " from a direct contact; not through the website or a platform. "
        + "Priced by " + pricedBy + "."
        + (val("note") ? "\n" + val("note") : "")),
    };

    console.log("\n  " + bookingId + "   " + data.guestName + "   " + data.phone);
    console.log("      " + data.packageName + (durationText(pkg) ? " \u2014 " + durationText(pkg) : ""));
    console.log("      " + data.vesselName + ", " + date + (data.startTime ? " " + data.startTime : ""));
    console.log("      " + seats + (seats === 1 ? " seat" : " seats") + "   $" + amount + " total   (priced by " + pricedBy + ")");
    console.log("      unpaid");

    if (!APPLY) { console.log("\n  nothing written. re-run with --apply\n"); return; }

    const created = await db.externalBooking.create({ data });
    const { bookingLinkMessage } = require(APP + "/lib/guestTexts");
    console.log("\n  CREATED " + created.bookingId);
    console.log("\n  SEND THIS:\n");
    console.log("  " + bookingLinkMessage(created) + "\n");
    console.log("  That link never expires \u2014 it mints a fresh Stripe checkout each time");
    console.log("  it is opened. When they pay, " + created.bookingId + " flips to paid, their");
    console.log("  email is captured, and the confirmation goes out on its own.\n");
  } finally { await db.$disconnect(); }
})().catch((e) => { console.error("\n  ERR " + e.message + "\n"); process.exitCode = 1; });
