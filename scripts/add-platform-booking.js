// Put a Boatsetter or GetMyBoat booking on the books from its confirmation email.
//
//   node scripts/add-platform-booking.js --platform getmyboat --ref 6090776 \
//        --name "Sue F" --date 2026-10-04 --start 14:00 --hours 2 --guests 10 \
//        --payout 283.20 --renter-paid 381.60 --vessel explorer
//
// Runs as a PREVIEW unless --apply is given.
//
// WHY THIS EXISTS. Owner, 3 Oct 2026, on a GetMyBoat reservation that had not
// reached the system: "add it now and make it automatic from now on." Penny
// reads the platform mail every morning; this is what she runs when she finds a
// confirmation that is not on the books yet.
//
// WHAT A PLATFORM BOOKING IS, and why it is not add-booking.js: the platform
// took the guest's money and pays the business later (GetMyBoat in one sum,
// Boatsetter in legs), and it shares no phone or email. So there is no payment
// link to send, no phone to require, and the price on the row is what the
// business is PAID (owner-console-manual 3.6), not what the guest paid.
//
// It only ever CREATES a booking. It never edits one, never touches the ledger,
// and refuses when the platform reference is already on the books, or when the
// boat is already booked over those hours.
//
//   --platform   getmyboat | boatsetter                       required
//   --ref        the platform's reservation number            required
//   --name       the guest as the platform shows them         required
//   --date       YYYY-MM-DD                                   required
//   --start      HH:MM, 24-hour                               required
//   --hours      charter length                               required
//   --guests     party size                                   required
//   --payout     what the platform pays us, in dollars        required
//   --vessel     explorer | islander | yachti                 required
//   --renter-paid  what the guest paid the platform (noted, not stored as price)
//   --listing    the platform listing's title (noted)
//   --note       anything else worth keeping
//
//   --gmb-email <file>  READ EVERYTHING FROM A GETMYBOAT "Booking Confirmed!" EMAIL
//                saved as plain text. Fills platform, ref, name, date, start,
//                hours, guests, payout, renter-paid, listing and vessel; any flag
//                given as well overrides it. This is what Penny uses: a person
//                copying seven fields by hand is where a booking goes wrong.
require("C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/AI & Website/Crew/_Scripts/paths.js").loadSecrets();
const APP = "C:/Users/immex/Documents/Nauti-yachti-app";
const { PrismaClient } = require(APP + "/node_modules/@prisma/client");
const { HOLDS_THE_DAY } = require(APP + "/lib/bookingStatus");
const { generateBookingId } = require(APP + "/lib/bookingId");

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const flagVal = (f) => { const i = argv.indexOf("--" + f); return i >= 0 ? argv[i + 1] : null; };
// Filled from --gmb-email at the start of the run (after GMB_LISTINGS exists).
let fromEmail = {};
function loadEmail() {
  if (!flagVal("gmb-email")) return;
  try { fromEmail = parseGetMyBoat(require("fs").readFileSync(flagVal("gmb-email"), "utf8")); }
  catch (e) { die(e.message); }
  if (fromEmail.listing && !fromEmail.vessel) {
    die("UNKNOWN LISTING \"" + fromEmail.listing + "\": not adding it. Tell the owner which boat it is, and add it to GMB_LISTINGS.");
  }
}
const val = (f) => flagVal(f) != null ? flagVal(f) : (fromEmail[f] != null ? String(fromEmail[f]) : null);
const PLATFORMS = { getmyboat: { platform: "GetMyBoat", paidBy: "GetMyBoat payout" }, boatsetter: { platform: "Boatsetter", paidBy: "Boatsetter payout" } };
// Which boat each GetMyBoat listing is. Established 3 Oct 2026 from the
// listings' own booking history: every "Turning Your Celebrations" booking
// (11 Jul to 22 Aug 2026) sailed on the Yachti, and "Ready to Set Sail" lists
// Pearl Bay, the Explorer's dock. A listing not here is refused, never guessed.
const GMB_LISTINGS = [
  [/Turning Your Celebrations Into Unforgettable Memories/i, "yachti"],
  [/Ready to Set Sail with a Captain/i, "explorer"],
];

function parseGetMyBoat(text) {
  const t = String(text).replace(/\r/g, "");
  const out = { platform: "getmyboat" };
  const m = (re) => (t.match(re) || [])[1];
  if (!/Booking Confirmed/i.test(t)) throw new Error("not a GetMyBoat \"Booking Confirmed\" email");
  const first = m(/^\s*(\S+) just confirmed payment for/im);
  if (first) out.name = first.charAt(0).toUpperCase() + first.slice(1);
  const pay = m(/Your Payout:\s*USD\s*\$([\d,.]+)/i); if (pay) out.payout = pay.replace(/,/g, "");
  const rent = m(/Renter Payments:\s*USD\s*\$([\d,.]+)/i); if (rent) out["renter-paid"] = rent.replace(/,/g, "");
  const listing = m(/Listing:\s*[“"](.+?)[”"]/i); if (listing) out.listing = listing;
  const dep = t.match(/Depart:\s*(\d{1,2})\s+(\w{3})\w*\s+(\d{4})\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (dep) {
    const mon = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }[dep[2].toLowerCase()];
    let h = Number(dep[4]) % 12; if (/PM/i.test(dep[6])) h += 12;
    out.date = dep[3] + "-" + String(mon).padStart(2, "0") + "-" + String(dep[1]).padStart(2, "0");
    out.start = String(h).padStart(2, "0") + ":" + (dep[5] || "00");
  }
  const dur = m(/Duration:\s*([\d.]+)\s*hour/i); if (dur) out.hours = dur;
  const grp = m(/Group Size:\s*(\d+)\s*Guest/i); if (grp) out.guests = grp;
  // The reservation number sits inside a click-tracking link: its p= parameter
  // is base64 JSON whose "url" is getmyboat.com/inbox/<number>/.
  for (const enc of t.match(/[?&]p=([A-Za-z0-9_-]+)/g) || []) {
    try {
      const dec = Buffer.from(enc.replace(/^[?&]p=/, "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8").replace(/\\/g, "");
      const ref = (dec.match(/getmyboat\.com\/inbox\/(\d+)/i) || [])[1];
      if (ref) { out.ref = ref; break; }
    } catch { /* not this link */ }
  }
  if (out.listing) { const hit = GMB_LISTINGS.find(([re]) => re.test(out.listing)); if (hit) out.vessel = hit[1]; }
  return out;
}

const die = (msg) => { console.error("\n  " + msg + "\n"); process.exit(1); };
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };

