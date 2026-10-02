// The words a guest agrees to before their photos are taken, in one place.
//
// Shown beside the checkbox on the trip page AND stored, word for word, on every
// upload made there (GuestUpload.consentText). "They ticked a box" is a weaker
// answer than "they ticked a box that said this", and the wording will change
// one day; the row has to keep what was true when they agreed.
//
// No server imports here, so the browser can use it too.
const TRIP_UPLOAD_CONSENT =
  "These are mine to share, everyone in them is happy for me to send them, and "
  + "The Nauti Yachti can use them in its posts, its advertising and on its website. "
  + "Change your mind later and we will take them down. Just ask.";

module.exports = { TRIP_UPLOAD_CONSENT };
