const { NextResponse } = require("next/server");
const { findTrip } = require("../../../../lib/tripBooking");
const { normalizeRef, phoneMatches, tripPath, lastTen } = require("../../../../lib/tripLink");
const { createThrottle } = require("../../../../lib/loginThrottle");
const { prisma } = require("../../../../lib/db");
const { tripsSharingPhone } = require("../../../../lib/guestTrips");

// A RETURNING GUEST sees every trip booked on the phone they signed in with
// (owner, 3 Oct 2026: "For repeat guests do they have to log in separately on
// each one or is there a way we can combine it?"). See lib/guestTrips.js for
// why that opens nothing the phone did not already open. Candidates are fetched
// by the last four digits, then matched exactly on all ten.
async function otherTrips(phone) {
  const ten = lastTen(phone);
  if (!ten) return [];
  const last4 = ten.slice(-4);
  try {
    const [externals, inquiries] = await Promise.all([
      prisma.externalBooking.findMany({
        where: { bookingId: { not: null }, OR: [{ phone: { contains: last4 } }, { phonesJson: { contains: last4 } }] },
        select: { bookingId: true, status: true, phone: true, phonesJson: true, guestName: true, date: true, packageName: true, vesselName: true },
      }),
      prisma.inquiry.findMany({
        where: { bookingId: { not: null }, phone: { contains: last4 } },
        select: { bookingId: true, status: true, phone: true, date: true, packageName: true, vesselName: true },
      }),
    ]);
    return tripsSharingPhone(externals, inquiries, phone);
  } catch {
    return []; // never let the list stop someone getting into the trip they asked for
  }
}

// The way in for a guest who has lost their link: booking number plus the phone
// number on the booking. Answers with the link itself, and the page goes there.
//
// THE SAME ANSWER FOR EVERY KIND OF WRONG. A wrong number, a wrong phone and a
// booking that does not exist all say the same sentence, so this cannot be used
// to find out which booking numbers are real. The booking number on its own is
// guessable (see lib/tripLink.js); the phone is what keeps it closed.
//
// Its own throttle, separate from the admin passcode's, so a guest getting their
// number wrong five times cannot lock the owner out of the console.
const throttle = createThrottle();

const NO_MATCH = "We couldn't match that booking number and phone number. Check both against your "
  + "confirmation, or call or text us on (832) 948-2912 and we'll send you the link.";

async function POST(req) {
  const wait = throttle.lockedFor(req);
  if (wait) {
    return NextResponse.json(
      { error: "Too many tries. Give it " + Math.ceil(wait / 60) + " minute" + (wait > 60 ? "s" : "") + " and try again, or call us on (832) 948-2912." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const ref = normalizeRef(body.ref);
  const phone = String(body.phone || "").slice(0, 40);

  const trip = ref ? await findTrip(ref) : null;
  if (!trip || !phoneMatches(phone, trip.phones)) {
    throttle.recordFailure(req);
    return NextResponse.json({ error: NO_MATCH }, { status: 404 });
  }

  const path = tripPath(ref);
  if (!path) {
    // SESSION_SECRET missing: the site cannot sign links at all. Say so plainly
    // rather than handing back a link that will be refused.
    return NextResponse.json({ error: "Trip pages are not switched on yet. Call or text us on (832) 948-2912." }, { status: 503 });
  }
  throttle.recordSuccess(req);
  // More than one trip on this phone: the page offers them all. The one they
  // asked for is always in the list, even if it is not a status listed there.
  const trips = (await otherTrips(phone)).filter((t) => t.ref !== ref);
  if (!trips.length) return NextResponse.json({ path });
  const all = [{ ref, date: trip.date, packageName: trip.packageName, vesselName: trip.vesselName, status: trip.status }, ...trips]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map((t) => ({ ref: t.ref, date: t.date, packageName: t.packageName, vesselName: t.vesselName, path: tripPath(t.ref), asked: t.ref === ref }));
  return NextResponse.json({ path, trips: all });
}

module.exports = { POST };
