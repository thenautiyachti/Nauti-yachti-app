// What actually occupies a boat on a day, from BOTH tables.
//
// WHY THIS EXISTS. The public calendar read ExternalBooking alone. That is the
// diary the Stripe webhook writes to, so a card booking blocks its date
// correctly -- but a booking confirmed any other way does not. The owner takes
// bookings by text and marks the Inquiry "booked"; nothing creates a diary row
// for those, so the day stayed on sale and could be sold twice.
//
// Nothing had gone wrong yet when this was written (5 Sep 2026): the only
// booked Inquiry was Oscar's, and his date was held because he paid by card.
// The hole was one text-message booking away, and the manual had just finished
// documenting that exact workflow.
//
// THE DOUBLE-COUNT TRAP, which is the whole reason this is a function and not
// two lines at each call site. A website booking that was paid for exists in
// BOTH tables by design -- the Inquiry is the enquiry-and-payment record, the
// ExternalBooking is the diary entry. Adding the two lists together counts its
// hours twice, and a 4-hour charter counted as 8 flips a partial day to "full"
// and takes a boat off sale that was actually available. Same twin, same rule
// as the console's bookings list: the ExternalBooking wins.
//
// Deduping is deliberately by bookingId ONLY, never by date+vessel. Two real
// charters on one boat in one day is normal -- a morning and an evening trip --
// and collapsing those would under-count the day and oversell it, which is the
// failure this module exists to prevent.

const { holdsTheDay, INQUIRY_STATUS_BUCKET } = require("./bookingStatus");

// An Inquiry's status vocabulary is its own ("new", "pending", ...), so it is
// mapped into the shared buckets before being judged. A "pending" enquiry
// occupies nothing; only a booked one does.
function inquiryHoldsTheDay(inquiry) {
  if (!inquiry || !inquiry.date || !inquiry.vesselId) return false;
  const bucket = INQUIRY_STATUS_BUCKET[inquiry.status] || inquiry.status;
  return holdsTheDay(bucket);
}

// The merged list, shaped like ExternalBooking rows because that is what
// groupExternalBookingState and every existing caller already understand.
function occupyingRows(externalBookings, inquiries) {
  const ext = (externalBookings || []).filter((b) => b && holdsTheDay(b.status));

  // Every booking id the diary already accounts for.
  const inDiary = new Set(ext.map((b) => b.bookingId).filter(Boolean));

  const fromInquiries = (inquiries || [])
    .filter(inquiryHoldsTheDay)
    .filter((i) => !(i.bookingId && inDiary.has(i.bookingId)))
    .map((i) => ({
      // Only the fields that decide occupancy. Deliberately not the guest's
      // name, phone or email: this list is handed to the PUBLIC availability
      // calendar, and the page payload is readable with "view source".
      id: i.id,
      bookingId: i.bookingId || null,
      vesselId: i.vesselId,
      date: i.date,
      hours: i.hours,
      startTime: i.startTime || null,
      status: "booked",
      source: "inquiry",
    }));

  return [...ext, ...fromInquiries];
}

module.exports = { occupyingRows, inquiryHoldsTheDay };
