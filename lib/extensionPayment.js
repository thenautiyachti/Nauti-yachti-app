// A PAID "ADD TIME" CHARGE JOINS ITS RESERVATION.
//
// Until 9 Oct 2026 the payment webhook treated an extension like any website
// checkout and made it a booking of its own. Erika's extra two hours became a
// second $360 line in Bookings beside her $460 charter, with its own ledger
// row, and the charter read 2 hours when she was out 1 to 5pm. Owner: "it
// should all stay with that one single reservation."
//
// So a paid extension (bookingId "<parent>-X<n>", see lib/extensionRef.js) is
// added to the parent ExternalBooking: the hours, the price and the money.
// The charge itself stays as the record of that payment, and the Bookings list
// shows it as a payment under the parent.
//
// THE MONEY. A parent not yet completed gets its income row later, when it is
// marked completed, for the whole pricePaid (lib/bookingLedger.js), so nothing
// is written here. A parent ALREADY completed has had its row written; that
// function will never write a second one, so the extension's own row is
// written here, linked to the parent.

const { parentRefOf } = require("./extensionRef");
const { ledgerOriginFor } = require("./channels");

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : 0);

// Pure: the update for the parent, or null when this payment is already in it.
function foldedParent(parent, ext, { paid, today }) {
  const ref = ext.bookingId;
  const mark = `${ref} paid`;
  if ((parent.note || "").includes(mark)) return null; // a webhook retry
  const amount = paid != null ? paid : num(ext.priceQuoted);
  const hours = num(ext.hours);
  return {
    hours: num(parent.hours) + hours,
    priceQuoted: num(parent.priceQuoted) + num(ext.priceQuoted),
    pricePaid: num(parent.pricePaid) + amount,
    note: (parent.note ? parent.note + "\n" : "") +
      `${mark}: +${hours} h, $${amount} by card on ${today}.`,
  };
}

// Returns { parent, ledger } or null when there is nothing to fold into.
async function foldExtensionPayment(prisma, ext, { paid, today = new Date().toISOString().slice(0, 10) } = {}) {
  const parentRef = parentRefOf(ext && ext.bookingId);
  if (!parentRef) return null;
  const parent = await prisma.externalBooking.findFirst({
    where: { OR: [{ bookingId: parentRef }, { id: parentRef }] },
  });
  if (!parent) {
    console.error(`[extensionPayment] ${ext.bookingId} was paid but no booking ${parentRef} exists to add it to`);
    return null;
  }
  const data = foldedParent(parent, ext, { paid, today });
  if (!data) return { parent, ledger: null };
  const updated = await prisma.externalBooking.update({ where: { id: parent.id }, data });

  let ledger = null;
  const amount = paid != null ? paid : num(ext.priceQuoted);
  if (parent.status === "completed" && amount > 0) {
    ledger = await prisma.ledgerEntry.create({
      data: {
        type: "income",
        category: "Reservation",
        subcategory: parent.vesselName || null,
        amount,
        grossAmount: null,
        note: [parent.guestName, parent.vesselName, `add time ${ext.bookingId} +${num(ext.hours)}hr`].filter(Boolean).join(" — "),
        origin: ledgerOriginFor({ paymentMethod: "Stripe (card)", platform: "Website" }),
        bookingId: parent.bookingId || null,
        externalBookingId: parent.id,
        date: parent.date,
      },
    });
  }
  return { parent: updated, ledger };
}

module.exports = { foldedParent, foldExtensionPayment };
