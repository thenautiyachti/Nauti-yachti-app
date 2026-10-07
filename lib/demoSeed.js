// Build the demo database: wipe it, then fill it with an invented season.
// Used by scripts/seed-demo.js (by hand) and app/api/demo/reset (nightly).
//
// WHAT IS REAL AND WHAT IS INVENTED (owner, 7 Oct 2026: "keep financial, and any
// other information that needs to stay protected").
//   Copied from the public site (scripts/demo/catalogue.json): packages, boats,
//     add-ons, gallery captions and prices. All of it is already on
//     thenautiyachti.com, and the site's own copy names those boats and prices,
//     so changing them here would make the demo contradict itself.
//   Invented here, from nothing: every guest, booking, payment, ledger row, bill,
//     subscription, bank balance, gift certificate, review, coupon, maintenance
//     and fuel record, post draft, comment and crew status. No row is derived
//     from a real one.
//
// DELETES EVERYTHING FIRST, so it refuses to run unless the database is
// positively the demo database (lib/demo.js assertDemoDatabase). That check is
// here, not only in the callers, because this is the function that deletes.
const { assertDemoDatabase } = require("./demo");
const catalogue = require("../scripts/demo/catalogue.json");

// --- deterministic randomness -------------------------------------------------
// Same seed, same demo: a prospect who comes back tomorrow sees the same guests.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let rand = rng(20261007);
const pick = (a) => a[Math.floor(rand() * a.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const money = (lo, hi) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;
const chance = (p) => rand() < p;

// Invented people. Common names, checked against nobody; 555-01xx numbers are
// reserved for fiction; example.com cannot receive mail.
const FIRST = ["Jamie", "Taylor", "Jordan", "Morgan", "Casey", "Riley", "Avery", "Quinn", "Parker", "Reese",
  "Dakota", "Skyler", "Rowan", "Emerson", "Hayden", "Logan", "Sydney", "Blake", "Cameron", "Drew",
  "Kendall", "Peyton", "Harper", "Finley", "Sawyer", "Marley", "Ellis", "Lane", "Remy", "Shea"];
const LAST = ["Rivera", "Bennett", "Whitaker", "Hollis", "Castillo", "Mercer", "Langley", "Pruitt", "Delgado", "Ashford",
  "Kincaid", "Navarro", "Sterling", "Barlow", "Quintero", "Holloway", "Fairbanks", "Vance", "Galloway", "Ramsey"];
function person(i) {
  const first = FIRST[i % FIRST.length], last = LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length];
  return {
    name: `${first} ${last}`,
    email: `${first}.${last}`.toLowerCase() + "@example.com",
    phone: `(936) 555-01${String(i % 100).padStart(2, "0")}`,
  };
}

// --- dates relative to today, so the demo always looks like the current season
function day(offset) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
const at = (offset, hour = 10) => { const d = new Date(day(offset) + "T00:00:00"); d.setHours(hour); return d; };
const bookingRef = (date, n) => `NY-${date.replace(/-/g, "")}-${String(n).padStart(2, "0")}`;

// Hourly price from the real public package table, so totals match the site.
function priceFor(pkg, vesselId, hours) {
  try {
    if (pkg.pricingType === "hourly-by-vessel") {
      const h = JSON.parse(pkg.hourlyJson || "{}")[vesselId] || {};
      const t = h.weekend || h.weekday || {};
      return t[String(hours)] || null;
    }
    if (pkg.pricingType === "per-guest") return (pkg.pricePerGuest || 50) * int(6, 12);
    if (pkg.pricingType === "tiered-by-guests") return (JSON.parse(pkg.tiersJson || "[]")[0] || {}).price || null;
    return pkg.price || null;
  } catch { return null; }
}

// Every table, children first. A model added to the schema and missing here
// would keep yesterday's demo rows -- harmless, but add it.
const LOCK_KEY = "demo:resetting";

const ALL_TABLES = [
  "giftCertificateRedemption", "giftCertificate", "ledgerEntry", "tripMessage", "tripPhoto", "guestUpload",
  "externalBooking", "inquiry", "blockedDate", "priceChangeLog", "package", "addOn", "vessel", "galleryItem",
  "coupon", "subscription", "waterPoint", "maintenanceItem", "engineHoursLog", "fuelLog", "mediaDraft",
  "commentReplyDraft", "commentReply", "commentThreadAnswer", "messageReplyDraft", "messageThreadAnswer",
  "consoleSetting", "testimonial", "speechEvent", "agentActivity", "jarvisTodo", "campaignPost",
  "photoRequest", "bankBalanceReading",
];

async function seedDemo(prisma, { log = console.log } = {}) {
  assertDemoDatabase();
  rand = rng(20261007);

  // 1. wipe
  // Every table, except the reset's own lock row (app/api/demo/reset).
  for (const t of ALL_TABLES) {
    await prisma[t].deleteMany(t === "consoleSetting" ? { where: { key: { not: LOCK_KEY } } } : {});
  }

  // 2. public catalogue, as on the live site
  await prisma.vessel.createMany({ data: catalogue.vessels });
  // Package cards on the live site use charter photos with real guests in them
  // (checked 7 Oct 2026: bachelorette, birthday, Party Cove, night cruise). The
  // demo shows boat-only photos instead until licensed stock replaces them.
  // Licensed stock (public/demo, Unsplash licence, see CREDITS.md there) where a
  // package needs people in the shot; boat-only photos of our own fleet otherwise.
  const STOCK = {
    tubing: "/demo/tubing.jpg", wakesurf: "/demo/tubing.jpg", birthday: "/demo/party-group.jpg",
    partycove: "/demo/party-group.jpg", bachelor: "/demo/toast.jpg", corporate: "/demo/dock-group.jpg",
    night: "/demo/sunset-cruise.jpg", glowz: "/demo/lake-sunset.jpg",
  };
  const BOAT_ONLY = catalogue.gallery.filter((g) => g.category === "fleet").map((g) => g.image);
  await prisma.package.createMany({
    data: catalogue.packages.map((p, i) => ({ ...p, image: STOCK[p.id] || BOAT_ONLY[i % BOAT_ONLY.length] || null })),
  });
  await prisma.addOn.createMany({ data: catalogue.addOns });
  // Boat-only photos for the demo gallery. Charter photos show real guests,
  // who agreed to the live site and social posts, not to a sales demo.
  await prisma.galleryItem.createMany({ data: catalogue.gallery.filter((g) => g.category === "fleet") });

  const vessels = catalogue.vessels;
  const bookable = catalogue.packages.filter((p) => p.pricingType === "hourly-by-vessel");
  const platforms = [
    ["Website", "Stripe (card)", 0.35], ["Boatsetter", "Boatsetter payout", 0.25],
    ["GetMyBoat", "GetMyBoat payout", 0.2], ["Direct", "Zelle", 0.1], ["Direct", "Cash", 0.1],
  ];
  const platformFor = () => { let r = rand(), acc = 0; for (const p of platforms) { acc += p[2]; if (r < acc) return p; } return platforms[0]; };

  // 3. bookings: about 120 days back, 45 ahead
  const bookings = [], ledger = [];
  let who = 0;
  for (let off = -120; off <= 45; off++) {
    const dow = new Date(day(off) + "T12:00:00").getDay();
    const busy = dow === 0 || dow === 5 || dow === 6;
    if (!(busy ? chance(0.55) : chance(0.12))) continue;
    const date = day(off), pkg = pick(bookable), vessel = pick(vessels), hours = pick([2, 3, 4, 4, 6]);
    const price = priceFor(pkg, vessel.id, hours) || 150 * hours;
    const [platform, method] = platformFor();
    const g = person(who++);
    const past = off < 0;
    let status = past ? "completed" : "booked";
    if (past && chance(0.06)) status = "cancelled";
    const paid = platform === "Website" ? true : past ? platform === "Direct" : false;
    const payout = platform === "Website" || platform === "Direct" ? price : Math.round(price * (platform === "Boatsetter" ? 0.8 : 0.85) * 100) / 100;
    const b = {
      vesselId: vessel.id, vesselName: vessel.name, date, startTime: pick(["10:00", "12:00", "14:00", "17:00"]), hours,
      guestName: g.name, email: g.email, phone: g.phone, partySize: int(4, vessel.capacity || 12),
      platform, status, packageId: pkg.id, packageName: pkg.name, priceQuoted: price,
      pricePaid: status === "completed" ? payout : null, paymentStatus: paid ? "paid" : "unpaid", paymentMethod: method,
      platformRef: platform === "Boatsetter" ? "BS-" + int(100000, 999999) : platform === "GetMyBoat" ? "GMB-" + int(100000, 999999) : null,
      referralSource: pick(["Instagram", "Facebook", "Google", "Repeat guest", "Friend", null]),
      bookingId: bookingRef(date, bookings.filter((x) => x.date === date).length + 1),
      confirmationSentAt: at(off - int(3, 20)), reviewRequestedAt: past && chance(0.5) ? at(off + 2) : null,
      createdAt: at(off - int(3, 40)),
    };
    bookings.push(b);
  }
  // one guest paid and never sailed, so the "owed" view has something to show
  const owed = bookings.find((b) => b.status === "completed" && b.platform === "Direct");
  if (owed) { owed.status = "owed"; owed.note = "Weather cancelled the trip; guest wants a new date."; }

  for (const b of bookings) await prisma.externalBooking.create({ data: b });
  const saved = await prisma.externalBooking.findMany();
  for (const b of saved) {
    if (b.status !== "completed" || !b.pricePaid) continue;
    ledger.push({ type: "income", category: "Reservation", amount: b.pricePaid, grossAmount: b.platform === "Boatsetter" || b.platform === "GetMyBoat" ? b.priceQuoted : null,
      origin: b.platform === "Website" ? "Stripe" : b.platform === "Direct" ? b.paymentMethod : b.platform,
      externalBookingId: b.id, bookingId: b.bookingId, date: b.date, note: `${b.packageName}, ${b.hours} hr` });
  }

  // 4. website enquiries that never became bookings, plus a couple of new ones
  for (let i = 0; i < 14; i++) {
    const g = person(200 + i), pkg = pick(bookable), off = int(-60, 2);
    await prisma.inquiry.create({ data: {
      name: g.name, email: g.email, phone: g.phone, packageId: pkg.id, packageName: pkg.name,
      date: day(off + int(5, 40)), hours: pick([2, 3, 4]), partySize: String(int(4, 12)),
      message: pick(["Birthday for my wife, can we bring a cake?", "Is the tube included?", "Do you allow dogs on board?",
        "Looking at a Saturday in a few weeks, what's open?", "Bachelorette party of 10, any packages?", null]),
      status: off > -3 ? "new" : pick(["lapsed", "lapsed", "seen"]), referralSource: pick(["Instagram", "Google", "Facebook", null]),
      submittedAt: at(off),
    } });
  }

  // 5. expenses: a believable operating season, all invented
  const vendors = {
    "Fuel": [["Marina fuel dock", 60, 240, 2.2]], "Repairs & Parts": [["Marine parts store", 20, 400, 0.5]],
    "Food & Party Supplies": [["Grocery store", 25, 140, 0.6]], "Cleaning Supplies": [["Hardware store", 15, 60, 0.15]],
    "Platform Fees & Commissions": [["Stripe", 5, 40, 0.4]],
  };
  for (let off = -120; off <= 0; off += 7) {
    for (const [cat, list] of Object.entries(vendors)) {
      for (const [vendor, lo, hi, perWeek] of list) {
        const n = Math.floor(perWeek) + (chance(perWeek % 1) ? 1 : 0);
        for (let k = 0; k < n; k++) ledger.push({ type: "expense", category: cat, amount: money(lo, hi), origin: pick(["Business Checking Statement", "Business Card Statement"]), date: day(off + int(0, 6)), note: vendor });
      }
    }
  }
  for (let m = 0; m < 4; m++) {
    const d = day(-30 * m - 2);
    ledger.push({ type: "expense", category: "Storage", amount: 450, origin: "Business Checking Statement", date: d, note: "Boat slips (sample marina)" });
    ledger.push({ type: "expense", category: "Insurance", amount: 389.5, origin: "Business Checking Statement", date: d, note: "Charter liability policy (sample)" });
    ledger.push({ type: "expense", category: "Utilities", amount: 85, origin: "Business Card Statement", date: d, note: "Business phone line" });
    ledger.push({ type: "expense", category: "Software & Subscriptions", amount: 39, origin: "Business Card Statement", date: d, note: "Booking software" });
    ledger.push({ type: "expense", category: "Apparel & Advertising", amount: money(60, 220), origin: "Business Card Statement", date: d, note: "Social media ads" });
    ledger.push({ type: "expense", category: "Bank Fees", amount: 12, origin: "Business Checking Statement", date: d, note: "Monthly service fee" });
  }
  await prisma.ledgerEntry.createMany({ data: ledger });

  // 6. bills and subscriptions, bank balances
  const bill = (name, category, amount, billingCycle, dueOff, vendor) => ({ name, category, amount, billingCycle, nextDueDate: day(dueOff), vendor, active: true, startedOn: day(-400) });
  await prisma.subscription.createMany({ data: [
    bill("Boat slips (2)", "Storage", 450, "monthly", 12, "Sample Marina"),
    bill("Charter liability insurance", "Other", 389.5, "monthly", 20, "Sample Insurance Co."),
    bill("Business phone", "Utilities", 85, "monthly", 6, "Sample Wireless"),
    bill("Website hosting", "Hosting", 20, "monthly", 15, "Hosting provider"),
    bill("Database", "Hosting", 25, "monthly", 15, "Database provider"),
    bill("Booking software", "Software", 39, "monthly", 3, "Software vendor"),
    bill("Email service", "Software", 20, "monthly", 9, "Email provider"),
    bill("Social scheduling", "Software", 29, "monthly", 24, "Scheduling tool"),
    bill("Domain name", "Hosting", 22, "yearly", 140, "Registrar"),
    bill("Boat storage unit", "Storage", 95, "monthly", 27, "Sample Storage"),
  ] });
  await prisma.bankBalanceReading.createMany({ data: [0, -7, -14, -21, -28].map((off, i) => ({
    account: "Business Checking", last4: "0000", balance: Math.round((8420 - i * 610 + rand() * 900) * 100) / 100,
    asOf: day(off), source: "statement", note: "Sample balance",
  })).concat([{ account: "Business Savings", last4: "0001", balance: 5000, asOf: day(-3), source: "statement", note: "Sample balance" }]) });

  // 7. gift certificates and coupons
  const g1 = person(300), g2 = person(301), g3 = person(302);
  await prisma.giftCertificate.create({ data: { code: "GIFT-DEMO-1001", initialAmount: 200, balance: 200, purchaserName: g1.name, purchaserEmail: g1.email, recipientName: g2.name, message: "Happy birthday! Enjoy the lake.", status: "active", expiresAt: day(300), issuedAt: at(-20) } });
  const used = await prisma.giftCertificate.create({ data: { code: "GIFT-DEMO-1002", initialAmount: 150, balance: 0, purchaserName: g3.name, purchaserEmail: g3.email, status: "redeemed", expiresAt: day(250), issuedAt: at(-75) } });
  await prisma.giftCertificateRedemption.create({ data: { certificateId: used.id, amount: 150, bookingId: saved[2] && saved[2].bookingId, note: "Applied at checkout", redeemedAt: at(-40) } });
  await prisma.coupon.createMany({ data: [
    { code: "WELCOME10", discountType: "percent", discountValue: 10, active: true, maxUses: 50, usedCount: 7, expiresAt: day(90), note: "Sample: first-time guests" },
    { code: "REPEAT25", discountType: "fixed", discountValue: 25, active: true, maxUses: 20, usedCount: 3, expiresAt: day(60), note: "Sample: returning guests", requiresReturningGuest: true },
  ] });

  // 8. the boats: maintenance, engine hours, fuel
  for (const v of vessels) {
    await prisma.maintenanceItem.createMany({ data: [
      { vesselId: v.id, label: "Engine oil and filter", intervalHours: 100, lastDoneHours: 410, lastDoneDate: day(-35) },
      { vesselId: v.id, label: "Impeller", intervalMonths: 12, lastDoneDate: day(-200) },
      { vesselId: v.id, label: "Fire extinguisher inspection", intervalMonths: 12, lastDoneDate: day(-330) },
    ] });
    let hours = 380;
    for (let off = -110; off <= 0; off += 10) {
      hours += money(4, 14);
      await prisma.engineHoursLog.create({ data: { vesselId: v.id, date: day(off), hours: Math.round(hours * 10) / 10 } });
      if (chance(0.6)) await prisma.fuelLog.create({ data: { vesselId: v.id, date: day(off), gallons: money(15, 45), cost: money(60, 200), hoursAtFillup: Math.round(hours * 10) / 10 } });
    }
  }

  // 9. reviews, post drafts, comments, crew
  const quotes = ["Best day on the lake we've had. Captain was great with the kids.", "Booked for a birthday and it was perfect from start to finish.",
    "Easy booking, boat was spotless, and the cove was a blast.", "Our bachelorette group still talks about this trip.",
    "Professional, fun, and on time. Will book again next summer.", "The tube runs were the highlight for everyone."];
  await prisma.testimonial.createMany({ data: quotes.map((q, i) => ({ name: person(400 + i).name.replace(/ (\w)\w+$/, " $1."), rating: i === 5 ? 4 : 5, quote: q, status: "approved", charterDate: day(-10 * (i + 1)), submittedAt: at(-10 * i - 3) })) });
  await prisma.mediaDraft.createMany({ data: [
    { theme: "fleet", caption: "Weekend's looking sunny. A few spots left for Saturday afternoon.", platform: "instagram", status: "proposed", mediaUrl: "/gallery/nauti-explorer-under-way.jpg" },
    { theme: "fleet", caption: "Cabin's air-conditioned and the cooler's on us. Book your crew in.", platform: "facebook", status: "approved", scheduledDate: day(2), scheduledTime: "7:00 PM", mediaUrl: "/gallery/nauti-yachti-cabin-berth.jpg" },
    { theme: "fleet", caption: "Golden hour on the water hits different.", platform: "instagram", status: "scheduled", scheduledDate: day(1), scheduledTime: "11:00 AM", mediaUrl: "/gallery/nauti-explorer-at-rest.jpg" },
    { theme: "fleet", caption: "Tube's pumped. Who's first?", platform: "facebook", status: "posted", postedAt: at(-3), mediaUrl: "/gallery/nauti-explorer-towing.jpg" },
  ] });
  await prisma.commentReplyDraft.createMany({ data: [
    { commentId: "demo-c1", platform: "instagram", commentText: "How many people fit on the big boat?", suggestion: "Up to 12 on that one. Send us a message with your date and we'll check what's open." },
    { commentId: "demo-c2", platform: "facebook", commentText: "Do you do sunset trips?", suggestion: "We do! Our Night Cruise runs into sunset. Tap Book on our page to see open dates." },
  ] });
  // The crew cards on the Overview. Each agent gets the status she filed at the
  // morning standup, her latest run, and the run before it, all on her real
  // schedule in Lake Conroe time, with words built from THIS demo's invented
  // numbers so the cards agree with the rest of the console. (7 Oct 2026: the
  // first version said "Sample status for the demo." on every card, at UTC
  // hours, which read as eight blank agents.)
  const crewRows = buildCrew({ saved, owed, ledger });
  await prisma.agentActivity.createMany({ data: crewRows.activity });
  await prisma.jarvisTodo.createMany({ data: crewRows.board });

  // 10. the outbox starts empty, with a note
  await prisma.consoleSetting.create({ data: { key: "demo:outbox", value: "[]" } });

  const counts = { bookings: saved.length, enquiries: 14, ledger: ledger.length };
  log(`  demo seeded: ${counts.bookings} bookings, ${counts.enquiries} enquiries, ${counts.ledger} ledger rows`);
  return counts;
}

// --- the crew ---------------------------------------------------------------

// Offset of America/Chicago from UTC at a given moment, in ms (DST-aware).
function chicagoOffset(at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

// The most recent moment (at or before now) that Lake Conroe's clock read
// hour:minute on one of the allowed weekdays (0 = Sunday). `skip` steps back
// that many further occurrences, for "the run before".
function lastCentral(hour, minute = 0, days = [0, 1, 2, 3, 4, 5, 6], skip = 0) {
  const now = new Date();
  const off = chicagoOffset(now);
  const local = new Date(now.getTime() + off); // wall clock, read via getUTC*
  let found = 0;
  for (let k = 0; k < 21; k++) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - k, hour, minute));
    if (!days.includes(d.getUTCDay())) continue;
    const real = new Date(d.getTime() - off);
    if (real > now) continue;
    if (found++ === skip) return real;
  }
  return new Date(now.getTime() - 86400000);
}

