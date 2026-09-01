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
  CREW_LIST_PACKAGE_ID,
  CREW_LIST_PACKAGE_NAME,
  CREW_LIST_UNSUBSCRIBED_STATUS,
  isCrewListRow,
  mailableCrewList,
};
