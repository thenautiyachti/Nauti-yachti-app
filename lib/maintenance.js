// Is this service item due?
//
// PER BOAT, as of 6 Sep 2026. It used to be one shared checklist for the whole
// fleet, judged against whichever vessel had the most hours on it — "the worst
// case, so nothing slips through". That was the right call while nothing had
// ever been logged, and it stops being right the moment hours are real: an oil
// change belongs to an engine, not to a company. Judging the Islander's oil
// against the Explorer's hours reports the Islander overdue for work its own
// engine has not earned, and hides the reverse.
//
// The owner's words: "I need to have a schedule per boat, currently its just a
// long list."
//
// `vesselId` null still means fleet-wide — a trailer, a shared spare — and
// those keep the old worst-case treatment, because that genuinely is the
// honest reading for something not attached to one hull.

const { currentHours, fleetHours } = require("./engineHours");

// Flag "due soon" within 10% of either threshold.
const DUE_SOON_FRACTION = 0.9;

const STATUS_COLORS = {
  overdue: "#E2685F",
  "due-soon": "#E8934A",
  ok: "#4FBF8B",
  unknown: "var(--muted)",
};

const STATUS_WORDS = {
  overdue: "Overdue",
  "due-soon": "Due soon",
  ok: "OK",
  unknown: "Never recorded",
};

function monthsSinceDate(dateStr, now) {
  if (!dateStr) return null;
  const then = new Date(String(dateStr) + "T12:00:00");
  if (Number.isNaN(then.getTime())) return null;
  const at = now == null ? Date.now() : (now instanceof Date ? now.getTime() : now);
  return Math.floor((at - then.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
}

// The hours figure this item should be measured against: its own boat's, or
// the hardest-worked engine in the fleet when it belongs to no single boat.
function hoursForItem(item, vessels, logs) {
  if (item && item.vesselId) {
    const v = (vessels || []).find((x) => x && x.id === item.vesselId);
    return v ? currentHours(v, logs) : null;
  }
  return fleetHours(vessels, logs);
}

// Where this item stands.
//
// "unknown" is not a clean bill of health and must never be rendered as one:
// it means nobody has told the system anything, which is how thirteen items sat
// reading OK while meaning nothing at all.
function statusFor(item, hoursNow, now) {
  const hasHours = item && item.intervalHours != null && item.lastDoneHours != null && hoursNow != null;
  const months = monthsSinceDate(item && item.lastDoneDate, now);
  const hasMonths = item && item.intervalMonths != null && months != null;

  if (!hasHours && !hasMonths) {
    return { status: "unknown", label: STATUS_WORDS.unknown, hoursSince: null, monthsSince: null };
  }

  const hoursSince = hasHours ? hoursNow - item.lastDoneHours : null;
  let overdue = false;
  let dueSoon = false;
  if (hasHours) {
    if (hoursSince >= item.intervalHours) overdue = true;
    else if (hoursSince >= item.intervalHours * DUE_SOON_FRACTION) dueSoon = true;
  }
  if (hasMonths) {
    if (months >= item.intervalMonths) overdue = true;
    else if (months >= item.intervalMonths * DUE_SOON_FRACTION) dueSoon = true;
  }

  const status = overdue ? "overdue" : dueSoon ? "due-soon" : "ok";
  return { status, label: STATUS_WORDS[status], hoursSince, monthsSince: hasMonths ? months : null };
}

// Everything judged, in one call, each against the right engine.
function judgeAll(items, vessels, logs, now) {
  return (items || []).map((item) => {
    const hoursNow = hoursForItem(item, vessels, logs);
    return { item, hoursNow, ...statusFor(item, hoursNow, now) };
  });
}

// Worst first — the top of a list on a phone should be the thing to deal with.
const RANK = { overdue: 0, "due-soon": 1, unknown: 2, ok: 3 };
function bySeverity(a, b) {
  return RANK[a.status] - RANK[b.status] ||
    ((a.item && a.item.sortOrder) || 0) - ((b.item && b.item.sortOrder) || 0);
}

// Grouped for a screen that shows one boat at a time.
//
// Returns a group per vessel in fleet order, then a "fleet" group for anything
// with no vesselId. A boat with no items still gets a group, because an empty
// schedule for a real boat is information — it means nobody has set one up.
function byVessel(items, vessels, logs, now) {
  const judged = judgeAll(items, vessels, logs, now);
  const groups = (vessels || []).map((v) => ({
    vessel: v,
    vesselId: v.id,
    name: v.name,
    items: judged.filter((j) => j.item.vesselId === v.id).sort(bySeverity),
  }));
  const loose = judged.filter((j) => !j.item.vesselId).sort(bySeverity);
  if (loose.length) {
    groups.push({ vessel: null, vesselId: null, name: "Whole fleet", items: loose });
  }
  return groups;
}

// One line per group for a header: "2 overdue · 1 due soon".
function summarise(group) {
  const n = (s) => group.items.filter((i) => i.status === s).length;
  const parts = [];
  if (n("overdue")) parts.push(`${n("overdue")} overdue`);
  if (n("due-soon")) parts.push(`${n("due-soon")} due soon`);
  if (n("unknown")) parts.push(`${n("unknown")} never recorded`);
  if (!parts.length && group.items.length) return "all up to date";
  if (!group.items.length) return "no schedule set up";
  return parts.join(" · ");
}

module.exports = {
  DUE_SOON_FRACTION, STATUS_COLORS, STATUS_WORDS,
  monthsSinceDate, hoursForItem, statusFor, judgeAll, bySeverity, byVessel, summarise,
};
