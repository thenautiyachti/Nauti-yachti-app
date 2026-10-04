// Every trip a returning guest can open with the phone they signed in with.
// No database here: the sign-in route fetches the candidate rows and this
// decides which belong to that phone.
//
// Owner, 3 Oct 2026, of two guests who each booked twice: "For repeat guests
// do they have to log in separately on each one or is there a way we can
// combine it?" So Guest Login, once a booking number and its phone match,
// lists every trip booked on that phone, each opening its own trip page.
//
// WHY THIS GIVES NOBODY ANYTHING NEW. The phone is what keeps a trip page
// closed: booking numbers are a date and a counter, so anyone holding the
// phone could already open each of these trips one at a time. Listing them
// together saves the guest the guessing, and opens nothing they could not.
//
// WHY THE TRIP PAGE ITSELF DOES NOT LIST THEM. A trip link gets forwarded to
// the whole party, most of whom were not on the booker's other trips. The link
// opens one trip; only the phone opens them all.
const { bookingPhones } = require("./bookingPhones");
const { lastTen } = require("./tripLink");

// Real trips only: not an enquiry that never booked, one that lapsed, or one
// that was cancelled. A refunded trip still happened on paper, and has a page.
const SHOWN = new Set(["booked", "owed", "completed", "refunded"]);

// externals: ExternalBooking rows; inquiries: Inquiry rows (a paid website
// booking has both, with the same number, and the ExternalBooking wins).
function tripsSharingPhone(externals, inquiries, phone) {
  const want = lastTen(phone);
  if (!want) return [];
  const byRef = new Map();
  for (const e of externals || []) {
    if (!e || !e.bookingId || !SHOWN.has(e.status)) continue;
    if (!bookingPhones(e).some((p) => lastTen(p.number) === want)) continue;
    byRef.set(e.bookingId, { ref: e.bookingId, date: e.date || null, packageName: e.packageName || null, vesselName: e.vesselName || null, status: e.status });
  }
  for (const i of inquiries || []) {
    if (!i || !i.bookingId || byRef.has(i.bookingId) || !SHOWN.has(i.status)) continue;
    if (lastTen(i.phone) !== want) continue;
    byRef.set(i.bookingId, { ref: i.bookingId, date: i.date || null, packageName: i.packageName || null, vesselName: i.vesselName || null, status: i.status });
  }
  // Newest first: the next trip, then the last one, then the older ones.
  return [...byRef.values()].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

module.exports = { tripsSharingPhone, SHOWN };
