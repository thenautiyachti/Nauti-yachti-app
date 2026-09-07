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

// "shelter" is the owner's safe harbor: an empty covered slip you could borrow
// if a storm caught you out. His words: "on lake conroe sometimes we come
// across an empty sheltered slip that we could 'borrow' if ever stuck in a
// storm for safer harbor." It is the kind that matters most in the one moment
// this whole page exists for, which is why the weather card promotes it above
// fuel when the verdict turns bad.
//
// Places, then hazards. The split matters: a place is somewhere you want to
// GET to and is listed nearest-first; a hazard is somewhere you want to stay
// off, is drawn on the map as an area, and is never offered as a destination.
const PLACE_KINDS = ["fuel", "shelter", "ramp", "spot"];
const HAZARD_KINDS = ["stumps", "shallow", "nowake"];
const KINDS = [...PLACE_KINDS, ...HAZARD_KINDS];

function isHazard(kind) {
  return HAZARD_KINDS.includes(kind);
}

const KIND_LABEL = {
  fuel: "Fuel",
  shelter: "Safe harbor",
  ramp: "Ramp",
  spot: "Spot",
  stumps: "Stumps",
  shallow: "Shallow",
  nowake: "No wake",
};

const KIND_ICON = {
  fuel: "⛽",
  shelter: "⛱",
  ramp: "\u{1F6E5}",
  spot: "\u{1F4CD}",
  stumps: "\u{1FAB5}",
  shallow: "\u{1F7E4}",
  nowake: "\u{1F422}",
};

// How a hazard draws on the map. Red for "this will hurt the boat", amber for
// shallow, a calmer yellow for a rule you break rather than something you hit.
const HAZARD_COLOUR = {
  stumps: "rgba(226,104,95,0.30)",
  shallow: "rgba(232,147,74,0.28)",
  nowake: "rgba(226,214,74,0.20)",
};
const HAZARD_EDGE = {
  stumps: "rgba(226,104,95,0.85)",
  shallow: "rgba(232,147,74,0.80)",
  nowake: "rgba(226,214,74,0.70)",
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
    // A stump field is not a destination. Asking for "nearest" without naming a
    // kind must never answer with somewhere you are trying to avoid.
    .filter((p) => (kind ? true : !isHazard(p.kind)))
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
  for (const k of PLACE_KINDS) out[k] = nearest(points, from, k);
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
  // A hazard without an extent draws as a pin, which says the danger is one
  // spot and the water beside it is fine. That is the opposite of the truth.
  let radius = null;
  const rawRadius = input && input.radiusYards;
  if (rawRadius != null && rawRadius !== "") {
    const r = Math.round(Number(rawRadius));
    if (!Number.isFinite(r) || r <= 0) errors.push("How far it reaches has to be a number of yards.");
    else if (r > 5000) errors.push("Over 5000 yards is most of the lake - mark it in pieces.");
    else radius = r;
  }
  return {
    ok: errors.length === 0,
    errors,
    value: errors.length ? null : {
      name, kind, lat, lon,
      radiusYards: radius,
      note: String((input && input.note) || "").trim() || null,
    },
  };
}

module.exports = {
  KINDS, PLACE_KINDS, HAZARD_KINDS, KIND_LABEL, KIND_ICON,
  HAZARD_COLOUR, HAZARD_EDGE,
  isKind, isHazard, nearest, byKind, validate,
};
