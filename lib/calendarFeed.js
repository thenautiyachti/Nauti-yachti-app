// The bookings calendar feed: every charter that holds a day, as an iCalendar
// (.ics) file Google Calendar can subscribe to.
//
// WHY A FEED AND NOT A SYNC (owner, 9 Oct 2026). He asked for every upcoming
// reservation to appear on the Nauti Yachti Google Calendar. A subscribed feed
// needs no agent, no PC left on and no permissions, and it cannot drift: a
// cancelled booking simply stops being in the file. The cost is that Google
// refreshes subscribed calendars on its own schedule (typically every few
// hours), which he accepted.
//
// WHAT AN EVENT SHOWS (his choice: "working details"): package, boat, start and
// length, party size, the guest's FIRST name, the booking number, how it was
// booked and whether it is paid, and a link to the console. No phone, no email,
// no dock address -- a calendar gets shared and screenshotted, and the feed URL
// is a secret that could leak.
//
// THE URL IS THE KEY. /api/calendar/<token>.ics, where the token is an HMAC of
// SESSION_SECRET, so no new secret had to be created. Rotating SESSION_SECRET
// changes the link (resubscribe once). The console shows the link to a
// signed-in owner only (/api/admin/calendar-feed).
const crypto = require("crypto");

const SITE = "https://www.thenautiyachti.com";
const TZ = "America/Chicago";
const PAST_DAYS = 30;

function feedToken() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update("calendar-feed-v1").digest("hex").slice(0, 32);
}

function tokenMatches(given) {
  const want = feedToken();
  if (!want || typeof given !== "string" || given.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

// RFC 5545 text escaping and 75-octet line folding.
const esc = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line) {
  const out = [];
  let buf = "";
  for (const ch of line) {
    if (Buffer.byteLength(buf + ch, "utf8") > (out.length ? 74 : 75)) { out.push(buf); buf = ""; }
    buf += ch;
  }
  out.push(buf);
  return out.join("\r\n ");
}

const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const ymd = (iso) => String(iso).replace(/-/g, "");
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// "10:00" + 4 hours -> local date-time strings; rolls past midnight correctly.
function localRange(date, startTime, hours) {
  const [h, m] = String(startTime).split(":").map(Number);
  const start = new Date(Date.UTC(...date.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))), h, m || 0));
  const end = new Date(start.getTime() + (Number(hours) > 0 ? Number(hours) : 4) * 3600000);
  const f = (d) => d.toISOString().replace(/[-:]/g, "").slice(0, 15);
  return [f(start), f(end)];
}

// Bookings from both tables, in one shape. Same rule as the availability
// calendar (lib/occupancy.js): a row is on the calendar when it holds the day.
function feedEvents({ externalBookings = [], inquiries = [], today }) {
  const { holdsTheDay, INQUIRY_STATUS_BUCKET } = require("./bookingStatus");
  const since = addDays(today, -PAST_DAYS);
  const rows = [];
  const inDiary = new Set();
  for (const b of externalBookings) {
    if (!b || !b.date || !holdsTheDay(b.status) || b.date < since) continue;
    if (b.bookingId) inDiary.add(b.bookingId);
    rows.push({
      uid: "ext-" + b.id, date: b.date, startTime: b.startTime, hours: b.hours,
      packageName: b.packageName, vesselName: b.vesselName, partySize: b.partySize,
      guest: firstName(b.guestName), ref: b.bookingId, via: b.platform,
      paid: b.paymentStatus === "paid", status: b.status, updated: b.createdAt,
    });
  }
  for (const i of inquiries) {
    const bucket = INQUIRY_STATUS_BUCKET[i.status] || i.status;
    if (!i || !i.date || !i.vesselId || !holdsTheDay(bucket) || i.date < since) continue;
    if (i.bookingId && inDiary.has(i.bookingId)) continue;
    rows.push({
      uid: "inq-" + i.id, date: i.date, startTime: null, hours: i.hours,
      packageName: i.packageName, vesselName: i.vesselName, partySize: i.partySize,
      guest: firstName(i.name), ref: i.bookingId, via: "Website",
      paid: i.paymentStatus === "paid", status: bucket, updated: i.submittedAt,
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function buildIcs(events, { now = new Date(), calName = "Nauti Yachti charters" } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Nauti Yachti//Bookings feed//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + esc(calName), "X-WR-TIMEZONE:" + TZ,
    // Suggest an hourly refresh. Google decides for itself, but some clients obey.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    // America/Chicago since 2007: DST from the 2nd Sunday of March to the 1st Sunday of November.
    "BEGIN:VTIMEZONE", "TZID:" + TZ,
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0600", "TZOFFSETTO:-0500", "TZNAME:CDT", "DTSTART:20070311T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0600", "TZNAME:CST", "DTSTART:20071104T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const e of events) {
    const boat = e.vesselName || "Boat TBD";
    const pkg = e.packageName || "Charter";
    const party = e.partySize ? ` (${e.partySize} guests)` : "";
    const summary = `${pkg} · ${boat}${party}`;
    const desc = [
      e.guest && `Guest: ${e.guest}`,
      e.ref && `Booking: ${e.ref}`,
      e.partySize && `Party size: ${e.partySize}`,
      `Package: ${pkg}`,
      `Boat: ${boat}`,
      e.hours && `Length: ${e.hours} hr`,
      e.via && `Booked via: ${e.via}`,
      `Payment: ${e.paid ? "paid" : "not marked paid"}`,
      e.status === "completed" ? "Status: completed" : null,
      `Console: ${SITE}/admin`,
    ].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", "UID:" + e.uid + "@thenautiyachti.com", "DTSTAMP:" + stamp);
    if (e.startTime && /^\d{1,2}:\d{2}$/.test(e.startTime)) {
      const [s, en] = localRange(e.date, e.startTime, e.hours);
      lines.push(`DTSTART;TZID=${TZ}:${s}`, `DTEND;TZID=${TZ}:${en}`);
    } else {
      // No start time on record: an all-day entry, which says "this boat is out today".
      lines.push("DTSTART;VALUE=DATE:" + ymd(e.date), "DTEND;VALUE=DATE:" + ymd(addDays(e.date, 1)));
    }
    lines.push("SUMMARY:" + esc(summary), "DESCRIPTION:" + esc(desc), "STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

module.exports = { feedToken, tokenMatches, feedEvents, buildIcs, PAST_DAYS };
