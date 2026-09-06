// The charter you are actually on, right now.
//
// Everything the dock page does — gate codes, hours, fuel, weather — is in
// service of a charter that is happening, and the page never said which one.
// The owner asked for "current basic charter information" while on the water,
// and the honest reason it matters is that the answers are all on a desktop at
// home: who is aboard, how many of them, what they paid for, and above all what
// time they have to be back. Running long is unpaid; running short is a refund
// conversation at the dock.

// Times arrive as "11:00", "11:00 AM", "11am" or "1:30 pm" depending on who
// typed them. All of those are the same moment and none of them should be a
// parse failure that hides a charter.
function parseTimeOfDay(raw) {
  const s = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const suffix = m[3];
  if (hour > 23 || minute > 59) return null;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  return { hour, minute };
}

// The window a charter occupies, in local time — which is the phone's time, and
// the phone is on the lake, so local is right.
//
// Returns null when there is not enough to place it: a charter with no start
// time is a real row that simply cannot be put on a clock, and guessing 9am
// would produce a countdown to a deadline nobody agreed to.
function charterWindow(booking, hoursFallback) {
  if (!booking || !booking.date) return null;
  const t = parseTimeOfDay(booking.startTime);
  if (!t) return null;
  const [y, mo, d] = String(booking.date).split("-").map(Number);
  if (!y || !mo || !d) return null;
  const start = new Date(y, mo - 1, d, t.hour, t.minute, 0, 0);
  const hours = Number(booking.hours) > 0 ? Number(booking.hours)
    : Number(hoursFallback) > 0 ? Number(hoursFallback) : null;
  if (!hours) return { startMs: start.getTime(), endMs: null, hours: null };
  return { startMs: start.getTime(), endMs: start.getTime() + hours * 3600000, hours };
}

// Only a charter that is actually running counts as "on the water". A booking
// marked cancelled has no business showing up on the helm.
const LIVE = new Set(["booked", "completed"]);

// What is happening now, and what is next.
//
// `now` sits inside a window → that is the charter. Otherwise the next one
// starting today, so the morning shows the 11am before it begins rather than
// an empty screen. A grace period on the end keeps the card up through the
// tie-up and the goodbyes, which is exactly when hours and fuel get logged.
const GRACE_MINUTES = 45;

function charterNow(bookings, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  let running = null;
  let next = null;
  for (const b of bookings || []) {
    if (!b || !LIVE.has(b.status)) continue;
    const w = charterWindow(b);
    if (!w) continue;
    const end = w.endMs == null ? w.startMs + 4 * 3600000 : w.endMs;
    if (now >= w.startMs && now <= end + GRACE_MINUTES * 60000) {
      // Two charters can overlap on different boats. The one that started
      // most recently is the one being stood on.
      if (!running || w.startMs > running.window.startMs) running = { booking: b, window: w };
    } else if (w.startMs > now) {
      if (!next || w.startMs < next.window.startMs) next = { booking: b, window: w };
    }
  }
  return { running, next };
}

// Minutes until the charter is due back. Negative means it has run over, which
// is the number worth seeing — "20 minutes over" is a billing fact.
function minutesLeft(window, nowMs) {
  if (!window || window.endMs == null) return null;
  const now = nowMs == null ? Date.now() : nowMs;
  return Math.round((window.endMs - now) / 60000);
}

// "1h 20m", "35m", "20m over". Written for a glance in sunlight.
function humanLeft(mins) {
  if (mins == null) return null;
  const over = mins < 0;
  const n = Math.abs(mins);
  const h = Math.floor(n / 60);
  const m = n % 60;
  const body = h ? `${h}h ${m}m` : `${m}m`;
  return over ? `${body} over` : body;
}

// The add-ons a guest paid for, so nobody gets back to the dock having
// forgotten the balloons. addOnIds lives on Inquiry, not ExternalBooking, so
// the two are joined by bookingId — the shared key that already exists.
function addOnsFor(booking, inquiries, addOns) {
  if (!booking || !booking.bookingId) return [];
  const inq = (inquiries || []).find((i) => i && i.bookingId === booking.bookingId);
  if (!inq || !inq.addOnIds) return [];
  let ids;
  try {
    ids = JSON.parse(inq.addOnIds);
  } catch {
    return [];
  }
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id) => (addOns || []).find((a) => a && a.id === id))
    .filter(Boolean)
    .map((a) => ({ id: a.id, name: a.name || a.label || "Add-on" }));
}

module.exports = {
  parseTimeOfDay, charterWindow, charterNow, minutesLeft, humanLeft, addOnsFor,
  GRACE_MINUTES, LIVE,
};
