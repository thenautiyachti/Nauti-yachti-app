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
  const crew = [["Nauti Pearl", "Daily review"], ["Nauti Penny", "Payouts matched to bookings"], ["Nauti Coral", "Drafted two posts from fleet photos"],
    ["Nauti Siren", "Published tonight's post"], ["Nauti Joy", "Three guests due a review ask"], ["Nauti Reef", "One revenue idea filed"],
    ["Nauti Shelly", "Bills checked against the register"], ["Nauti Nova", "Research logged"]];
  await prisma.agentActivity.createMany({ data: crew.map(([agentName, taskTitle], i) => ({ agentName, taskTitle, status: "completed", detail: "Sample status for the demo.", startedAt: at(0, 8 + i), completedAt: at(0, 8 + i) })) });
  await prisma.jarvisTodo.createMany({ data: [
    { text: "[PEARL · T2] Saturday afternoon is open on both boats; consider a last-minute post.", priority: "medium" },
    { text: "[PENNY · T2] One platform payout from last weekend hasn't landed yet.", priority: "medium" },
    { text: "[SHELLY · T3] Booking software renews in 3 days.", priority: "low" },
    { text: "Order new tube rope", priority: "low" },
  ] });

  // 10. the outbox starts empty, with a note
  await prisma.consoleSetting.create({ data: { key: "demo:outbox", value: "[]" } });

  const counts = { bookings: saved.length, enquiries: 14, ledger: ledger.length };
  log(`  demo seeded: ${counts.bookings} bookings, ${counts.enquiries} enquiries, ${counts.ledger} ledger rows`);
  return counts;
}

module.exports = { seedDemo, ALL_TABLES, LOCK_KEY };
