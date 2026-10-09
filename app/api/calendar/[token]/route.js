const { prisma } = require("../../../../lib/db");
const { tokenMatches, feedEvents, buildIcs } = require("../../../../lib/calendarFeed");

// GET /api/calendar/<token>.ics -- the bookings feed Google Calendar subscribes
// to (lib/calendarFeed.js). The token is the only lock, so a wrong one gets the
// same bare 404 as a missing route: nothing to confirm the feed exists.
const dynamic = "force-dynamic";

async function GET(_req, { params }) {
  const { token } = await params;
  const raw = String(token || "").replace(/\.ics$/i, "");
  if (!tokenMatches(raw)) return new Response("Not found", { status: 404 });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  const [externalBookings, inquiries] = await Promise.all([
    prisma.externalBooking.findMany(),
    prisma.inquiry.findMany(),
  ]);
  const ics = buildIcs(feedEvents({ externalBookings, inquiries, today }));
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="nauti-yachti-charters.ics"',
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex",
    },
  });
}

module.exports = { GET, dynamic };
