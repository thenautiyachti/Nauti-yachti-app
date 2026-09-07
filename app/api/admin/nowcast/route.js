const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { sampleLine, assess, parseCoord, withinReach } = require("../../../../lib/runForHome");

// What the weather is about to do, here and between here and the dock.
//
// The radar on the site is a Windy embed pinned to `calendar=now`: it shows
// where rain HAS been. On 6 Sep 2026 the owner was on the lake with weather
// coming in, tried to use it, and it could not tell him what was about to
// happen — so he pulled into an empty covered slip and worked it out by eye.
//
// Open-Meteo's `minutely_15` is a free, keyless 15-minute-resolution forecast,
// which is the right granularity for "do I have time to get back". This route
// fetches it SERVER-SIDE on purpose: the page then talks only to our own
// origin, so `connect-src 'self'` in the CSP stays honest and the browser never
// reaches a third party on the owner's behalf.

const LAKE = { lat: 30.3935, lon: -95.5836 };

// A generous box around Lake Conroe. Anything outside it is a typo, not a dock.
//
// The failure this catches is a dropped minus sign. Texas is west of Greenwich,
// so the longitude is negative; entering 95.58 instead of -95.58 puts the dock
// in western China, and every distance and run-home time on the page becomes
// confident nonsense in the thousands of miles. That is worse than not being
// configured at all, because an unconfigured page says so and a wrong one does
// not. Roughly ±35 miles, which is far more slack than a lake needs.
const PLAUSIBLE = { latMin: 29.9, latMax: 30.9, lonMin: -96.1, lonMax: -95.1 };

function looksLikeLakeConroe(lat, lon) {
  return lat >= PLAUSIBLE.latMin && lat <= PLAUSIBLE.latMax &&
    lon >= PLAUSIBLE.lonMin && lon <= PLAUSIBLE.lonMax;
}

// The dock. Env, not the repository — it is a private residence, and the same
// reasoning that keeps DOCK_ADDRESS and DOCK_GATE_CODE out of git applies to
// its coordinates. Falls back to the lake centre so the page still renders
// something honest before these are set.
function dockPoint() {
  const lat = Number(process.env.DOCK_LAT);
  const lon = Number(process.env.DOCK_LON);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    if (looksLikeLakeConroe(lat, lon)) return { lat, lon, configured: true };
    // Set, but not anywhere near the lake. Say which values were read, because
    // the whole point is that someone can look at them and spot the sign.
    return {
      ...LAKE,
      configured: false,
      badValues: `DOCK_LAT=${lat}, DOCK_LON=${lon}`,
    };
  }
  return { ...LAKE, configured: false };
}

// One Open-Meteo call for every point we care about. Open-Meteo accepts
// comma-separated coordinates and returns an array in the same order, so the
// whole picture is a single request rather than one per sample.
async function fetchSeries(points) {
  const lats = points.map((p) => p.lat.toFixed(4)).join(",");
  const lons = points.map((p) => p.lon.toFixed(4)).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&minutely_15=precipitation,weather_code` +
    `&current=wind_speed_10m,wind_gusts_10m,weather_code,precipitation` +
    `&wind_speed_unit=mph&forecast_minutely_15=12&timezone=UTC`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("forecast " + res.status);
  const body = await res.json();
  // A single coordinate returns an object; several return an array.
  const list = Array.isArray(body) ? body : [body];
  return list.map((entry) => {
    const m = entry && entry.minutely_15;
    const series = m && Array.isArray(m.time)
      ? m.time.map((t, i) => ({
          time: t.endsWith("Z") ? t : t + "Z",
          precipitation: m.precipitation ? m.precipitation[i] : null,
        }))
      : [];
    return { series, current: (entry && entry.current) || {} };
  });
}

async function GET(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const lat = parseCoord(searchParams.get("lat"));
  const lon = parseCoord(searchParams.get("lon"));
  const cruiseMph = parseCoord(searchParams.get("cruise")) || 20;
  const dock = dockPoint();
  // Without the boat's position there is nothing to measure from; report the
  // dock's own forecast so the page still has something true to show.
  let here = lat != null && lon != null ? { lat, lon } : null;

  // A SECOND LAYER, because the first one already failed once.
  //
  // The null-island bug got a position of (0,0) all the way through to a
  // confident "no rain showing" for the Gulf of Guinea. Whatever the route
  // in — a parsing slip, a phone with a broken fix, a stale cached position
  // from another continent — a boat on Lake Conroe is not thousands of miles
  // from Lake Conroe, and this must refuse rather than compute.
  //
  // The box is deliberately wide (roughly a whole day's tow, not a lake) so
  // that a genuinely odd but real position still works.
  let hereRejected = null;
  if (here && !withinReach(here, LAKE)) {
    hereRejected = `${here.lat.toFixed(4)}, ${here.lon.toFixed(4)}`;
    here = null;
  }

  try {
    const path = here ? sampleLine(here, dock, 5) : [];
    // here, dock, then the points in between (the ends are already covered).
    const points = [here || dock, dock, ...path.slice(1, -1)];
    const results = await fetchSeries(points);

    const atHere = results[0] ? results[0].series : [];
    const atDock = results[1] ? results[1].series : [];
    const alongPath = results.slice(2).map((r) => r.series);
    const current = results[0] ? results[0].current : {};

    const verdict = assess({
      here, dock, atHere, atDock, alongPath,
      cruiseMph,
      windMph: parseCoord(current.wind_speed_10m),
      gustMph: parseCoord(current.wind_gusts_10m),
      nowMs: Date.now(),
    });

    return NextResponse.json({
      ...verdict,
      dockConfigured: dock.configured,
      dockBadValues: dock.badValues || null,
      // Where the dock is, so the radar can draw it. This route is admin-only
      // and this page is already trusted with the dock's address and its gate
      // code, so its coordinates are not a new disclosure.
      dockPoint: { lat: dock.lat, lon: dock.lon },
      hereRejected,
      // The window the forecast actually covers, so "no rain showing" can be
      // reported as "in the next N minutes" rather than as a promise.
      windowMinutes: atHere.length ? Math.round((new Date(atHere[atHere.length - 1].time) - Date.now()) / 60000) : null,
      // The raw series, for the strip of 15-minute blocks on the page.
      here: atHere.slice(0, 12),
      dockSeries: atDock.slice(0, 12),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    // A forecast that cannot be reached must say so plainly. Returning a
    // cheerful "clear" because a fetch failed is how someone gets caught out.
    return NextResponse.json({
      verdict: "unavailable",
      headline: "Could not reach the forecast",
      detail: "No signal, or the weather service is down. Trust your eyes, not this page.",
      dockConfigured: dock.configured,
      dockBadValues: dock.badValues || null,
      hereRejected,
      error: String(err && err.message ? err.message : err),
    }, { status: 200 });
  }
}

module.exports = { GET };
