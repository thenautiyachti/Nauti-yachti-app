// SEATS ON A DATED EVENT, AND WHETHER IT IS STILL ON SALE.
//
// One place for both questions, because the public /glow page, the booking
// form, the checkout routes and the owner console all ask them, and every
// copy that has ever been typed out separately has drifted (see the history in
// app/glow/page.js). Pure functions: no database, so the console can run the
// same count in the browser on the rows it already has.
//
// "Dated event" means a package with an eventDate. Today that is only Boatz &
// Glowz. Every other package is a charter on a date the guest chooses, and
// none of this applies to it.

const { INQUIRY_STATUS_BUCKET, holdsTheDay, isCancellation } = require("./bookingStatus");
const { isRealInquiry } = require("./crewList");

// THE LAKE'S DATE, NOT THE SERVER'S.
//
// The site runs on servers that keep UTC. At 7pm in Conroe it is already
// tomorrow in UTC, so a plain `new Date()` would close the night's sales while
// the boats were still loading at the ramp. Every date this business deals in
// is a Lake Conroe date.
function lakeTodayKey(now = new Date()) {
  // en-CA formats as YYYY-MM-DD, the same shape as every date column here.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isDatedEvent(pkg) {
  return !!(pkg && pkg.eventDate);
}

// CLOSED ONCE THE NIGHT HAS PASSED, AND REOPENED BY DATING THE NEXT ONE.
//
// Owner, 1 Oct 2026: "the season is over. Close seat purchases now. No reopen
// date yet." Until then, the package still said 19 September and the booking
// form still offered it: a guest could have paid for a night that had already
// happened.
//
// A date rule rather than an on/off switch, because a switch is one more thing
// to remember twice a year and the date already carries the answer. Sales stay
// open through the day itself; they close at midnight, lake time. To reopen,
// set the package's eventDate to the next night. That reopens sales the same
// moment it is saved, so do not set a date before you want to sell seats.
function eventSalesOpen(pkg, now = new Date()) {
  if (!isDatedEvent(pkg)) return true;
  return pkg.eventDate >= lakeTodayKey(now);
}

// WHY A PUBLIC BOOKING FOR A DATED EVENT IS REFUSED, OR NULL IF IT IS NOT.
//
// The booking form hides a closed night, and a form is not a control: anything
// can POST to the checkout and inquiry routes. Both ask this.
//
// The date must also be the event's own. The form fills it in and never lets
// the guest change it, so any other date is a crafted request — and the seat
// count, which counts only the event's date, would never see that booking.
function eventBookingRefusal(pkg, requestedDate, now = new Date()) {
  if (!isDatedEvent(pkg)) return null;
  if (!eventSalesOpen(pkg, now)) {
    return {
      error: "Seats for that night are closed. The next date isn't set yet — join the crew list at /glow to hear first.",
      salesClosed: true,
    };
  }
  if (requestedDate && requestedDate !== pkg.eventDate) {
    return { error: "That event only runs on " + pkg.eventDate + ".", wrongDate: true };
  }
  return null;
}

// CONFIRMED, TENTATIVE, OR NOT HOLDING A SEAT.
//
// Owner, 1 Oct 2026: tentative seats "still count against capacity, but show
// them separately, like a Facebook event" — "12 seats confirmed, 18 seats
// tentatively, 10 seats available".
//
//   confirmed  booked or completed: the same two statuses that hold a day on
//              the calendar (holdsTheDay).
//   tentative  everything else short of cancelled: a live inquiry, a lapsed
//              one, an owed charter, and any status this code does not know.
//              An unknown status lands here on purpose: counting a seat that
//              turns out to be free under-sells by one, while not counting a
//              real one sells it twice.
//   null       cancelled. Nobody is expecting that seat.
//
// LAPSED NOW COUNTS. Until 1 Oct 2026 a lapsed website inquiry released its
// seats. The owner's rule puts lapsed with the tentative seats, so somebody who
// asked and went quiet still holds their place until the row is cancelled.
//
// Inquiry rows speak a different vocabulary ("new", "pending"), mapped onto the
// booking one by the same table the console uses.
function seatClass(status, kind) {
  const s = String(status || "").toLowerCase();
  const bucket = kind === "inquiry" ? (INQUIRY_STATUS_BUCKET[s] || s) : s;
  if (isCancellation(bucket)) return null;
  if (holdsTheDay(bucket)) return "confirmed";
  return "tentative";
}

// HOW MANY SEATS, AND WHOSE.
//
//   vessels     [{ id, capacity }]: the fleet, capacity including the captain
//   vesselIds   the boats this event runs
//   eventDate   "YYYY-MM-DD"
//   bookings    ExternalBooking rows: { date, status, partySize, bookingId }
//   inquiries   Inquiry rows: the same fields, plus packageId
//
// Returns null when there is no capacity to count against, which callers treat
// as "say nothing about seats" rather than "sold out".
function countSeats({ vessels, vesselIds, eventDate, bookings = [], inquiries = [] }) {
  // The captain occupies a seat on every boat, so guest capacity is one less
  // per hull. Getting this wrong oversells the fleet by three.
  const capacity = (vessels || [])
    .filter((v) => (vesselIds || []).includes(v.id))
    .reduce((n, v) => n + Math.max(0, (Number(v.capacity) || 0) - 1), 0);
  if (!capacity) return null;

  // ONE CHARTER, TWO ROWS — COUNT IT ONCE.
  //
  // A website checkout writes a row in BOTH tables under the same booking
  // number: the inquiry the guest filled in, and the mirror booking that blocks
  // the date. On 18 Sep 2026 one guest's two seats were counted twice and the
  // page told the public "4 seats left" when there were 6.
  //
  // The booking row wins, as it does in the console: it is the charter, and
  // its status is the one the owner keeps up to date. A row with no booking
  // number cannot be a duplicate of anything, so it keeps its own identity.
  const rows = [
    ...(bookings || []).map((r) => ({ ...r, kind: "external" })),
    ...(inquiries || []).filter(isRealInquiry).map((r) => ({ ...r, kind: "inquiry" })),
  ];
  const seen = new Set();
  let confirmed = 0;
  let tentative = 0;
  for (const r of rows) {
    // Deduped BEFORE the date is checked, so a charter moved to another night
    // takes its inquiry twin with it instead of leaving it behind on this one.
    const key = r.bookingId;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    if (r.date !== eventDate) continue;
    const cls = seatClass(r.status, r.kind);
    const n = Number(r.partySize) || 0;
    if (cls === "confirmed") confirmed += n;
    else if (cls === "tentative") tentative += n;
  }

  return {
    capacity,
    confirmed,
    tentative,
    available: Math.max(0, capacity - confirmed - tentative),
  };
}

module.exports = {
  lakeTodayKey,
  isDatedEvent,
  eventSalesOpen,
  eventBookingRefusal,
  seatClass,
  countSeats,
};
