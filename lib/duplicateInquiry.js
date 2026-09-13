// The same person sending the same inquiry twice.
//
// Sarah Griffith sent the same glow-night inquiry three minutes apart on
// 12 Sep 2026. Nothing was wrong with the first one; the form simply gave her
// nothing to look at afterwards, so she could not tell. The confirmation panel
// in components/SiteView.js removes the REASON, and this removes the DAMAGE:
// two rows for one charter, two acknowledgement emails, and a duplicate the
// owner has to notice and delete by hand.
//
// Both halves matter. The panel can only help somebody whose browser still has
// the page; a resubmit from a second tab, a phone after a laptop, or a form
// reloaded an hour later never sees it.
//
// WHAT COUNTS AS THE SAME INQUIRY: same email address, same requested date,
// same package. Not the party size, not the message, not the phone number —
// those are exactly what somebody corrects on a second try, and a correction is
// still the same charter. The date and the package are the charter's identity.
//
// WHAT DOES NOT COUNT: an inquiry the owner has already acted on. Once a row
// leaves "new" — booked, lapsed, cancelled — a fresh submission is a new piece
// of intent and gets its own row, even for the same date and package. Somebody
// whose charter was cancelled and who asks again is not a duplicate.

// How long a resubmission is still treated as the same one.
//
// Thirty minutes, not three. Sarah's gap was three, but the window is not a
// measure of how fast people double-click — it is how long "I am trying to book
// this one charter" lasts as a single sitting. Someone who fills the form,
// wanders off to check a date with a friend and comes back twenty minutes later
// is on the same errand, and a second row helps nobody.
//
// It is deliberately not a day: two inquiries for the same date a week apart
// are worth seeing separately, because by then something has changed.
const DUPLICATE_WINDOW_MINUTES = 30;

// The only status a row can be in and still be considered a duplicate target.
// Mirrors the default in prisma/schema.prisma rather than restating a list of
// every status — if a new one is ever added, this keeps meaning "untouched".
const UNTOUCHED_STATUS = "new";

function normaliseEmail(v) {
  return String(v || "").trim().toLowerCase();
}

// Fields that a resubmission may legitimately correct, and which the owner
// needs to be looking at the newest version of. Each is [column, how to read it
// off a submitted payload], so the route does not restate the conversions the
// create call already knows.
const CORRECTABLE = [
  ["name", (b) => (b.name ? String(b.name) : null)],
  ["phone", (b) => (b.phone ? String(b.phone) : null)],
  ["vesselId", (b) => b.vesselId || null],
  ["vesselName", (b) => b.vesselName || null],
  ["hours", (b) => (b.hours ? Number(b.hours) : null)],
  ["partySize", (b) => (b.partySize ? String(b.partySize) : null)],
  ["message", (b) => b.message || null],
  ["priceQuoted", (b) => (b.priceQuoted != null ? Number(b.priceQuoted) : null)],
  ["addOnIds", (b) => (Array.isArray(b.addOnIds) && b.addOnIds.length ? JSON.stringify(b.addOnIds) : null)],
];

// Human labels for the changed fields, for the line the owner reads. Only the
// ones worth interrupting him about are named — a corrected phone number or a
// longer message matters; an identical resubmit does not.
const LABELS = {
  name: "name",
  phone: "phone",
  vesselName: "boat",
  hours: "duration",
  partySize: "party size",
  priceQuoted: "quoted price",
  message: "message",
  addOnIds: "add-ons",
};

/**
 * Which of `candidates` (rows already fetched for this email) the submission
 * duplicates, or null. Pure: takes rows and a payload, touches nothing.
 *
 * @param {Array<object>} candidates existing Inquiry rows
 * @param {object} body the submitted payload
 * @param {Date} now
 */
function findDuplicate(candidates, body, now = new Date()) {
  const email = normaliseEmail(body.email);
  if (!email) return null;
  const cutoff = new Date(now.getTime() - DUPLICATE_WINDOW_MINUTES * 60 * 1000);

  // A charter with no date cannot be identified by one. "Someday" inquiries are
  // not deduplicated — there is nothing distinguishing two of them from one
  // person asking about two different things, and wrongly merging those loses a
  // real lead, which is far worse than a duplicate the owner deletes.
  if (!body.date) return null;

  const matches = (candidates || []).filter(
    (c) =>
      normaliseEmail(c.email) === email &&
      c.date === body.date &&
      c.packageId === body.packageId &&
      c.status === UNTOUCHED_STATUS &&
      c.submittedAt &&
      new Date(c.submittedAt) >= cutoff
  );
  if (!matches.length) return null;

  // Newest, if somehow more than one slipped through — the one whose details
  // are closest to what they just sent.
  return matches.reduce((a, b) => (new Date(b.submittedAt) > new Date(a.submittedAt) ? b : a));
}

/**
 * What the existing row should be updated to, given a newer submission of the
 * same charter, and what changed in words.
 *
 * @returns {{ data: object, changed: string[] }} `data` is empty when the
 *   resubmission said nothing new, which is the common case.
 */
function corrections(existing, body) {
  const data = {};
  const changed = [];
  for (const [field, read] of CORRECTABLE) {
    const next = read(body);
    const prev = existing[field] == null ? null : existing[field];
    // Compared as strings so 6 and "6" — which is what partySize is on one side
    // and the other — do not read as a change every single time.
    const same = (prev == null ? "" : String(prev)) === (next == null ? "" : String(next));
    if (same) continue;
    // A resubmission that simply left a field blank is not a correction to
    // blank. Someone who retyped less is not asking us to forget what they
    // said the first time.
    if (next == null || next === "") continue;
    data[field] = next;
    if (LABELS[field]) changed.push(LABELS[field]);
  }
  return { data, changed };
}

module.exports = {
  DUPLICATE_WINDOW_MINUTES,
  UNTOUCHED_STATUS,
  findDuplicate,
  corrections,
  normaliseEmail,
};
