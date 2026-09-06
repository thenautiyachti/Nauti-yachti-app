// Places on the water, nearest first.
//
// The owner asked for the nearest fuel dock from wherever the boat is. The same
// question has two other forms he has already had to answer the hard way: on
// 6 Sep 2026 he needed the nearest COVER and ended up guessing at an empty
// slip, and a ramp matters the day something goes wrong with a trailer.
//
// WHY THESE ARE OWNER-ENTERED AND NOT A BUILT-IN LIST. Being wrong here is
// expensive in a specific way: a boat runs a tank down heading for a marina
// that turns out not to sell fuel, or does not sell it on a Tuesday, or closed
// last season. That is not a risk worth taking on coordinates recalled from
// nowhere in particular. He runs this lake every week and knows which docks
// actually pump gas — so the list is his, captured by standing at a place and
// tapping once, which is also the least typing anyone can do on a boat.

const { milesBetween, bearingTo, compass } = require("./runForHome");

const KINDS = ["fuel", "shelter", "ramp", "spot"];

const KIND_LABEL = {
  fuel: "Fuel",
  shelter: "Cover",
  ramp: "Ramp",
  spot: "Spot",
};

const KIND_ICON = {
  fuel: "⛽",
  shelter: "⛱",
  ramp: "\u{1F6E5}",
  spot: "\u{1F4CD}",
};

function isKind(k) {
  return KINDS.includes(k);
}

// Every point of a kind, sorted by how far away it is.
//
// A point with no position is dropped rather than sorted to the end: the whole
// value of this list is the distance, and an entry with an unknown one would
// sit there looking like an option.
function nearest(points, from, kind) {
  if (!from || from.lat == null) return [];
  return (points || [])
    .filter((p) => p && p.lat != null && p.lon != null && (!kind || p.kind === kind))
    .map((p) => {
      const miles = milesBetween(from, { lat: p.lat, lon: p.lon });
      const bearing = bearingTo(from, { lat: p.lat, lon: p.lon });
      return {
        ...p,
        miles: miles == null ? null : Math.round(miles * 10) / 10,
        bearing: bearing == null ? null : Math.round(bearing),
        compass: compass(bearing),
      };
    })
    .filter((p) => p.miles != null)
    .sort((a, b) => a.miles - b.miles);
}

// Grouped for the screen: fuel first, because that is the one that was asked
// for and the one with a deadline attached to it.
function byKind(points, from) {
  const out = {};
  for (const k of KINDS) out[k] = nearest(points, from, k);
  return out;
}

// A saved place needs a name and a real position. Refusing an unnamed point is
// deliberate — "Point 3" and "Point 4" a month later is the same as no list.
function validate(input) {
  const errors = [];
  const name = String((input && input.name) || "").trim();
  const kind = (input && input.kind) || "";
  const lat = Number(input && input.lat);
  const lon = Number(input && input.lon);
  if (!name) errors.push("A name — something you would recognise from the water.");
  if (!isKind(kind)) errors.push("Pick what kind of place it is.");
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push("Latitude is not a real position.");
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) errors.push("Longitude is not a real position.");
  return {
    ok: errors.length === 0,
    errors,
    value: errors.length ? null : {
      name, kind, lat, lon,
      note: String((input && input.note) || "").trim() || null,
    },
  };
}

module.exports = { KINDS, KIND_LABEL, KIND_ICON, isKind, nearest, byKind, validate };
