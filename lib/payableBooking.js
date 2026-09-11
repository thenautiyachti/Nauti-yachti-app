// One answer to "what is this /pay/<id> link for, and can it be paid?"
//
// WHY THIS IS SHARED. Three places have to agree: the page that shows the guest
// what they are buying, the route that mints the Stripe session, and the webhook
// that flips the row to paid when the money lands. Until 11 Sep 2026 all three
// hardcoded `prisma.inquiry`, which meant the guests this business actually has
// — the ones who booked by text, WhatsApp or at the dock — were the only ones
// who could not be sent a link to pay. Owner, that day: "I want all inquiry
// texts to contain a check out link, like Brian's."
//
// Two tables, one shape. Everything downstream reads the normalised fields and
// never has to know which table a booking came from; `kind` exists only for the
// two places that genuinely must differ — the Stripe metadata key, and which
// table the webhook updates.
const { prisma } = require("./db");

/**
 * Resolve a /pay/<id> link. The id is a cuid: unguessable, and known only to
 * whoever was sent it. That id IS the capability to pay this one booking, which
 * is why a sequential reference like NY-20260919-03 must never be used here —
 * those can be walked to read other people's charters.
 *
 * Returns null when nothing matches, so a guessed id leaks nothing.
 */
async function findPayable(id) {
  if (!id) return null;

  const inquiry = await prisma.inquiry.findUnique({ where: { id } }).catch(() => null);
  if (inquiry) return withPricing(normalise(inquiry, "inquiry"));

  const external = await prisma.externalBooking.findUnique({ where: { id } }).catch(() => null);
  if (external) return withPricing(normalise(external, "external"));

  return null;
}

// Whether the total is for the whole boat or for one seat. The pay page used to
// state "the whole boat, not per person" as a fact under every total, which is
// false for the Boatz & Glowz package — that one is priced per guest, and a
// $50 glow seat shown as buying the whole boat is the kind of wrong that ends
// in an argument on the dock.
async function withPricing(b) {
  if (!b.packageId) return { ...b, pricingType: null };
  const pkg = await prisma.package
    .findUnique({ where: { id: b.packageId }, select: { pricingType: true } })
    .catch(() => null);
  return { ...b, pricingType: pkg ? pkg.pricingType : null };
}

function normalise(row, kind) {
  return {
    kind,
    id: row.id,
    // Inquiry calls it name, ExternalBooking calls it guestName. Same person.
    name: kind === "inquiry" ? row.name : row.guestName,
    email: row.email || null,
    date: row.date || null,
    packageId: row.packageId || null,
    packageName: row.packageName || null,
    vesselName: row.vesselName || null,
    hours: row.hours ?? null,
    partySize: row.partySize ?? null,
    bookingId: row.bookingId || null,
    // What we are asking for. NOT pricePaid, which is money already received —
    // charging from that would bill a guest again for what they have paid.
    amount: row.priceQuoted != null ? Number(row.priceQuoted) : null,
    paymentStatus: row.paymentStatus || "unpaid",
    row,
  };
}

/** Why this booking cannot be charged, or null when it can. */
function notPayableReason(b) {
  if (!b) return "not-found";
  if (b.paymentStatus === "paid") return "already-paid";
  if (!(Number(b.amount) > 0)) return "no-price";
  return null;
}

/** The Stripe metadata key the webhook reads back to find this row again. */
function metadataFor(b) {
  return b.kind === "external"
    ? { externalBookingId: b.id, bookingRef: b.bookingId || "" }
    : { inquiryId: b.id, bookingRef: b.bookingId || "" };
}

module.exports = { findPayable, notPayableReason, metadataFor };
