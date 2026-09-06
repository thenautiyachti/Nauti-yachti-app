// "Can I get back to the dock before that hits us?"
//
// On 6 Sep 2026 the owner was out on Lake Conroe with weather coming in. The
// radar on the site is a Windy embed pinned to `calendar=now` — it shows where
// rain HAS been, not where it is going — so it could not answer the only
// question that mattered. He pulled into an empty covered slip to keep the
// party dry and worked it out by eye.
//
// WHAT THIS DELIBERATELY IS NOT. It is not a route. It does not know where the
// water is shallow, where the stumps are, where the no-wake zones are, or where
// a bridge is. Lake Conroe was flooded over standing timber and boats hit it
// every year. Drawing a clever line around a storm cell and calling it a
// recommended path would be inventing navigational authority this program does
// not have, and the failure mode is someone steering into a stump in the rain
// because a phone told them to.
//
// So it answers the timing question only, which is the one that was actually
// being asked: where is the weather, when does it reach you, when does it reach
// the dock, and how long does the run home take. The steering stays with the
// person who can see the water.

const MPH_PER_KNOT = 1.15078;

// Great-circle distance in statute miles.
function milesBetween(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Initial bearing in degrees, 0 = north.
function bearingTo(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
function compass(deg) {
  if (deg == null) return null;
  return POINTS[Math.round((deg % 360) / 22.5) % 16];
}

// Evenly spaced points from a to b, inclusive of both ends. Used to ask the
// forecast what the water between here and the dock is doing — sampling a
// straight line, NOT proposing one as a course to steer.
function sampleLine(a, b, n) {
  const count = Math.max(2, Math.min(10, n || 5));
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
  }
  return out;
}

// Rain counts when it is actually falling, not when a model shows a trace.
const WET_MM = 0.2;

// Minutes from now until this series first goes wet. null = stays dry for the
// whole window we can see, which is NOT the same as "clear all evening" — the
// caller has to say how far ahead it looked.
function minutesUntilWet(series, nowMs) {
  if (!Array.isArray(series)) return null;
  for (const p of series) {
    if (p == null || p.precipitation == null) continue;
    const t = new Date(p.time).getTime();
    if (Number.isNaN(t) || t < nowMs) continue;
    if (Number(p.precipitation) >= WET_MM) return Math.round((t - nowMs) / 60000);
  }
  return null;
}

// How long the run home takes, in minutes.
//
// Cruise defaults to 20 mph, which is an unhurried pontoon making way rather
// than anyone's top speed — the number that matters is the one you can hold
// with twelve people aboard and weather coming. It is deliberately pessimistic:
// arriving early costs nothing, and a minute of optimism here is a minute spent
// in the rain.
function minutesHome(miles, cruiseMph) {
  if (miles == null) return null;
  const mph = Number(cruiseMph) > 0 ? Number(cruiseMph) : 20;
  return Math.ceil((miles / mph) * 60);
}

// The whole picture, as a decision rather than a dataset.
//
// `here` and `dock` are {lat, lon}. `atHere` / `atDock` / `alongPath` are
// Open-Meteo minutely_15 series ([{time, precipitation}]). `windMph` and
// `gustMph` describe the wind now.
function assess(opts) {
  const o = opts || {};
  const now = o.nowMs || Date.now();
  const here = o.here;
  const dock = o.dock;

  const miles = milesBetween(here, dock);
  const bearing = bearingTo(here, dock);
  const runMinutes = minutesHome(miles, o.cruiseMph);

  const wetHere = minutesUntilWet(o.atHere, now);
  const wetDock = minutesUntilWet(o.atDock, now);
  // The soonest anything along the way turns wet. A cell sitting over the
  // middle of the run matters even when both ends are dry.
  let wetPath = null;
  for (const series of o.alongPath || []) {
    const m = minutesUntilWet(series, now);
    if (m != null && (wetPath == null || m < wetPath)) wetPath = m;
  }

  // The binding constraint is whichever gets wet first — you have to cross the
  // path and then arrive, so the earliest of the three is the deadline.
  const candidates = [wetHere, wetDock, wetPath].filter((m) => m != null);
  const deadline = candidates.length ? Math.min(...candidates) : null;

  // Margin is what is left after the run. Negative means the weather wins.
  const margin = deadline != null && runMinutes != null ? deadline - runMinutes : null;

  let verdict, headline, detail;
  if (miles == null) {
    verdict = "unknown";
    headline = "No position yet";
    detail = "Allow location, or set the dock position, and this can answer.";
  } else if (deadline == null) {
    verdict = "clear";
    headline = "Nothing wet in the forecast window";
    detail = `Dock is ${miles.toFixed(1)} mi ${compass(bearing)}, about ${runMinutes} min at cruise. No rain showing between now and the end of the forecast window.`;
  } else if (margin != null && margin >= 20) {
    verdict = "go";
    headline = `Time to get back — about ${margin} min to spare`;
    detail = `Rain in ~${deadline} min. The run is ~${runMinutes} min, ${miles.toFixed(1)} mi ${compass(bearing)}.`;
  } else if (margin != null && margin >= 0) {
    verdict = "tight";
    headline = `Tight — go now, ~${margin} min to spare`;
    detail = `Rain in ~${deadline} min and the run is ~${runMinutes} min. No stops.`;
  } else {
    verdict = "shelter";
    headline = "You will not beat it — find cover";
    detail = `Rain in ~${deadline} min, the run home is ~${runMinutes} min. Sit it out somewhere covered rather than take twelve people through it.`;
  }

  return {
    verdict, headline, detail,
    miles: miles == null ? null : Math.round(miles * 10) / 10,
    bearing: bearing == null ? null : Math.round(bearing),
    compass: compass(bearing),
    runMinutes, deadlineMinutes: deadline, marginMinutes: margin,
    wetHere, wetDock, wetPath,
    windMph: o.windMph == null ? null : Math.round(o.windMph),
    gustMph: o.gustMph == null ? null : Math.round(o.gustMph),
  };
}

module.exports = {
  milesBetween, bearingTo, compass, sampleLine,
  minutesUntilWet, minutesHome, assess,
  WET_MM, MPH_PER_KNOT,
};
