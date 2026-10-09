// WHICH RESERVATION AN "ADD TIME" CHARGE BELONGS TO.
//
// Owner, 9 Oct 2026, after Erika's extra two hours showed up as three separate
// lines in Bookings: "I want to see it all in the NY- reservation. This is where
// all her media and her two separate payment transactions should reside ... it
// should all stay with that one single reservation."
//
// An extension is still its own Inquiry, because it needs its own /pay/<id>
// link and its own Stripe checkout. What ties it to the charter is its
// bookingId: the parent's number plus "-X1", "-X2", ... So NY-20261009-01-X1 is
// the first extension of NY-20261009-01. A parent with no booking number uses
// its row id instead.
//
// No schema change, on purpose: a live schema change needs the owner's OK and
// has to go in before the code, and a suffix on a column that already exists
// carries everything needed.
//
// Every screen that lists or counts bookings asks isExtensionRef() and leaves
// these rows to their parent: the Bookings list shows them as payments under
// it, the payment webhook folds the hours and money into it, and the calendar,
// the availability check and the guest's trip list skip them.
//
// Pure, with no requires, so the console (a client component) can use it too.

const EXT_RE = /^(.+)-X(\d+)$/;

function extensionRef(parentRef, n) {
  return `${parentRef}-X${n}`;
}

// The parent's booking number (or row id), or null for an ordinary booking.
function parentRefOf(bookingId) {
  const m = String(bookingId || "").match(EXT_RE);
  return m ? m[1] : null;
}

function isExtensionRef(bookingId) {
  return parentRefOf(bookingId) !== null;
}

module.exports = { extensionRef, parentRefOf, isExtensionRef };
