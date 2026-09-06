// Does what this system PRODUCED actually hold up?
//
//   node scripts/check-output.js            report
//   node scripts/check-output.js --json     machine-readable, for a crew run
//
// WHY THIS EXISTS, and it is a different question from check-consistency.js.
// That one asks whether the documentation still matches the code. This one asks
// whether the OUTPUT still matches its purpose — whether the thing we made for
// a customer or an agent actually does the job it was made for.
//
// Every fault found on 5 September 2026 shared one signature: SUCCESS THAT WAS
// NOT. Nothing threw. Nothing logged an error.
//
//   * Seven of eight queued videos had no audio. A silent MP4 is a valid MP4.
//   * A paid booking sent no confirmation. sendBookingConfirmationEmail
//     returned { sent: false, reason: "no-guest-email" } and every caller threw
//     the result away with `.catch(() => {})` — which does not even catch a
//     returned value.
//   * Ticking three add-ons billed $125 for a $60 package. Arithmetically
//     correct, commercially wrong.
//   * A booking agreed but unpaid did not hold its date, so the same boat could
//     be sold twice.
//
// The owner found all of them by looking. That is the pattern this closes: a
// machine cannot be asked "is this right?", but it can be asked "does this
// still satisfy the rule we wrote down?" — and the answer to that is the same
// answer, arrived at without anyone remembering to check.
//
// ADD A CHECK HERE whenever something ships that could fail quietly. The bar is
// not "could this break" — it is "if this broke, would anything say so?"
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const APP = path.join(__dirname, "..");
const SECRETS = "C:/Users/immex/.secrets/nauti-yachti.env";
if (fs.existsSync(SECRETS)) {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { PrismaClient } = require(path.join(APP, "node_modules", "@prisma", "client"));
const { HOLDS_THE_DAY, OWED } = require(path.join(APP, "lib", "bookingStatus"));
const { isOwedCharter } = require(path.join(APP, "lib", "owedCharters"));
const { addOnTotal } = require(path.join(APP, "lib", "addOns"));
const prisma = new PrismaClient();

const JSON_OUT = process.argv.includes("--json");
const findings = [];
// tier 1 is "a guest is affected right now", tier 2 is "this will bite soon".
const fail = (tier, area, what, detail) => findings.push({ tier, area, what, detail });

const ffprobe = ["C:/Users/immex/tools/ffmpeg/bin/ffprobe.exe", "C:/Users/immex/tools/ffmpeg/ffprobe.exe"]
  .find((p) => fs.existsSync(p));

// --- 1. a guest who paid must have heard from us ---------------------------
// The exact failure of 5 Sep: paid, booked, and silent. confirmationSentAt is
// written only on a real send, so null here means it genuinely did not go.
async function paidButSilent() {
  const paid = await prisma.inquiry.findMany({
    where: { paymentStatus: "paid" },
    select: { bookingId: true, name: true, email: true, date: true, confirmationSentAt: true, submittedAt: true },
  });
  for (const b of paid) {
    if (b.confirmationSentAt) continue;
    // Rows that predate the column cannot be judged and must not cry wolf.
    if (b.submittedAt && b.submittedAt < new Date("2026-09-05T00:00:00Z")) continue;
    fail(1, "confirmation",
      (b.bookingId || "a booking") + " is PAID but no confirmation was ever sent",
      (b.name || "guest") + (b.email ? " <" + b.email + ">" : " — and no email address on file"));
  }
}

// --- 2. a booking that is happening must hold its date ----------------------
// Otherwise the same boat can be sold twice for the same window.
async function datesNotHeld() {
  const paid = await prisma.inquiry.findMany({
    where: { paymentStatus: "paid", date: { not: null } },
    select: { bookingId: true, name: true, date: true, vesselId: true, vesselName: true },
  });
  const held = await prisma.externalBooking.findMany({
    where: { status: { in: HOLDS_THE_DAY } },
    select: { date: true, vesselId: true },
  });
  const key = (d, v) => d + "|" + v;
  const heldSet = new Set(held.map((h) => key(h.date, h.vesselId)));
  for (const b of paid) {
    if (!b.vesselId) continue;
    if (!heldSet.has(key(b.date, b.vesselId))) {
      fail(1, "calendar",
        (b.bookingId || "a paid booking") + " does not hold its date",
        (b.vesselName || b.vesselId) + " on " + b.date + " still reads as available");
    }
  }
}

// --- 3. no video may publish silent ----------------------------------------
// Sound is a ranking input on TikTok and Instagram, and a clip without it reads
// as broken. Photos are not checked: they have no audio and never will.
async function silentVideos() {
  if (!ffprobe) return;
  const drafts = await prisma.mediaDraft.findMany();
  const queued = drafts.filter((d) => d.mediaType === "video" && d.mediaUrl &&
    ["scheduled", "approved", "pending"].includes(String(d.status)));
  const tmp = path.join(os.tmpdir(), "nauti-output-check");
  fs.mkdirSync(tmp, { recursive: true });
  for (const d of queued) {
    const file = path.join(tmp, d.id + ".mp4");
    try {
      if (!fs.existsSync(file)) {
        const res = await fetch(d.mediaUrl);
        if (!res.ok) {
          fail(2, "media", "a scheduled post's media will not load",
            String(d.platform) + " " + String(d.scheduledFor || d.scheduledDate || "").slice(0, 10) +
            " — HTTP " + res.status);
          continue;
        }
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      }
      const out = execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type",
        "-of", "json", file], { encoding: "utf8" });
      const hasAudio = (JSON.parse(out).streams || []).some((s) => s.codec_type === "audio");
      if (!hasAudio) {
        fail(1, "media", "a video is scheduled to publish with NO AUDIO",
          String(d.platform) + " " + String(d.scheduledFor || d.scheduledDate || "").slice(0, 10) +
          " — " + (d.theme || d.id));
      }
    } catch (e) {
      fail(2, "media", "could not check a scheduled video", (d.theme || d.id) + ": " + e.message.slice(0, 60));
    }
  }
}

