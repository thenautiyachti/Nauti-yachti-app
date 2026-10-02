// Booking ID format: "NY-YYYYMMDD-NN", e.g. "NY-20260529-01". NN is a daily
// sequence starting at 01, counted across BOTH Inquiry and ExternalBooking
// together for that date — so a site booking and an external booking on the
// same day share one counter rather than each numbering independently.
//
// Only ever called for NEW rows going forward. Historical rows are never
// backfilled — they keep a null bookingId, which the admin console renders
// as a blank/em-dash.
//
// A NUMBER IS NEVER ISSUED TWICE. Owner, 1 Oct 2026, approving the fix: a
// deleted booking's number must never be given to somebody else, so no two
// guests share a number across emails and Stripe. Until then the next number
// was simply "the highest one still in the tables, plus one" — so deleting the
// highest booking of a day handed its number straight to the next guest, while
// the first guest's confirmation email and Stripe receipt still carried it.
//
// So every day keeps a HIGH-WATER MARK: the highest sequence ever issued for
// it, in the ConsoleSetting shelf under "bookingIdHigh:NY-YYYYMMDD". The next
// number is one past whichever is higher, the mark or the tables. It does not
// matter how a row disappears — the console's delete, a script, raw SQL — the
// mark remembers that its number was used.
//
// Two limits, stated rather than hidden:
//   - A number deleted BEFORE 1 Oct 2026 left no mark and cannot be known now.
//   - Two bookings created at the same instant can still draw the same number.
//     The owner judged that unlikely at this volume and chose not to fix it.
//
// The mark is written once a number is drawn, before the row is created. If
// creating the row then fails, the number is simply skipped: a gap in the
// sequence is harmless, a repeat is not.

const MARK_PREFIX = "bookingIdHigh:";

/** "2026-09-19" -> "NY-20260919-" */
function prefixFor(date) {
  return `NY-${String(date).replace(/-/g, "")}-`;
}

/**
 * The next sequence number, from the numbers still in the tables and the
 * day's high-water mark. Pure, so it can be tested.
 */
function nextSequence(liveIds, prefix, highWater) {
  let maxSeq = Number(highWater) || 0;
  for (const id of liveIds || []) {
    if (!id || !String(id).startsWith(prefix)) continue;
    const n = parseInt(String(id).slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return maxSeq + 1;
}

/** 7 -> "07"; a day past 99 bookings keeps counting rather than truncating. */
function formatId(prefix, seq) {
  return `${prefix}${seq < 100 ? String(seq).padStart(2, "0") : String(seq)}`;
}

/**
 * `client` is optional: the app passes nothing and gets lib/db's Prisma
 * client; a script with its own client (scripts/add-booking.js) passes that,
 * so both draw from the same sequence and the same mark.
 */
async function generateBookingId(date, client) {
  if (!date) return null;
  const db = client || require("./db").prisma;

  const prefix = prefixFor(date);
  const markKey = MARK_PREFIX + prefix.slice(0, -1);

  const [inquiries, externalBookings, mark] = await Promise.all([
    db.inquiry.findMany({ where: { bookingId: { startsWith: prefix } }, select: { bookingId: true } }),
    db.externalBooking.findMany({ where: { bookingId: { startsWith: prefix } }, select: { bookingId: true } }),
    db.consoleSetting.findUnique({ where: { key: markKey } }).catch(() => null),
  ]);

  const next = nextSequence(
    [...inquiries, ...externalBookings].map((r) => r.bookingId),
    prefix,
    mark ? parseInt(mark.value, 10) : 0,
  );

  // Remembered before it is used. A failure here is logged and the booking
  // still goes ahead: refusing a guest because the mark could not be written
  // would cost a charter to protect against a rare delete.
  await db.consoleSetting.upsert({
    where: { key: markKey },
    update: { value: String(next) },
    create: { key: markKey, value: String(next) },
  }).catch((e) => console.error("[bookingId] could not record the high-water mark for " + markKey + ":", e.message));

  return formatId(prefix, next);
}

/**
 * Called BEFORE a booking row is deleted: raise its day's mark to at least this
 * number. Needed for rows numbered before the mark existed (1 Oct 2026), which
 * no generateBookingId call has recorded yet. Never lowers a mark. Never throws:
 * a delete is not blocked by bookkeeping about numbers.
 */
async function rememberBookingId(bookingId, client) {
  const m = String(bookingId || "").match(/^(NY-\d{8})-(\d+)$/);
  if (!m) return;
  const db = client || require("./db").prisma;
  const key = MARK_PREFIX + m[1];
  const seq = parseInt(m[2], 10);
  try {
    const mark = await db.consoleSetting.findUnique({ where: { key } });
    if (mark && parseInt(mark.value, 10) >= seq) return;
    await db.consoleSetting.upsert({
      where: { key },
      update: { value: String(seq) },
      create: { key, value: String(seq) },
    });
  } catch (e) {
    console.error("[bookingId] could not remember " + bookingId + " before deleting it:", e.message);
  }
}

module.exports = { generateBookingId, rememberBookingId, nextSequence, formatId, prefixFor, MARK_PREFIX };
