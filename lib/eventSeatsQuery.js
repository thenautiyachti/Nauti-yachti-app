// The database half of lib/eventSeats.js: fetch the night's rows and count
// them. Server-only, which is why it is a separate file — eventSeats.js is
// also loaded by the owner console in the browser, where Prisma cannot run.
//
// Used by every public page that states seats for a dated event, so they
// cannot disagree. /glow and /events each used to carry their own figure, and
// /events said "30" while /glow counted 31.

const { prisma } = require("./db");
const { countSeats } = require("./eventSeats");

async function seatsOnTheNight(eventDate, vesselIds) {
  try {
    const [vessels, inquiries] = await Promise.all([
      prisma.vessel.findMany({ select: { id: true, capacity: true } }),
      prisma.inquiry.findMany({
        where: { date: eventDate, status: { notIn: ["cancelled"] } },
        select: { partySize: true, bookingId: true, status: true, date: true, packageId: true },
      }),
    ]);
    // The night's bookings, plus the booking twin of any inquiry on the night
    // even if that charter has since moved to another date: the twin is what
    // says the inquiry no longer holds a seat here.
    const twinIds = inquiries.map((i) => i.bookingId).filter(Boolean);
    const bookings = await prisma.externalBooking.findMany({
      where: { OR: [{ date: eventDate }, ...(twinIds.length ? [{ bookingId: { in: twinIds } }] : [])] },
      select: { partySize: true, bookingId: true, status: true, date: true },
    });
    return countSeats({ vessels, vesselIds, eventDate, bookings, inquiries });
  } catch {
    // A seat count is worth having and is not worth taking a page down for.
    // Null means "say nothing about seats", never "sold out".
    return null;
  }
}

module.exports = { seatsOnTheNight };