const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const fmtDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function buildCrew({ saved, owed, ledger }) {
  const today = day(0);
  const upcoming = saved.filter((b) => b.status === "booked" && b.date >= today && b.date <= day(7)).sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const pending = saved.filter((b) => b.status === "completed" && (b.platform === "Boatsetter" || b.platform === "GetMyBoat") && b.date >= day(-14));
  const pendingSum = pending.reduce((s, b) => s + (b.pricePaid || 0), 0);
  const income = ledger.filter((l) => l.type === "income").reduce((s, l) => s + l.amount, 0);
  const owedAmt = owed ? (owed.pricePaid || owed.priceQuoted || 0) : 0;
  const saturdays = [7, 14, 21, 28].map((n) => { const d = new Date(day(0) + "T12:00:00"); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7) + n - 7); return d.toISOString().slice(0, 10); });
  const openSats = saturdays.filter((s) => !saved.some((b) => b.date === s && b.status === "booked")).length;
  const reviewDue = saved.filter((b) => b.status === "completed" && !b.reviewRequestedAt && b.date >= day(-10)).length;
  const fixed = 450 + 389.5 + 85 + 20 + 25 + 39 + 20 + 29 + 95 + 22 / 12;
  const FRI_MON = [5, 6, 0, 1];

  // name, [hour, minute, days] of the run shown, label, status lines, run title, run detail, previous run detail
  const agents = [
    ["Nauti Pearl", [11, 0], "Daily review",
      [`${upcoming.length} charters in the next 7 days${next ? `; the first is ${next.packageName} on ${fmtDay(next.date)}` : ""}.`,
       owed ? `${owed.guestName} is still owed a trip (${usd(owedAmt)} held). Joy has the text drafted.` : "Nobody is owed a charter.",
       `${openSats} open Saturday${openSats === 1 ? "" : "s"} in the next four weeks. Reef has an idea on the board.`],
      "Read every status. Two things reach you today: the owed charter and Saturday availability. The rest is handled.",
      "Quiet day. No new money held, no content errors, nothing for you."],
    ["Nauti Penny", [8, 0], "Payouts and the ledger",
      [`${pending.length} platform payout${pending.length === 1 ? "" : "s"} from the last two weeks not landed yet (${usd(pendingSum)}). None overdue.`,
       `Season income so far: ${usd(income)}.`, "Every completed charter has its income row in the ledger."],
      "Matched yesterday's payouts to their bookings and tidied the inbox. Nothing unlinked.",
      "Recorded two card payments from the website. Both matched on the first try."],
    ["Nauti Coral", [14, 30], "Content queue",
      ["2 drafts waiting for your approval in Media Drafts.", "Tomorrow's post is scheduled for 11am. The next 7 days are covered.", "Queue check: no placeholders, every video has sound."],
      "Re-checked the queue after Siren's morning pass. Nothing came back for repair.",
      "Drafted two posts from fleet photos and dated the approved one for tomorrow."],
    ["Nauti Siren", [19, 15], "Publishing pass",
      ["Last night's post went out on time on Facebook and Instagram.", "2 comment replies drafted for you to send.", "No messages waiting on the trip pages."],
      "Published 1 scheduled post and drafted replies for 2 new comments. Nothing posted that was not approved.",
      "Morning pass: nothing due. Screened tomorrow's post: dates, hashtags and photo all fine."],
    ["Nauti Joy", [9, 0, FRI_MON], "Guest follow-up",
      [`${reviewDue || 3} guests from the last 10 days are due a review ask. Texts are drafted.`, "Reviews live: 6, averaging 4.8 stars.",
       owed ? `${owed.guestName.split(" ")[0]} is owed a charter. Offer a weekend date, not a refund.` : "Nobody is owed a charter."],
      "Drafted review asks for last weekend's guests. Nobody was contacted; the texts wait for you.",
      "Two new crew-list signups added; welcome emails sent from the outbox."],
    ["Nauti Reef", [9, 30, FRI_MON], "Revenue ideas",
      [`${openSats} open Saturday${openSats === 1 ? "" : "s"} next month. A last-minute 2-hour slot posted on Thursday could fill one.`,
       "Guests who get a follow-up text rebook noticeably more often.", "Gift certificates: 2 sold this season, one redeemed."],
      "Filed two ideas on the board: a last-minute Saturday slot and a repeat-guest text.",
      "Compared weekday and weekend demand. Weekdays stay quiet outside holidays."],
    ["Nauti Shelly", [10, 0, FRI_MON], "Bills and spend",
      ["Booking software renews in 3 days ($39).", `Fixed costs run about ${usd(fixed)} a month.`, "No unused subscriptions found."],
      "Checked every bill against the subscription register. Nothing unexpected.",
      "Insurance and slip fees posted on time. Fuel spend is in line with charters run."],
    ["Nauti Nova", [10, 30], "Market research",
      ["Nothing worth your time this week yet.", "Watching: state boater-education rules and the lake's summer event calendar.", "Monday's report will carry the best three, or nothing."],
      "Logged two sources on boater-education requirements. Neither changes anything yet.",
      "Checked competitor pricing on the lake. Your rates sit mid-pack."],
  ];

  const activity = [];
  const standup = lastCentral(10, 45);
  for (const [name, [h, m, days], title, statusLines, runDetail, prevDetail] of agents) {
    const ran = lastCentral(h, m, days);
    const prev = lastCentral(h, m, days, 1);
    const mins = (d, n) => new Date(d.getTime() + n * 60000);
    activity.push({ agentName: name, taskTitle: title, status: "completed", detail: prevDetail, startedAt: prev, completedAt: mins(prev, 6) });
    activity.push({ agentName: name, taskTitle: title, status: "completed", detail: runDetail, startedAt: ran, completedAt: mins(ran, 7) });
    // The standup status, unless her own run is newer (then the card shows the run).
    activity.push({ agentName: name, taskTitle: "Morning status", status: "status", detail: statusLines.join("\n"), startedAt: standup, completedAt: standup });
  }

  const board = [
    owed && { text: `[PEARL · T2] ${owed.guestName} paid ${usd(owedAmt)} for a trip that weather cancelled. Offer a weekend date; Joy has the text drafted.`, priority: "medium" },
    { text: `[PENNY · T2] ${pending.length} platform payout${pending.length === 1 ? "" : "s"} (${usd(pendingSum)}) not landed yet. Normal for now; I'll flag any that pass 10 days.`, priority: "medium" },
    { text: "[CORAL · T2] Two post drafts are waiting for your approval in Media Drafts.", priority: "medium" },
    { text: `[JOY · T2] ${reviewDue || 3} recent guests are due a review ask. Texts are drafted under Testimonials.`, priority: "medium" },
    { text: `[REEF · T2] ${openSats} open Saturday${openSats === 1 ? "" : "s"} next month. Idea: post a last-minute 2-hour slot on Thursdays.`, priority: "medium" },
    { text: "[REEF · T3] Idea: a follow-up text a month after each charter, inviting guests back for a weekday trip.", priority: "low" },
    { text: "[SHELLY · T3] Booking software renews in 3 days ($39). Keep it; it's in use every day.", priority: "low" },
    { text: "Order a new tube rope before the weekend", priority: "low" },
  ].filter(Boolean);

  return { activity, board };
}

// Hourly (app/api/demo/crew): re-stamp the crew's runs to their latest
// scheduled times so no card ever reads as a missed run. Touches ONLY
// AgentActivity -- bookings, the board and anything a prospect added stay.
async function refreshCrew(prisma) {
  assertDemoDatabase();
  const saved = await prisma.externalBooking.findMany();
  const ledger = await prisma.ledgerEntry.findMany();
  const owed = saved.find((b) => b.status === "owed") || null;
  const { activity } = buildCrew({ saved, owed, ledger });
  await prisma.agentActivity.deleteMany({});
  await prisma.agentActivity.createMany({ data: activity });
  return { crewRows: activity.length };
}

module.exports = { seedDemo, refreshCrew, ALL_TABLES, LOCK_KEY, lastCentral };
