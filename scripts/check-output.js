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
const crypto = require("crypto");
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
const { chartersMissingTheirMoney, diagnose } = require(path.join(APP, "lib", "ledgerLinks"));
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
    // CACHED BY URL, NOT BY DRAFT ID.
    //
    // It was keyed on the draft id, which meant the downloaded file never
    // changed when the draft's media did. Five silent videos were replaced with
    // fixed ones on 6 Sep 2026 and this check went on reporting all five as
    // silent, because it kept re-testing the copies it had downloaded first.
    //
    // The same bug in the other direction is the dangerous one: swap good media
    // for bad under an existing draft, and the check would keep insisting the
    // old good file was what was going out. A check that answers from a stale
    // cache is worse than no check, because it answers confidently.
    const key = crypto.createHash("sha1").update(String(d.mediaUrl)).digest("hex").slice(0, 16);
    const file = path.join(tmp, key + ".mp4");
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

// --- 3b. a scheduled post must have something to post -----------------------
// The silent-video check only inspects drafts that HAVE media, so a draft with
// none at all was invisible to the one thing watching this queue.
//
// It is not automatically a fault. The three 20 Sep "THE RECAP" posts carry
// photoHint "Best clip or photo from the night" for an event on the 19th, so
// they are meant to be filled after it happens. That is a plan, not an
// oversight -- right up until the night passes and nobody fills them, which is
// exactly the kind of quiet failure nothing here would otherwise catch. So it
// stays silent until the date is close, then says so with rising urgency.
async function postsWithNothingToPost() {
  const drafts = await prisma.mediaDraft.findMany({
    where: { status: { in: ["scheduled", "approved"] } },
    select: { platform: true, theme: true, scheduledDate: true, mediaUrl: true, photoHint: true },
  });
  const today = new Date().toISOString().slice(0, 10);
  const empty = drafts.filter((d) => !d.mediaUrl && d.scheduledDate && d.scheduledDate >= today);

  // Grouped by date: one event's worth of posts is one problem to solve, not
  // three, and three identical lines is how a report gets skimmed.
  const byDate = {};
  for (const d of empty) (byDate[d.scheduledDate] = byDate[d.scheduledDate] || []).push(d);

  for (const date of Object.keys(byDate).sort()) {
    const group = byDate[date];
    const days = Math.round((new Date(date) - new Date(today)) / 86400000);
    if (days > 5) continue; // still plenty of time; saying so daily is noise
    const what = group[0].theme || "a post";
    const where = group.map((d) => d.platform).join(", ");
    fail(days <= 1 ? 1 : 2, "media",
      what + " goes out in " + (days === 0 ? "less than a day" : days + " day(s)") + " with no media attached",
      date + " — " + where + (group[0].photoHint ? " — needs: " + group[0].photoHint : ""));
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

// --- 8. money taken must be findable from the charter -----------------------
// The claim was made on 5 Sep 2026 that Gehring's $520 had never been recorded.
// It had. The row was there since 9 June, with a note explaining exactly what it
// was; what it lacked was any link back to his booking, so every question asked
// from the booking's side answered "no money". Nothing in the business would
// ever have noticed, because the one process that writes an income row fires on
// marking a charter COMPLETED -- and an owed charter never completes.
//
// The distinction matters more than the count. Unlinked money needs a join
// fixed; missing money needs someone to find out what happened. Doing the wrong
// one writes a second income row for money already banked and doubles it on a
// tax return, so this says which it is rather than making the reader guess.
async function moneyNotOnTheBooks() {
  const bookings = await prisma.externalBooking.findMany();
  const ledger = await prisma.ledgerEntry.findMany();
  for (const b of chartersMissingTheirMoney(bookings, ledger)) {
    const d = diagnose(b, ledger);
    const who = (b.guestName || "a guest") + " (" + (b.bookingId || "no id") + ")";
    if (d.kind === "unlinked") {
      const c = d.candidates[0];
      fail(2, "books", who + "'s $" + b.pricePaid + " is recorded but not tied to the charter",
        "looks like the " + c.date + " " + (c.origin || "") + " row for $" + c.amount +
        " — LINK it, do not add a second row");
    } else {
      fail(1, "books", who + " paid $" + b.pricePaid + " and nothing in the ledger matches it",
        "status " + b.status + ", " + b.date + " — " + d.says);
    }
  }
}

// --- 9. a date column must hold a date, or nothing --------------------------
// "TBD" lived in this column for two months. It is not merely untidy: string
// comparison puts "TBD" AFTER every real date, so `date >= today` reads it as
// an upcoming charter. Nothing was fooled, because every such filter also
// required status "booked" -- which is luck, not design. Empty means "no date";
// anything else must parse.
async function fakeDates() {
  const REAL = /^\d{4}-\d{2}-\d{2}$/;
  const rows = await prisma.externalBooking.findMany({
    select: { bookingId: true, guestName: true, date: true, status: true },
  });
  for (const b of rows.filter((r) => r.date && !REAL.test(r.date))) {
    fail(2, "data", (b.bookingId || "a booking") + " has a date that is not a date",
      JSON.stringify(b.date) + " — sorts as if it were later than every real date. " +
      "Use \"\" for no date; the status is what says why.");
  }
}

// EVERY ORIGIN IN THE BOOKS MUST BE SELECTABLE IN THE CONSOLE.
//
// This is a quiet failure of the worst kind: the dropdown renders, the row
// renders, and the origin is simply not among the options — so the select falls
// back to its first entry, and saving ANY other field on that row silently
// rewrites what the money was filed under. Nothing errors and the total moves.
//
// It happened on 13 Sep 2026. Rebuilding the lists around payment methods
// dropped Amazon, eBay, Lockaway Storage, Shein and T-Mobile: 38 real expense
// rows, $4,818 between them, each one edit away from being refiled.
//
// A static check cannot catch this, because the data is half of it. That is why
// it lives here and not in check-consistency.js.
async function originsAreSelectable() {
  const lists = require(path.join(APP, "lib", "channels"));
  const METHOD = [...new Set(
    lists.PAYMENT_METHODS.filter((m) => m !== "Unpaid").map((m) => lists.LEDGER_ORIGIN[m]).filter(Boolean)
  )];
  // Mirrors components/AdminView.js. Restated here on purpose: the point is to
  // notice when the two DISAGREE, so importing the component's copy would make
  // the check unable to fail.
  const INCOME = [...METHOD, "Other"];
  const EXPENSE = [...METHOD, "Wells Fargo Statement", "Woodforest Statement", "Gmail Statement",
    "T-Mobile Statement", "Amazon", "eBay", "Lockaway Storage", "Shein Statement", "Other"];

  const rows = await prisma.ledgerEntry.groupBy({
    by: ["type", "origin"],
    _count: { _all: true },
    _sum: { amount: true },
  });
  for (const r of rows) {
    if (!r.origin) continue; // no origin at all is a separate, visible gap
    const allowed = r.type === "income" ? INCOME : EXPENSE;
    if (allowed.includes(r.origin)) continue;
    fail(2, "ledger",
      '"' + r.origin + '" is filed on ' + r._count._all + " " + r.type + " row(s) but is not in the console's list",
      "$" + (r._sum.amount || 0).toFixed(2) + " — the dropdown cannot display it, so editing any other "
      + "field on one of those rows silently refiles it as \"" + allowed[0] + "\". Add it to "
      + (r.type === "income" ? "RESERVATION_ORIGINS" : "STATEMENT_ORIGINS") + " in components/AdminView.js, "
      + "or correct the rows.");
  }

  // The same thing spelled two ways is two things to every total.
  //
  // The trailing word "Statement" is dropped as well as case and punctuation,
  // because that is where the real duplicates were: "Gmail" / "Gmail Statement"
  // and "T-Mobile" / "Tmobile Statement" split four totals between them for
  // months. Folding only case and spaces — which is what this check did when
  // first written — matched neither pair and reported all clear, a check that
  // could not fail for the exact fault it was built for.
  //
  // "Cash" and "Cash App Statement" still differ, which is correct: they are
  // genuinely two ways of being paid, not two spellings of one.
  const normalise = (s) => String(s).toLowerCase().replace(/[\s\-_.]+/g, "").replace(/statements?$/, "");
  const seen = new Map();
  for (const r of rows) {
    if (!r.origin) continue;
    const key = normalise(r.origin);
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key).add(r.origin);
  }
  for (const [, spellings] of seen) {
    if (spellings.size < 2) continue;
    fail(2, "ledger", "one origin spelled " + spellings.size + " ways: " + [...spellings].map((s) => '"' + s + '"').join(" and "),
      "Every total splits between them, and neither figure is the real one. Pick one spelling and merge.");
  }
}

// CAN THE CODE THAT IS ACTUALLY DEPLOYED STILL READ THIS DATABASE?
//
// On 13 Sep 2026 the owner console stopped loading entirely. It looked like a
// phone problem. It was not: `Subscription.amount` had been widened to nullable
// and five rows set to NULL, while the deployed build still declared
// `amount Float` — required. Prisma refuses to return null for a required field,
// so the subscriptions query threw, the console hung on "loading", and nothing
// anywhere said why.
//
// Widening a column is normally the SAFE direction to migrate. It stops being
// safe the moment a value is written that the old code cannot represent, which
// is exactly what happened. The window between "schema pushed" and "code
// deployed" is where this lives.
//
// So the comparison is deliberately against the DEPLOYED schema — origin/main,
// not the working tree — because the working tree is by definition already
// fixed. And it only fails when a NULL is actually present: a nullable column
// with no nulls in it breaks nothing today, and crying about it would train
// somebody to ignore this check.
async function deployedSchemaCanReadTheDatabase() {
  let schema;
  try {
    schema = execFileSync("git", ["show", "origin/main:prisma/schema.prisma"], {
      cwd: APP, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return; // no git, or no origin/main to compare against — nothing to say
  }

  // Required scalar fields per model. A field is required when its type carries
  // no "?" and it is not a list; relations are skipped because they are not
  // columns. Prisma's default mapping is used throughout this schema — model
  // name is the table, field name is the column — so no @@map handling is needed.
  const models = {};
  let current = null;
  for (const raw of schema.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    const open = line.match(/^model\s+(\w+)\s*\{/);
    if (open) { current = open[1]; models[current] = []; continue; }
    if (line === "}") { current = null; continue; }
    if (!current || !line) continue;
    const field = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
    if (!field) continue;
    const [, name, type, list, optional] = field;
    if (list || optional) continue;
    if (/^(String|Int|Float|Boolean|DateTime|Json|BigInt|Decimal|Bytes)$/.test(type) === false) continue;
    if (/@relation/.test(line)) continue;
    models[current].push(name);
  }

  const cols = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'`
  );
  const byTable = new Map();
  for (const c of cols) {
    if (!byTable.has(c.table_name)) byTable.set(c.table_name, new Map());
    byTable.get(c.table_name).set(c.column_name, c.is_nullable === "YES");
  }

  for (const [model, fields] of Object.entries(models)) {
    const table = byTable.get(model);
    if (!table) continue; // model has no table yet: a migration not pushed, not this check's business
    for (const field of fields) {
      if (!table.has(field)) {
        fail(1, "deployed schema",
          `the deployed build expects ${model}.${field}, and the database has no such column`,
          "Every read of that model throws. Push the migration, or roll the deploy back.");
        continue;
      }
      if (!table.get(field)) continue; // NOT NULL in the database: nothing can break

      const [{ n }] = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM "${model}" WHERE "${field}" IS NULL`
      );
      if (n > 0) {
        fail(1, "deployed schema",
          `${model}.${field} is NULL on ${n} row(s), and the deployed build declares it required`,
          "Prisma will not return null for a required field, so every query touching " + model
          + " throws — which shows up as a page that never finishes loading, with no error anywhere. "
          + "Deploy the code that makes it optional, or fill those rows in.");
      }
    }
  }
}

// "POSTED" SHOULD MEAN SOMEBODY CAN GO AND LOOK AT IT.
//
// Publishing through Blotato is asynchronous: it ACCEPTS a post, queues it, and
// can fail minutes later. Marking a draft posted on the strength of the accept
// records an intention, not an outcome.
//
// Christina's testimonial is what this looks like when it works out. Blotato
// failed it twice on 11 Sep 2026 — two error emails, neither read by anything —
// and then published it on the 12th. The record was right in the end, two days
// late, and nothing in the system knew either fact.
//
// The postUrl is the proof, because it can only exist once the platform has
// given back a real address. Fifteen of the eighteen posted drafts have one. A
// draft marked posted WITHOUT one is a claim nobody can check.
//
// Not tier 1: no guest is stuck. But an unpublished post is money quietly not
// earned, and the whole reason this file exists is that a success which was not
// a success says nothing on its own.
async function postedWithoutProof() {
  const posted = await prisma.mediaDraft.findMany({
    where: { status: "posted" },
    select: { id: true, platform: true, scheduledDate: true, postedAt: true, postUrl: true, caption: true },
  });
  const unproven = posted.filter((d) => !String(d.postUrl || "").trim());
  if (!unproven.length) return;

  // Grouped into one finding: these fail in batches, one per platform for the
  // same post, and three separate lines for one caption reads as three problems.
  const byDate = new Map();
  for (const d of unproven) {
    const k = d.scheduledDate || "no date";
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(d);
  }
  for (const [date, drafts] of byDate) {
    const where = drafts.map((d) => d.platform || "unknown platform").join(", ");
    fail(2, "publishing",
      drafts.length + " post" + (drafts.length === 1 ? "" : "s")
        + " for " + date + " are marked posted with no link to show for it (" + where + ")",
      "“" + String(drafts[0].caption || "").replace(/\s+/g, " ").slice(0, 60) + "…” — "
      + "every other posted draft carries a postUrl, which only exists once the platform hands back a real address. "
      + "Blotato accepts a post and can fail it minutes later, so being marked posted proves it was sent, not that it ran. "
      + "Open the account and check; if it did go out, paste the link onto the draft.");
  }
}

(async () => {
  await paidButSilent();
  await originsAreSelectable();
  await deployedSchemaCanReadTheDatabase();
  await postedWithoutProof();
  await datesNotHeld();
  await fakeDates();
  await addOnPricing();
  await unreachableBookings();
  await photosOwed();
  await chartersOwed();
  await moneyNotOnTheBooks();
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
