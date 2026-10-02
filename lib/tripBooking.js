// One booking, assembled for the trip page from whichever tables hold it.
//
// A booking number can live in two places. A website checkout writes an Inquiry
// and, once paid, a mirror ExternalBooking with the same number; a booking taken
// by text, at the dock or through a platform is an ExternalBooking alone; an
// unpaid website booking is an Inquiry alone. The trip page should not have to
// know which, so this merges them:
//
//   * the ExternalBooking is the operational record -- start time, the boat,
//     party size and status as the owner keeps them;
//   * the Inquiry carries what checkout knew -- the email, the coupon, the gift
//     certificate and the payment columns.
//
// CALLERS MUST HAVE CHECKED THE TRIP KEY FIRST. Looking a booking up by its
// number is exactly what lib/payableBooking.js warns against doing for a guest,
// because the numbers can be walked. This file does no checking of its own; the
// page and the routes verify the key (lib/tripLink.js) before they call it.
const { prisma } = require("./db");
const { bookingPhones } = require("./bookingPhones");
const { normalizeRef } = require("./tripLink");

function bulletsOf(pkg) {
  if (!pkg || !pkg.bulletsJson) return [];
  try {
    const parsed = JSON.parse(pkg.bulletsJson);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function findTrip(rawRef) {
  const ref = normalizeRef(rawRef);
  if (!ref) return null;

  const [external, inquiry] = await Promise.all([
    prisma.externalBooking.findFirst({ where: { bookingId: ref } }).catch(() => null),
    prisma.inquiry.findFirst({ where: { bookingId: ref } }).catch(() => null),
  ]);
  if (!external && !inquiry) return null;

  const e = external || {};
  const i = inquiry || {};
  const packageId = e.packageId || i.packageId || null;
  const pkg = packageId
    ? await prisma.package.findUnique({ where: { id: packageId }, select: { bulletsJson: true } }).catch(() => null)
    : null;

  // The Inquiry's status words are older ("new", "pending") than the shared
  // vocabulary in lib/bookingStatus.js, so a bare Inquiry is mapped onto it.
  const inquiryStatus = i.status === "new" || i.status === "pending" ? "inquiry" : i.status;

  // Which row a /pay link should charge: the one carrying the payment columns,
  // the same rule as findPayableByRef.
  const payRow = inquiry || external;

  const phones = [
    ...bookingPhones(e).map((p) => p.number),
    ...(i.phone ? [i.phone] : []),
  ];

  return {
    ref,
    status: external ? e.status : inquiryStatus,
    paymentStatus: (inquiry ? i.paymentStatus : e.paymentStatus) || "unpaid",
    platform: e.platform || (inquiry ? "Website" : null),
    name: e.guestName || i.name || null,
    email: i.email || e.email || null,
    phones,
    date: e.date || i.date || null,
    startTime: e.startTime || null,
    hours: e.hours ?? i.hours ?? null,
    vesselId: e.vesselId || i.vesselId || null,
    vesselName: e.vesselName || i.vesselName || null,
    packageId,
    packageName: e.packageName || i.packageName || null,
    partySize: e.partySize ?? i.partySize ?? null,
    priceQuoted: i.priceQuoted ?? e.priceQuoted ?? null,
    discountAmount: i.discountAmount ?? null,
    couponCode: i.couponCode || null,
    giftAmount: i.giftAmount ?? null,
    pricePaid: e.pricePaid ?? null,
    refundAmount: i.refundAmount ?? null,
    payId: payRow ? payRow.id : null,
    packageBullets: bulletsOf(pkg),
  };
}

module.exports = { findTrip };
