// The "crew list" — a plain name + email capture, kept deliberately separate
// from a real booking inquiry.
//
// Why it lives inside the Inquiry table rather than its own model: the
// business currently keeps NO guest contact details anywhere. Boatsetter and
// GetMyBoat don't hand over a real email address, and the site's own Inquiry
// table is empty, so there is no mailing list at all today. Inquiry already
// has name/email/phone columns and already renders in the owner console, so
// routing signups there produces a usable list immediately, with no schema
// migration against the live production database.
//
// Crew-list rows carry this sentinel packageId so the admin console can keep
// them out of the real bookings pipeline and count them separately.
const CREW_LIST_PACKAGE_ID = "crewlist";
const CREW_LIST_PACKAGE_NAME = "Crew List — email signup";

// Storing contacts here rather than in a new Guest table is deliberate and
// matches the reasoning already written down in
// prisma/proposed-contact-and-reconciliation.sql, which explicitly defers a
// Guest/Customer table until "a few dozen real addresses have accumulated".
// This is the screen that accumulates them. Once it has, that table — with a
// proper marketingOptOut column — becomes worth building.
//
// UNSUBSCRIBE, until then: the form promises people can opt out, so the owner
// must honour it manually. Set the row's status to "lapsed" in the Inquiries
// tab and skip "lapsed" rows when mailing the list. That is a manual step, and
// it is the main reason this arrangement is a starting point rather than a
// destination.
const CREW_LIST_UNSUBSCRIBED_STATUS = "lapsed";

// A second kind of non-booking row: someone who was ON a charter but was not
// the name it was booked under -- a friend in the party whose number is worth
// keeping for a follow-up or a second review ask.
//
// It shares the Inquiry table for the same reason the crew list does, and it
// needs the same guard: without one, an added contact inflates "Inquiries (1)",
// which the owner reads as "somebody enquired about a charter". Every actual
// guest already appears under Bookings, so this list is deliberately only the
// extra people, never a duplicate roster.
const GUEST_CONTACT_PACKAGE_ID = "guest-contact";
const GUEST_CONTACT_PACKAGE_NAME = "Guest contact — not a booking";

function isGuestContactRow(row) {
  return row?.packageId === GUEST_CONTACT_PACKAGE_ID;
}

/** Rows that are neither a crew-list signup nor an added guest contact. */
function isRealInquiry(row) {
  return !isCrewListRow(row) && !isGuestContactRow(row);
}

function isCrewListRow(row) {
  return row?.packageId === CREW_LIST_PACKAGE_ID;
}

/** Crew-list contacts who haven't asked to be left alone. */
function mailableCrewList(rows) {
  return (rows || []).filter(
    (r) => isCrewListRow(r) && r.status !== CREW_LIST_UNSUBSCRIBED_STATUS
  );
}

module.exports = {
  GUEST_CONTACT_PACKAGE_ID,
  GUEST_CONTACT_PACKAGE_NAME,
  isGuestContactRow,
  isRealInquiry,
  CREW_LIST_PACKAGE_ID,
  CREW_LIST_PACKAGE_NAME,
  CREW_LIST_UNSUBSCRIBED_STATUS,
  isCrewListRow,
  mailableCrewList,
};
