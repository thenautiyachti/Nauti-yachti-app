const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { parseCoord, withinReach } = require("../../../../lib/runForHome");

// Where the rain WILL be, as a grid over the lake.
//
// WHY THIS EXISTS ALONGSIDE THE RADAR. RainViewer gives observed frames back
// two hours and a nowcast run ahead — but the nowcast is only generated when
// there is precipitation to project, so on a dry evening it returns zero
// frames. Sampled twice on 6 Sep 2026, hours apart: zero both times.
//
// A future layer that disappears whenever the sky is clear is no use for
// planning, and the owner was explicit that some future insight is the
// requirement rather than a bonus — "if we don't have futures statistics then
// there's no suggested path". Open-Meteo's minutely_15 is always there, so the
// forecast half of the timeline is built from that instead: 36 points in one
// request, 15-minute steps, about two and a half hours ahead.
//
// The radar still owns the past. This owns the future. The page scrubs across
// both as one timeline.

const LAKE = { lat: 30.3935, lon: -95.5836 };

// 6x6 over roughly 29 miles. Coarse on purpose — this is "is that cell going to
// be over the lake in forty minutes", not a pixel-accurate radar image, and a
// finer grid would imply a precision the model does not have.
const N = 6;
const SPAN = 0.42;

async function GET(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const lat = parseCoord(searchParams.get("lat"));
  const lon = parseCoord(searchParams.get("lon"));
  // Centre on the boat when we have a believable position, else the lake.
  // Same reach guard as the nowcast route: null island must not drag the grid
  // into the Gulf of Guinea.
  const asked = lat != null && lon != null ? { lat, lon } : null;
  const centre = asked && withinReach(asked, LAKE) ? asked : LAKE;

  const lats = [];
  const lons = [];
  const cells = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const cellLat = centre.lat + SPAN / 2 - (SPAN * r) / (N - 1);
      const cellLon = centre.lon - SPAN / 2 + (SPAN * c) / (N - 1);
      lats.push(cellLat.toFixed(4));
      lons.push(cellLon.toFixed(4));
      cells.push({ lat: Number(cellLat.toFixed(4)), lon: Number(cellLon.toFixed(4)) });
    }
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(",")}` +
    `&longitude=${lons.join(",")}&minutely_15=precipitation` +
    `&forecast_minutely_15=12&timezone=UTC`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("forecast grid " + res.status);
    const body = await res.json();
    const list = Array.isArray(body) ? body : [body];
    if (list.length !== cells.length) throw new Error("expected " + cells.length + " series, got " + list.length);

    const times = (list[0].minutely_15 && list[0].minutely_15.time) || [];
    // One step per timestamp, each carrying a value for every cell — the shape
    // the map wants, rather than one series per cell which it would have to
    // transpose on every frame change.
    const steps = times.map((t, i) => ({
      time: new Date(t.endsWith("Z") ? t : t + "Z").getTime(),
      values: list.map((p) => {
        const v = p.minutely_15 && p.minutely_15.precipitation ? p.minutely_15.precipitation[i] : null;
        return v == null ? 0 : v;
      }),
    })).filter((s) => Number.isFinite(s.time));

    return NextResponse.json({
      centre,
      cells,
      // Degrees per cell, so the map can size the rectangles it draws.
      cellSpan: SPAN / (N - 1),
      n: N,
      steps,
      // Whether anything is coming at all, so the page can say "nothing wet in
      // the next two and a half hours" without walking the grid itself.
      anyWet: steps.some((s) => s.values.some((v) => v >= 0.2)),
      fetchedAt: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({
      centre, cells: [], steps: [], anyWet: false,
      error: String(err && err.message ? err.message : err),
    }, { status: 200 });
  }
}

module.exports = { GET };
