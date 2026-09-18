// TWO ROWS, ONE PERSON.
//
// The website is not the only way in. Most bookings start as a text, a Facebook
// message or a conversation at the dock, and the owner types those in by hand.
// He then sends a checkout link. If the guest uses THAT link the payment carries
// the booking's own id, Stripe comes back an exact match, and there is nothing
// to guess.
//
// The gap is the guest who does something else. Jim was texted the /glow page as
// well as a link; had he booked through the page, the webhook would have created
// a fresh Inquiry and a fresh booking row beside the one already typed in for
// him. Two rows, one man, one seat sold twice as far as every count is
// concerned: the manifest, the seats-left figure on the site, and the money.
//
// Owner, 18 Sep 2026: "if there's already an entry for that name and it matches
// a Stripe checkout ... then we would copy his email and double-check it with
// the phone number. That would be a merged thing."
//
// THIS FILE ONLY EVER PROPOSES. Nothing here merges anything, and that is the
// whole design. A phone number on a booking belongs to whoever filled the form,
// not necessarily to the guest -- Oscar's charter carried his name, his email
// and a party member's phone, and the gate code went to a number the owner did
// not recognise. So two bookings sharing a number can just as easily be two
// friends who booked separately from one phone as one person booked twice.
// Matching them automatically would silently delete a real guest's seat.
//
// The answer is always a candidate with its reason attached, for a person to
// confirm.

// Last ten digits. US numbers arrive as "(979) 402-8379", "9794028379" and
// "+19794028379" depending on whether they were typed, pasted from a text, or
// handed back by Stripe, and all three are the same phone.
function phoneKey(value) {
  const digits = String(value == null ? "" : value).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function emailKey(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

// Names are compared as a set of words, because the two sides rarely agree on
// how much of one to write. The owner types what he is called in the thread --
// "Jim" -- and the checkout collects what is on the card, "Jim Gonzalez". An
// equality test would call those two different people, which is exactly the
// pair this file exists to catch.
function nameWords(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

// True when one name is contained in the other: "jim" inside "jim gonzalez",
// "sarah griffith" inside "sarah griffith". Not a fuzzy score -- a near-miss on
// a name is not evidence, and two unrelated Mikes on the same Saturday is an
// ordinary thing on a boat that seats fourteen.
function namesOverlap(a, b) {
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return false;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  return short.every((w) => long.includes(w));
}

// A row that is not competing for a seat cannot be a duplicate of one that is.
// A cancelled booking followed by a new one is a guest who rebooked, and saying
// so every morning would train the reader to ignore the finding.
const DEAD = new Set(["cancelled", "lapsed"]);

/**
 * Do these two bookings look like the same person on the same day?
 *
 * Returns null, or { confidence, reasons } where confidence is:
 *
 *   "certain"  a contact detail matches exactly -- same email, or the same ten
 *              digits of phone. Still shown rather than merged: see the note at
 *              the top about who a phone number actually belongs to.
 *   "likely"   no contact detail in common, but the names fit inside one
 *              another and they bought the same thing on the same day.
 *
 * THE DATE IS REQUIRED, always. Without it a repeat guest -- which is the good
 * kind of guest, and the kind whose name and number recur all season -- would be
 * reported as a duplicate of himself every time he came back.
 */
function looksLikeSamePerson(a, b) {
  if (!a || !b) return null;
  if (a.id && b.id && a.id === b.id) return null;

  // An Inquiry and the booking row written from it share a booking number. They
  // are one charter recorded twice on purpose, which is the system working.
  if (a.bookingId && b.bookingId && a.bookingId === b.bookingId) return null;

  if (!a.date || !b.date || a.date !== b.date) return null;
  if (DEAD.has(a.status) || DEAD.has(b.status)) return null;

  const reasons = [];
  let confidence = null;

  const emailA = emailKey(a.email);
  const emailB = emailKey(b.email);
  if (emailA && emailA === emailB) {
    confidence = "certain";
    reasons.push("same email (" + emailA + ")");
  }

  const phoneA = phoneKey(a.phone);
  const phoneB = phoneKey(b.phone);
  if (phoneA && phoneA === phoneB) {
    confidence = "certain";
    reasons.push("same phone (…" + phoneA.slice(-4) + ")");
  }

  const nameA = a.name || a.guestName;
  const nameB = b.name || b.guestName;
  if (namesOverlap(nameA, nameB)) {
    reasons.push('names fit: "' + nameA + '" / "' + nameB + '"');
    if (!confidence && a.packageId && a.packageId === b.packageId) {
      confidence = "likely";
      reasons.push("same package on the same day");
    }
  }

  if (!confidence) return null;
  return { confidence, reasons };
}

/**
 * Every pair worth a second look, across a list of bookings.
 *
 * Pairs are emitted once, not twice: the caller wants "these two rows", not one
 * finding per row. Sorted certain-first, because that is the order a person
 * should spend attention in.
 */
function findDuplicatePairs(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const hit = looksLikeSamePerson(list[i], list[j]);
      if (hit) out.push({ a: list[i], b: list[j], ...hit });
    }
  }
  return out.sort((x, y) => (x.confidence === y.confidence ? 0 : x.confidence === "certain" ? -1 : 1));
}

module.exports = { phoneKey, emailKey, nameWords, namesOverlap, looksLikeSamePerson, findDuplicatePairs };
