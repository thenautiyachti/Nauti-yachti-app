// The database half of lib/availability.js. Server-only.
//
// Called at the three moments a guest can take a boat: when the booking form
// creates a booking (app/api/checkout, app/api/inquiries), when a payment link
// starts a checkout (app/api/pay/[id]), and once more when Stripe says the
// money has arrived (app/api/webhooks/stripe), which is the backstop for two
// guests who got through the first check at the same instant.

const { prisma } = require("./db");
const { occupyingRows } = require("./occupancy");
const { HOLDS_THE_DAY } = require("./bookingStatus");
const { HOLD_MINUTES, slotProblem, seatProblem } = require("./availability");
const { seatsOnTheNight } = require("./eventSeatsQuery");

/**
 * Why this charter cannot be taken, or null.
 *
 *   pkg        the Package row, parsed or raw (pricingType, eventDate,
 *              fixedHours, vessels / vesselsJson)
 *   vesselId, vesselName, date, hours, partySize   what is being asked for
 *   exclude    { ids, bookingId } — the booking itself, on a re-check
 *   includeHolds  false once the money has arrived: a guest who has PAID
 *              outranks one who is still typing a card number, so another
 *              open checkout must not count against them
 *
 * FAILS OPEN. If the check itself cannot run (the database is unreachable,
 * say), it returns null and logs, which is exactly how the site behaved before
 * the check existed. Refusing every booking because a query failed would turn
 * a fault into lost charters.
 */
async function availabilityProblem({ pkg, vesselId, vesselName, date, hours, partySize, exclude = {}, includeHolds = true, now = new Date() }) {
  try {
    if (!date) return null;

    // A seat-sale night is a question about seats, not about a boat's day: the
    // whole fleet goes, and a dozen parties share each boat.
    if (pkg && pkg.pricingType === "per-guest" && pkg.eventDate) {
      let vesselIds = Array.isArray(pkg.vessels) ? pkg.vessels : null;
      if (!vesselIds) {
        try { vesselIds = JSON.parse(pkg.vesselsJson || "[]"); } catch { vesselIds = []; }
      }
      if (!vesselIds.length) vesselIds = (await prisma.vessel.findMany({ select: { id: true } })).map((v) => v.id);
      const seats = await seatsOnTheNight(pkg.eventDate, vesselIds, exclude);
      return seatProblem({ seats, partySize });
    }

    if (!vesselId) return null;

    const holdSince = new Date(now.getTime() - HOLD_MINUTES * 60 * 1000);
    const [blocked, ext, booked, holds, vessel] = await Promise.all([
      prisma.blockedDate.findMany({ where: { vesselId, date }, select: { date: true } }),
      prisma.externalBooking.findMany({
        where: { vesselId, date, status: { in: HOLDS_THE_DAY } },
        select: { id: true, bookingId: true, vesselId: true, date: true, hours: true, status: true },
      }),
      prisma.inquiry.findMany({
        where: { vesselId, date, status: "booked" },
        select: { id: true, bookingId: true, vesselId: true, date: true, hours: true, status: true },
      }),
      // AN UNPAID CHECKOUT STILL ON STRIPE'S PAGE. Not a booking yet, and never
      // shown on the public calendar, but somebody is typing their card number
      // for this boat right now; a second guest must not be let in behind them.
      !includeHolds ? [] : prisma.inquiry.findMany({
        where: {
          vesselId, date,
          paymentStatus: "unpaid",
          stripeSessionId: { not: null },
          status: { in: ["new", "pending"] },
          submittedAt: { gte: holdSince },
        },
        select: { id: true, bookingId: true, vesselId: true, date: true, hours: true },
      }),
      vesselName ? null : prisma.vessel.findUnique({ where: { id: vesselId }, select: { name: true } }),
    ]);

    const want = hours != null && hours !== "" ? hours : (pkg && pkg.fixedHours) || null;
    return slotProblem({
      vesselId, date,
      hours: want,
      vesselName: vesselName || (vessel && vessel.name) || null,
      blockedDates: blocked.map((b) => b.date),
      occupying: occupyingRows(ext, booked),
      holds,
      exclude,
    });
  } catch (err) {
    console.error("[availability] check could not run, letting the booking through:", err.message);
    return null;
  }
}

module.exports = { availabilityProblem };
