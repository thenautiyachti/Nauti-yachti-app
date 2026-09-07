// Not "can I reach the dock" — "where should I go".
//
// The first version of this asked one question: does the run home fit in the
// time before it rains. That is the right question only when the dock is the
// only option, and the owner's point is that it is not:
//
//   "if the weather plot for the future conflicts with us trying to get to
//    dock or somewhere else, then the recommendation is to go check the safe
//    harbor slip. if we can make it around the weather, mostly, it would
//    instead encourage us to go to the dock. I want other options than just
//    the dock."
//
// So every candidate is costed the same way — the dock, each safe harbor, each
// marked spot — and the dock wins unless the weather says it cannot be reached.
//
// WHAT THIS STILL IS NOT. It picks a DESTINATION and says how long it should
// take. It does not pick a course. It has no idea where the stumps or the
// shallows are beyond what the owner has marked, and marked hazards are used
// to warn, never to route around. The steering stays with the person who can
// see the water.
//
// AND A SAFE HARBOR IS A CANDIDATE, NOT A GUARANTEE. It is somebody else's
// empty slip. The wording is "go and check" on purpose — a page that says "go
// to X" about a slip that turns out to be occupied, in weather, has made things
// worse rather than better.

const { milesBetween, bearingTo, compass, minutesUntilWet, minutesHome } = require("./runForHome");

// Below this, arriving is a coin toss and should not be presented as a plan.
const COMFORTABLE_MARGIN = 15;

// Cost one destination: how far, how long, and when it goes wet there and on
// the way.
function costOne(here, option, opts) {
  const o = opts || {};
  const now = o.nowMs == null ? Date.now() : o.nowMs;
  const miles = milesBetween(here, option);
  const bearing = bearingTo(here, option);
  const runMinutes = minutesHome(miles, o.cruiseMph);

  const wetThere = minutesUntilWet(option.series, now);
  let wetPath = null;
  for (const s of option.pathSeries || []) {
    const m = minutesUntilWet(s, now);
    if (m != null && (wetPath == null || m < wetPath)) wetPath = m;
  }

  const candidates = [wetThere, wetPath].filter((m) => m != null);
  const deadline = candidates.length ? Math.min(...candidates) : null;
  const margin = deadline != null && runMinutes != null ? deadline - runMinutes : null;

  return {
    ...option,
    miles: miles == null ? null : Math.round(miles * 10) / 10,
    bearing: bearing == null ? null : Math.round(bearing),
    compass: compass(bearing),
    runMinutes,
    wetThere,
    wetPath,
    deadlineMinutes: deadline,
    marginMinutes: margin,
    // Null deadline means nothing wet in the window we can see — reachable.
    makeable: margin == null ? true : margin >= 0,
    comfortable: margin == null ? true : margin >= COMFORTABLE_MARGIN,
  };
}

// A safe harbor is only worth recommending if you could actually use it.
// Covered is the whole point in lightning; a slip whose owner has said no is
// not an option at all, whatever the weather.
function harborRank(a, b) {
  if (a.permission === "no" && b.permission !== "no") return 1;
  if (b.permission === "no" && a.permission !== "no") return -1;
  if (!!b.covered !== !!a.covered) return b.covered ? 1 : -1;
  const pa = a.permission === "yes" ? 0 : 1;
  const pb = b.permission === "yes" ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return (a.miles == null ? 1e9 : a.miles) - (b.miles == null ? 1e9 : b.miles);
}

// The whole decision.
//
// `dock` and each entry of `options` carry their own precipitation series and
// the series sampled along the way to them.
function whereToGo(input) {
  const o = input || {};
  const here = o.here;
  const now = o.nowMs == null ? Date.now() : o.nowMs;

  if (!here || here.lat == null) {
    return {
      verdict: "unknown",
      headline: "No position yet",
      detail: "Allow location and this can weigh up where to head.",
      options: [],
      recommended: null,
    };
  }

  const dock = o.dock && o.dock.lat != null
    ? costOne(here, { ...o.dock, kind: "dock", name: o.dock.name || "the dock" }, o)
    : null;

  const rest = (o.options || [])
    .filter((p) => p && p.lat != null && p.lon != null)
    .map((p) => costOne(here, p, o));

  const harbors = rest.filter((p) => p.kind === "shelter").sort(harborRank);
  const spots = rest.filter((p) => p.kind !== "shelter")
    .sort((a, b) => (a.miles == null ? 1e9 : a.miles) - (b.miles == null ? 1e9 : b.miles));

  const all = [dock, ...harbors, ...spots].filter(Boolean);

  // THE DOCK IS THE DEFAULT AND HAS TO BE BEATEN. Going home is what he wants
  // to do; a safe harbor is what he settles for.
  if (dock && dock.comfortable) {
    return {
      verdict: dock.deadlineMinutes == null ? "clear" : "go",
      headline: dock.deadlineMinutes == null
        ? "Nothing wet in the window — head for the dock"
        : `Head for the dock — about ${dock.marginMinutes} min to spare`,
      detail: describe(dock, "dock"),
      options: all, recommended: dock, dock,
    };
  }

  if (dock && dock.makeable) {
    return {
      verdict: "tight",
      headline: `Dock is tight — ${dock.marginMinutes} min to spare, go now`,
      detail: describe(dock, "dock") + " No stops.",
      options: all, recommended: dock, dock,
    };
  }

  // The dock cannot be made. Find cover that can be.
  const usable = harbors.filter((h) => h.makeable && h.permission !== "no");
  const best = usable[0] || null;

  if (best) {
    return {
      verdict: "harbor",
      headline: `You will not beat it to the dock — go and check ${best.name}`,
      detail:
        `${best.miles} mi ${best.compass}, about ${best.runMinutes} min` +
        (best.covered ? ", covered" : ", NOT covered") +
        (best.permission === "yes" ? ", they have said yes before" :
          best.permission === "asked" ? ", nobody has asked" : "") +
        ". It is somebody else's slip, so it may not be free — have a second option in mind." +
        (dock ? ` The dock is ${dock.miles} mi and needs ${dock.runMinutes} min; rain gets there in ${dock.deadlineMinutes}.` : ""),
      options: all, recommended: best, dock,
    };
  }

  // Nothing is comfortably reachable. Say so, and still name the nearest cover
  // rather than leaving someone with nothing.
  const nearestCover = harbors.filter((h) => h.permission !== "no")[0] || null;
  return {
    verdict: "shelter",
    headline: "Nothing is comfortably reachable — get under cover",
    detail: nearestCover
      ? `Closest cover is ${nearestCover.name}, ${nearestCover.miles} mi ${nearestCover.compass}, ` +
        `about ${nearestCover.runMinutes} min — rain reaches it in ${nearestCover.deadlineMinutes == null ? "no time we can see" : nearestCover.deadlineMinutes + " min"}. ` +
        "You will likely be in it either way, so pick the shortest exposure."
      : "No safe harbors are marked yet. Mark the covered slips you know and this can answer properly next time.",
    options: all, recommended: nearestCover, dock,
  };
}

function describe(d, what) {
  const bits = [`${d.miles} mi ${d.compass}, about ${d.runMinutes} min at cruise`];
  if (d.deadlineMinutes != null) bits.push(`rain in ~${d.deadlineMinutes} min`);
  else bits.push("no rain showing in the forecast window");
  return bits.join(" · ") + ".";
}

module.exports = { whereToGo, costOne, harborRank, COMFORTABLE_MARGIN };