(async () => {
  loadEmail();
  const p = PLATFORMS[String(val("platform") || "").toLowerCase()];
  if (!p) die("--platform must be getmyboat or boatsetter");
  for (const f of ["ref", "name", "date", "start", "hours", "guests", "payout", "vessel"]) if (val(f) == null) die("--" + f + " is required. Read the top of this file.");
  const date = val("date"), start = val("start"), hours = Number(val("hours")), guests = Number(val("guests")), payout = Number(val("payout"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die("--date must be YYYY-MM-DD");
  if (!/^\d{1,2}:\d{2}$/.test(start)) die("--start must be HH:MM, 24-hour");
  if (!(hours > 0) || !(guests > 0) || !(payout >= 0)) die("--hours, --guests and --payout must be numbers");
  const ref = String(val("ref")).trim();

  const db = new PrismaClient();
  try {
    // Already on the books? The reference is the platform's own key, shared with
    // the ledger, so it is the one thing that cannot be duplicated.
    const dup = await db.externalBooking.findFirst({ where: { platformRef: ref } });
    if (dup) { console.log("\n  ALREADY ON THE BOOKS: " + dup.bookingId + " (" + dup.platform + " " + ref + "). Nothing to do.\n"); return; }

    const vessel = await db.vessel.findUnique({ where: { id: val("vessel") } });
    if (!vessel) die("No vessel \"" + val("vessel") + "\". Use explorer, islander or yachti.");
    if (guests > vessel.capacity - 1) die(vessel.name + " takes " + (vessel.capacity - 1) + " guests plus the captain; this booking has " + guests + ".");

    // The boat already booked over those hours? Then something is wrong with the
    // email or the calendar, and a person has to look.
    const a0 = toMin(start), a1 = a0 + hours * 60;
    const clash = (await db.externalBooking.findMany({ where: { date, vesselId: vessel.id } })).filter((r) => {
      if (!HOLDS_THE_DAY.includes(r.status)) return false;
      if (!r.startTime || !r.hours) return true; // a booking with no hours holds the whole day
      const b0 = toMin(r.startTime), b1 = b0 + r.hours * 60;
      return a0 < b1 && b0 < a1;
    });
    if (clash.length && !argv.includes("--force")) {
      die("REFUSING: " + vessel.name + " is already booked then: " + clash.map((r) => r.bookingId + " " + (r.startTime || "all day")).join(", ") + ". Check it, then add --force if both are real.");
    }

    // A preview must not draw a number: generateBookingId advances the
    // sequence, and a dry run once burned NY-20261004-01.
    const bookingId = APPLY ? await generateBookingId(date, db) : "NY-" + date.replace(/-/g, "") + "-(next)";
    const added = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const data = {
      bookingId, guestName: val("name").trim(), partySize: guests, date, startTime: start.padStart(5, "0"), hours,
      vesselId: vessel.id, vesselName: vessel.name, platform: p.platform, platformRef: ref, status: "booked",
      priceQuoted: payout, paymentStatus: "unpaid", paymentMethod: p.paidBy, referralSource: p.platform,
      note: [p.platform + " booking " + ref + ", added " + added + " from the platform's confirmation email.",
        "Payout to us $" + payout.toFixed(2) + (val("renter-paid") ? "; the guest paid " + p.platform + " $" + Number(val("renter-paid")).toFixed(2) + "." : "."),
        val("listing") ? "Listing: " + val("listing") : null,
        p.platform + " shares no phone or email: ask the guest on the day, or they can never be asked for a review.",
        val("note")].filter(Boolean).join("\n"),
    };
    console.log("\n  " + bookingId + "   " + data.guestName + "   " + p.platform + " " + ref);
    console.log("      " + vessel.name + ", " + date + " " + data.startTime + " for " + hours + "h, " + guests + " guests");
    console.log("      payout $" + payout.toFixed(2) + " (" + p.paidBy + ", unpaid until it lands)");
    if (!APPLY) { console.log("\n  nothing written. re-run with --apply\n"); return; }
    const created = await db.externalBooking.create({ data });
    console.log("\n  CREATED " + created.bookingId + "\n");
  } finally { await db.$disconnect(); }
})().catch((e) => { console.error("\n  ERR " + e.message + "\n"); process.exitCode = 1; });