// --- 4. what a guest is charged must match the rules ------------------------
// The decoration bundle contains the balloons and the champagne, so ticking all
// three costs $60, not $125. This recomputes from lib/addOns.js and compares.
async function addOnPricing() {
  const addOns = await prisma.addOn.findMany();
  const withAddOns = await prisma.inquiry.findMany({
    where: { addOnIds: { not: null } },
    select: { bookingId: true, packageId: true, addOnIds: true, priceQuoted: true, paymentStatus: true },
  });
  for (const b of withAddOns) {
    let ids = [];
    try { ids = JSON.parse(b.addOnIds) || []; } catch { continue; }
    if (!ids.length) continue;
    const expected = addOnTotal(addOns, b.packageId, ids);
    const naive = ids.reduce((s, id) => {
      const a = addOns.find((x) => x.id === id);
      return s + (a ? Number(a.price) || 0 : 0);
    }, 0);
    if (naive !== expected) {
      fail(2, "pricing",
        (b.bookingId || "a booking") + " has add-ons whose list price differs from the rules",
        "list $" + naive + ", correct $" + expected + " — check what was actually charged");
    }
  }
}

// --- 5. a booking must be reachable ----------------------------------------
// The direct channel routinely produces bookings with no way to contact anyone.
async function unreachableBookings() {
  const upcoming = await prisma.externalBooking.findMany({
    where: { status: { in: HOLDS_THE_DAY } },
    select: { bookingId: true, guestName: true, date: true, email: true, phone: true },
  });
  const today = new Date().toISOString().slice(0, 10);
  for (const b of upcoming) {
    if (!b.date || b.date < today) continue;
    if (!b.email && !b.phone) {
      fail(2, "contact", "an upcoming charter has no way to reach the guest",
        (b.bookingId || "") + " " + (b.guestName || "unnamed") + " on " + b.date);
    }
  }
}

// --- 6. a promise made must be kept ----------------------------------------
// /thanks tells a guest their photographs are coming. An unfulfilled request is
// worse than never having asked.
async function photosOwed() {
  const owed = await prisma.photoRequest.findMany({ where: { sentAt: null } });
  const old = owed.filter((r) => (Date.now() - new Date(r.createdAt)) / 86400000 > 10);
  for (const r of old) {
    const days = Math.round((Date.now() - new Date(r.createdAt)) / 86400000);
    fail(2, "photos", r.name + " has waited " + days + " days for photos they were promised",
      r.phone || r.email || "no contact detail");
  }
}

// --- 7. a charter owed must not go quiet ------------------------------------
// This status exists because Christian Gehring's charter did: paid in June,
// never sailed, and for two months there was no list anywhere in the business
// that he appeared on. A liability nobody is reminded of is a liability that
// gets forgotten.
//
// So this reports every owed charter every day, until it sails or the money
// goes back. That would be intolerable noise for a common state and is cheap
// for a rare one -- and if it ever stops being rare, a daily line saying so is
// the correct amount of alarm.
async function chartersOwed() {
  const rows = await prisma.externalBooking.findMany({
    where: { status: { in: OWED } },
    select: {
      bookingId: true, guestName: true, date: true, email: true, phone: true,
      pricePaid: true, vesselName: true, status: true, marketingOptOut: true,
    },
  });
  const today = new Date().toISOString().slice(0, 10);
  for (const b of rows) {
    // Asked rather than assumed, so this check and whatever the console shows
    // can never disagree about who is owed.
    if (!isOwedCharter(b, today)) continue;
    const held = Number(b.pricePaid) > 0
      ? "$" + Number(b.pricePaid) + " of their money held"
      : "amount never recorded";

    // No way to reach them is the worse fault by a distance: the charter cannot
    // be rescheduled at all, so the money can never stop being owed.
    if (!b.email && !b.phone) {
      fail(1, "owed", (b.guestName || "a guest") + " is owed a charter and there is no way to reach them",
        (b.bookingId || "no booking id") + " — " + held + ", no phone and no email on file");
      continue;
    }
    fail(2, "owed", (b.guestName || "a guest") + " is still owed a charter",
      (b.bookingId || "no booking id") + " — " + held + ", no date set. " +
      (b.phone || b.email) + " — offer a weekend, not a refund.");
  }
}

(async () => {
  await paidButSilent();
  await datesNotHeld();
  await addOnPricing();
  await unreachableBookings();
  await photosOwed();
  await chartersOwed();
  await silentVideos();

  if (JSON_OUT) {
    console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
  } else if (!findings.length) {
    console.log("\n  Output checks pass. Nothing produced is failing its purpose.\n");
  } else {
    const t1 = findings.filter((f) => f.tier === 1);
    const t2 = findings.filter((f) => f.tier === 2);
    console.log("\n  " + findings.length + " problem(s) — " + t1.length + " affecting a guest now\n");
    for (const group of [["AFFECTING A GUEST NOW", t1], ["WORTH FIXING", t2]]) {
      if (!group[1].length) continue;
      console.log("  " + group[0] + "\n");
      for (const f of group[1]) {
        console.log("   [" + f.area + "] " + f.what);
        console.log("        " + f.detail);
      }
      console.log("");
    }
  }
  await prisma.$disconnect();
  process.exit(findings.some((f) => f.tier === 1) ? 1 : 0);
})().catch((e) => { console.error("\n  " + e.message + "\n"); process.exit(1); });
