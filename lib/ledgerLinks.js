// Is a charter's money actually findable from the charter?
//
// WHY THIS EXISTS. On 5 Sep 2026 the claim was made that Christian Gehring's
// $520 had never been recorded. It had. The row was there all along -- Zelle,
// 9 June, the right amount, with a note explaining exactly what it was. What it
// did not have was any link back to his booking, so every question asked from
// the booking's side answered "no money".
//
// That is a different fault from missing income and it needs saying, because
// the two have opposite fixes: missing income means find out what happened and
// write a row; unlinked income means the row is right and the join is broken.
// Writing a second row for money that was already recorded would have DOUBLED
// $520 of revenue on a tax report.
//
// THE TWO KEYS. A ledger row can point at a booking two ways: `externalBookingId`
// is the real foreign key, `bookingId` is the human string ("NY-20260711-03").
// The schema calls the FK "the reliable join the bookingId string never
// provided", and it is right -- but rows exist that carry only the string, so
// anything asking "is this linked" has to accept either. The console's own
// loose-income counter checked only the FK and therefore counted a
// string-linked row as loose.

// --- the two directions ------------------------------------------------------

// Does this row point at a charter at all?
function isLinked(entry) {
  if (!entry) return false;
  return !!(entry.externalBookingId || entry.bookingId);
}

// Income that belongs to no charter. NOT automatically a fault: the May 2026
// Glow Party seats are real income with no booking to attach to, and never will
// have one. This lists them for a person to judge; it does not accuse them.
function unlinkedIncome(ledger) {
  return (ledger || []).filter((l) => l && l.type === "income" && !isLinked(l));
}

// Every ledger row belonging to one booking, by either key.
function ledgerFor(booking, ledger) {
  if (!booking) return [];
  return (ledger || []).filter((l) =>
    (l.externalBookingId && l.externalBookingId === booking.id) ||
    (l.bookingId && booking.bookingId && l.bookingId === booking.bookingId));
}

// --- when money is actually due to be on the books ---------------------------

// A charter that has finished moving. Its money should be recorded AND findable
// by now.
//
// "booked" is deliberately excluded, and that exclusion is the whole reason
// this function exists rather than a bare `pricePaid > 0` test. A future
// charter's income row is written automatically when it is marked completed, so
// flagging one would report the system working exactly as designed. Checked
// 5 Sep 2026: a naive test flagged Hunter (19 Sep) and Oscar (6 Sep), neither of
// which is a fault, and would have gone on flagging every future booking
// forever until nobody read the check.
//
// "owed" is included, and it is the case that matters. An owed charter will
// NEVER be marked completed -- it never ran -- so the automatic income row that
// covers every other booking will never fire for it. It is the one status where
// money can sit in the bank, unlinked, with no process that would ever notice.
function moneyShouldBeOnTheBooks(status) {
  return status === "completed" || status === "owed";
}

// Charters that have settled, took money, and cannot find it. This is the
// crisp fault: zero judgement, zero false positives, and worth waking someone
// for.
function chartersMissingTheirMoney(bookings, ledger) {
  return (bookings || []).filter((b) => {
    if (!b || !moneyShouldBeOnTheBooks(b.status)) return false;
    if (!(Number(b.pricePaid) > 0)) return false;
    return ledgerFor(b, ledger).length === 0;
  });
}

// What is wrong, in words, so a caller does not have to guess whether it is a
// missing row or a broken join. Pass the unlinked income rows so the likely
// explanation can be offered rather than left as a mystery.
function diagnose(booking, ledger) {
  const loose = unlinkedIncome(ledger);
  const amount = Number(booking.pricePaid) || 0;
  const surname = String(booking.guestName || "").trim().split(/\s+/).filter(Boolean).pop();
  // A candidate is an unlinked row for the same amount, or one naming the
  // guest. Surnames of one character are ignored -- "Oscar RoblesGil R" made a
  // one-letter surname match almost every row in the ledger.
  const candidates = loose.filter((l) =>
    Number(l.amount) === amount ||
    (surname && surname.length > 2 && String(l.note || "").includes(surname)));
  if (candidates.length) {
    return {
      kind: "unlinked",
      candidates,
      says: "the money is on the books but not tied to this charter — link it, do not add a second row",
    };
  }
  return {
    kind: "missing",
    candidates: [],
    says: "nothing in the ledger looks like this money — it may never have been recorded",
  };
}

// --- money you are holding but have not earned -------------------------------
//
// An owed charter's payment is in the bank and it is NOT revenue: the trip has
// not happened, and if the guest asks for it back it goes back. Gehring's own
// ledger row said so before any of this code existed -- "NOT EARNED INCOME:
// this is a deposit against a trip that has not run. It should sit as a
// liability until the charter happens or the money is returned."
//
// The ledger has only two types, income and expense, so there is nowhere to put
// a liability. Rather than invent a third type and rewrite every total in the
// business, the row stays as income and the small number of places that report
// EARNED revenue ask this question first.
//
// It is never silently dropped. Every total that excludes it shows the excluded
// amount beside itself, because money disappearing from a figure with no
// explanation is a worse bug than the one being fixed -- the owner would be
// left reconciling against a bank balance that no longer matches.
function unearnedIncome(ledger, bookings) {
  const owedRowIds = new Set();
  const owedBookingIds = new Set();
  for (const b of bookings || []) {
    if (!b || b.status !== "owed") continue;
    if (b.id) owedRowIds.add(b.id);
    if (b.bookingId) owedBookingIds.add(b.bookingId);
  }
  if (!owedRowIds.size && !owedBookingIds.size) return [];
  return (ledger || []).filter((l) =>
    l && l.type === "income" &&
    ((l.externalBookingId && owedRowIds.has(l.externalBookingId)) ||
     (l.bookingId && owedBookingIds.has(l.bookingId))));
}

// The income rows that represent charters actually delivered. Note this can
// only work because the money is LINKED to its booking -- before 5 Sep 2026
// Gehring's $520 pointed at nothing, so no amount of status-checking could have
// found it. Linking it was what made this possible.
function earnedIncome(ledger, bookings) {
  const unearned = new Set(unearnedIncome(ledger, bookings).map((l) => l.id));
  return (ledger || []).filter((l) => l && l.type === "income" && !unearned.has(l.id));
}

function unearnedTotal(ledger, bookings) {
  return Math.round(
    unearnedIncome(ledger, bookings).reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100
  ) / 100;
}

module.exports = {
  isLinked,
  unlinkedIncome,
  ledgerFor,
  moneyShouldBeOnTheBooks,
  chartersMissingTheirMoney,
  diagnose,
  unearnedIncome,
  earnedIncome,
  unearnedTotal,
};
