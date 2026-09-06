// A package we advertise but do not run.
//
// Wake Surfing Lessons is the only one today. It is a coaching session on YOLO
// Lake Conroe's boat, with their crew, taking their money. It sits on our site
// as a shout-out to a friendly operator and to send people their way — the
// owner, 6 Sep 2026: "i dont expect to get a booking for this and take payment
// for it, etc. Its more just a shout out to a friendly like LLC liek ours."
//
// WHAT THIS FIXES. It was in the booking form's package dropdown with real tier
// prices, $720 / $770 / $820. A guest who chose it, filled the form and pressed
// Book went to OUR Stripe checkout and paid US for a lesson we do not run and
// cannot deliver — leaving a refund to issue, or a service to buy in. Nothing
// stopped it and nothing about the resulting booking would have looked odd in
// the console; it would have read as a normal charter.
//
// HOW ONE IS RECOGNISED, without a hard-coded list of ids: it points somewhere
// off-site (`linkUrl`) and runs on none of our boats (`vessels` empty). Both
// halves matter. Boatz & Glowz carries a link to /glow and IS ours, so the
// vessel list keeps it out of here; a package could also have no vessels for
// some future reason of our own without being someone else's.
function isPartnerReferral(pkg) {
  if (!pkg) return false;
  const external = typeof pkg.linkUrl === "string" && /^https?:\/\//i.test(pkg.linkUrl);
  const noBoatOfOurs = !Array.isArray(pkg.vessels) || pkg.vessels.length === 0;
  return external && noBoatOfOurs;
}

// The same question from a raw Package row, before parsePackage has turned the
// JSON columns into arrays. The checkout route reads rows straight from the
// database, and a check that only worked on parsed packages would quietly pass
// everything there.
function isPartnerReferralRow(row) {
  if (!row) return false;
  let vessels = [];
  try { vessels = JSON.parse(row.vesselsJson || "[]"); } catch { vessels = []; }
  return isPartnerReferral({ linkUrl: row.linkUrl, vessels });
}

// Their price, not ours, and we do not control it. Shown so a visitor knows
// roughly what they are walking into, flagged so nobody treats it as a quote we
// are standing behind.
const PARTNER_PRICE_NOTE = "Approximate — set by the operator and subject to change.";

module.exports = { isPartnerReferral, isPartnerReferralRow, PARTNER_PRICE_NOTE };
