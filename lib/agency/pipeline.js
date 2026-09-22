// Who owes us media, and since when.
//
// THE SCREEN THIS EXISTS FOR. An agency's content pipeline lives in a group
// chat until the week somebody realises an account has not posted in eleven
// days, and then the argument is about whether the media was ever asked for.
// Both sides genuinely believe their own version, because neither has a record
// — the request was a voice note.
//
// So a request is a row with a due date, and lateness is arithmetic rather than
// memory. The output of this module is a list you can work top to bottom: who
// to message, about what, and how late it is.
//
// DELIBERATELY NOT AUTOMATED CHASING. It produces the list; a person sends the
// message. Creators are self-employed people whose income depends on this
// relationship, and the failure mode of automated nagging — three reminders to
// somebody who is in hospital — costs more than the posts were worth.

const OPEN_STATUSES = ["requested", "submitted"];
const CLOSED_STATUSES = ["approved", "published", "rejected", "cancelled"];

function todayKey(today) {
  if (typeof today === "string" && today) return today.slice(0, 10);
  const d = today instanceof Date ? today : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(fromKey, toKey) {
  const a = new Date(`${fromKey}T00:00:00Z`);
  const b = new Date(`${toKey}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

// What state is this request really in?
//
// "submitted" is split out from "waiting" because the two need opposite
// actions: waiting means chase the creator, in-review means chase ourselves.
// Conflating them is how a creator who delivered on time ends up being chased
// for content that has been sitting in our own review queue for a week — which
// is the fastest way to lose a good one.
function requestState(request, today) {
  if (!request) return "unknown";
  const status = request.status || "requested";
  if (CLOSED_STATUSES.includes(status)) return status === "rejected" ? "rejected" : "done";
  if (status === "submitted") return "in-review";

  if (!request.dueOn) return "waiting";
  const days = daysBetween(todayKey(today), request.dueOn);
  if (days === null) return "waiting";
  if (days < 0) return "overdue";
  if (days <= 2) return "due-soon";
  return "waiting";
}

// How late, in days. Negative is not late. Null when there is no due date to
// be late against — which is itself worth seeing, so it is reported rather
// than coerced to zero.
function daysLate(request, today) {
  if (!request || !request.dueOn) return null;
  const days = daysBetween(request.dueOn, todayKey(today));
  return days === null ? null : days;
}

// The chase list, ordered by how much it matters.
//
// One entry per creator, not per request, because the message goes to a person.
// Someone who owes four things gets one conversation about four things.
function chaseList(creators, requests, today) {
  const day = todayKey(today);
  const byCreator = new Map();

  for (const request of requests || []) {
    const state = requestState(request, day);
    if (state === "done" || state === "rejected") continue;

    const entry = byCreator.get(request.creatorId) || {
      creatorId: request.creatorId,
      stageName: null,
      status: null,
      overdue: [],
      dueSoon: [],
      inReview: [],
      waiting: [],
      worstDaysLate: 0,
      urgentCount: 0,
    };

    const item = {
      id: request.id,
      title: request.title,
      mediaType: request.mediaType,
      quantity: request.quantity || 1,
      dueOn: request.dueOn || null,
      priority: request.priority || "normal",
      daysLate: daysLate(request, day),
    };

    if (state === "overdue") {
      entry.overdue.push(item);
      entry.worstDaysLate = Math.max(entry.worstDaysLate, item.daysLate || 0);
    } else if (state === "due-soon") entry.dueSoon.push(item);
    else if (state === "in-review") entry.inReview.push(item);
    else entry.waiting.push(item);

    if (item.priority === "urgent") entry.urgentCount += 1;
    byCreator.set(request.creatorId, entry);
  }

  for (const creator of creators || []) {
    const entry = byCreator.get(creator.id);
    if (entry) {
      entry.stageName = creator.stageName;
      entry.status = creator.status;
    }
  }

  // Most overdue first; then urgency; then volume. An entry whose creator is no
  // longer on file keeps its id and sorts normally — an orphaned request is a
  // data problem worth seeing, not one to hide by filtering.
  return [...byCreator.values()].sort(
    (a, b) =>
      b.worstDaysLate - a.worstDaysLate ||
      b.urgentCount - a.urgentCount ||
      b.overdue.length - a.overdue.length ||
      String(a.stageName || "").localeCompare(String(b.stageName || ""))
  );
}

// Is an account posting as often as it is supposed to?
//
// Compares what the cadence implies over the window against what was actually
// approved in it. Approved rather than published, because published is a
// scheduling fact and approved is a content fact: an account with a full queue
// that has not posted has a scheduling problem, and one with an empty queue has
// a creator problem. This module is about the second.
function cadenceHealth(account, requests, { today, windowDays = 28 } = {}) {
  const day = todayKey(today);
  const from = new Date(`${day}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - windowDays);
  const fromKey = from.toISOString().slice(0, 10);

  const mine = (requests || []).filter((r) => r.accountId === account.id);
  const delivered = mine.filter((r) => {
    if (!["approved", "published"].includes(r.status)) return false;
    const when = (r.approvedAt || r.publishedAt || r.updatedAt || "").toString().slice(0, 10);
    return when >= fromKey && when <= day;
  });

  const expected = Math.round(((account.postsPerWeek || 0) * windowDays) / 7);
  const actual = delivered.reduce((sum, r) => sum + (r.quantity || 1), 0);

  return {
    accountId: account.id,
    handle: account.handle,
    windowDays,
    expected,
    actual,
    deficit: Math.max(0, expected - actual),
    // Guard the divide: an account with no cadence set is not at 0% of nothing,
    // it is unmeasurable, and reporting it as a failure buries the real ones.
    ratio: expected > 0 ? actual / expected : null,
  };
}

module.exports = {
  OPEN_STATUSES,
  CLOSED_STATUSES,
  requestState,
  daysLate,
  chaseList,
  cadenceHealth,
};
