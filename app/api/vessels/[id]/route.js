const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { withinReach } = require("../../../../lib/runForHome");

// Set where a boat lives, from the dock page, while standing on it.
//
// There was no way to do this from a phone: the coordinates could be read off
// the weather card but only written by someone editing the database. That is
// the wrong shape for a fact you can only learn by being somewhere — the
// Explorer's berth at Pearl Bay is currently the STREET from OpenStreetMap,
// roughly a hundred yards out, because nobody has been able to record the real
// one.
//
// Admin only, and every position is checked before it is believed.
const LAKE = { lat: 30.3935, lon: -95.5836 };

async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.vessel.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Vessel not found" }, { status: 404 });

  const data = {};

  if ("dockLat" in body || "dockLon" in body) {
    // Clearing is allowed — both null puts the boat back on the env fallback.
    if (body.dockLat == null && body.dockLon == null) {
      data.dockLat = null;
      data.dockLon = null;
    } else {
      const lat = Number(body.dockLat);
      const lon = Number(body.dockLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return NextResponse.json({ error: "A dock needs both a latitude and a longitude" }, { status: 400 });
      }
      // The same guard the weather route uses on a reported boat position. A
      // dock hundreds of miles from Lake Conroe is a mistake, not a berth, and
      // saving it would send this boat's run-home to the wrong state.
      if (!withinReach({ lat, lon }, LAKE)) {
        return NextResponse.json({
          error: `${lat}, ${lon} is not near Lake Conroe. Longitude has to be negative here.`,
        }, { status: 400 });
      }
      data.dockLat = lat;
      data.dockLon = lon;
    }
  }

  if ("hasHourMeter" in body) data.hasHourMeter = Boolean(body.hasHourMeter);

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.vessel.update({ where: { id }, data });
  return NextResponse.json(updated);
}

module.exports = { PATCH };
