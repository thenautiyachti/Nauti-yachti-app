// Which add-ons come with a package, and which are paid extras.
//
// The owner's rules, given 5 Sep 2026:
//
//   * Balloons are INCLUDED with a Birthday Party.
//   * Champagne is INCLUDED with a Bachelor / Bachelorette charter.
//   * On anything else, all three are optional paid extras at their listed
//     prices.
//   * If a guest names no occasion, the booking is a Tubing / Wakeboarding
//     charter. That is the default, not a guess.
//
// WHY THIS FILE EXISTS. The site said one thing and the price list said
// another. The FAQ told guests that "birthday and bachelor or bachelorette
// charters include decorations and party supplies", while the console sold a
// $40 Balloon Package and a $25 bottle of champagne as add-ons to every
// booking, including those ones. A guest who read the FAQ and then saw a
// charge would have been right to complain.
//
// Worse, the $25 one was called "Complimentary Champagne". Complimentary means
// free; it cost twenty-five dollars. It is now named for what it is, and it is
// genuinely complimentary in the one case where it is included.
//
// Put every rule about inclusion here. The booking form, the price the guest is
// quoted and the FAQ copy all read from this, so they cannot drift apart again.

// The package a booking gets when the guest has not named an occasion.
const DEFAULT_PACKAGE_ID = "tubing";

// packageId -> add-on ids that come free with it.
const INCLUDED_WITH = {
  birthday: ["balloon-package"],
  bachelor: ["champagne-bottle"],
  // The night cruise has always advertised dinner cooked on board, in both the
  // FAQ and the package page. Selling the grill as an extra on that charter
  // would be charging for something already promised.
  night: ["dinner-grill"],
};

// One add-on can contain others.
//
// The Full Decoration Package IS the balloons and the champagne, plus table
// setup and themed decor. Bought separately those two come to $65; the package
// is $60, so it is a small discount for taking both together.
//
// Without this, a guest who ticked all three was billed $40 + $25 + $60 = $125
// for something that costs $60 — charged twice for the balloons and the
// champagne, and told the bundle was a saving while paying a $65 premium for
// it. That is the failure this map prevents.
const CONTAINS = {
  "decoration-package": ["balloon-package", "champagne-bottle"],
};

/** Add-on ids already covered by something else the guest has selected. */
function coveredIds(selectedIds) {
  const selected = Array.isArray(selectedIds) ? selectedIds : [];
  const covered = new Set();
  for (const id of selected) {
    for (const inner of CONTAINS[id] || []) covered.add(inner);
  }
  return [...covered];
}

/** Is this add-on already paid for by a bundle the guest has selected? */
function isCovered(selectedIds, addOnId) {
  return coveredIds(selectedIds).includes(addOnId);
}

// NO ADD-ON IS BLOCKED FROM ANY PACKAGE, deliberately.
//
// There was briefly a rule here that hid the grill from tubing and wake surfing
// charters, on the reasoning that it can only be used at anchor. The owner
// corrected it: they routinely anchor off mid-trip and have twenty or thirty
// minutes to cook, so a tubing day can absolutely include dinner. The
// constraint is real but it is about WHEN during the charter, not WHETHER the
// charter can have it — so it belongs in the add-on's description, where it
// sets expectations, and not in a rule that removes the guest's choice.
//
// If a genuine "cannot be delivered here" case ever appears, add the mechanism
// back. Do not add it speculatively.

/** Add-on ids that are free with this package. */
function includedIds(packageId) {
  return INCLUDED_WITH[packageId] || [];
}

/** Is this specific add-on free on this package? */
function isIncluded(packageId, addOnId) {
  return includedIds(packageId).includes(addOnId);
}

/**
 * The add-ons a guest actually pays for.
 *
 * An included add-on is filtered out here rather than priced at zero, so it can
 * never contribute to a total by rounding or by a later edit.
 */
function chargeableIds(packageId, selectedIds) {
  const selected = Array.isArray(selectedIds) ? selectedIds : [];
  const covered = coveredIds(selected);
  return selected.filter((id) => !isIncluded(packageId, id) && !covered.includes(id));
}

/**
 * Dollars to add to the charter price for the selected add-ons.
 *
 * `addOns` is the AddOn rows (id + price). Anything selected that is not a
 * real, active add-on is ignored rather than assumed free-standing — a stale id
 * in a saved form should not become a silent charge or a silent discount.
 */
function addOnTotal(addOns, packageId, selectedIds) {
  const byId = {};
  for (const a of addOns || []) byId[a.id] = a;
  let total = 0;
  for (const id of chargeableIds(packageId, selectedIds)) {
    const a = byId[id];
    if (a && a.active !== false && !a.archived) total += Number(a.price) || 0;
  }
  // Money, so round to cents rather than carrying a float artefact into Stripe.
  return Math.round(total * 100) / 100;
}

/**
 * What to show beside an add-on in the booking form: its price, or that it is
 * already included with the package the guest has chosen.
 */
function addOnLabel(addOn, packageId, selectedIds) {
  if (isIncluded(packageId, addOn.id)) return "Included";
  if (isCovered(selectedIds, addOn.id)) return "In the decoration package";
  return "$" + (Number(addOn.price) || 0);
}

module.exports = {
  DEFAULT_PACKAGE_ID,
  INCLUDED_WITH,
  CONTAINS,
  includedIds,
  isIncluded,
  coveredIds,
  isCovered,
  chargeableIds,
  addOnTotal,
  addOnLabel,
};
