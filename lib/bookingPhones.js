// Every number attached to a booking, not just the one who paid.
//
// A booking has one `phone` column, and the site captures it at Stripe
// checkout, where it is verified. Verification proves the number works — not
// that it belongs to the person going out on the boat. On 6 Sep 2026 Oscar's
// charter carried his name and his email but a party member's phone, so the
// dock page texted the gate code and the dock address to a number the owner
// did not recognise. Nothing malfunctioned; the booking said so.
//
// Parties book for each other constantly, and the owner's words are that
// "sometimes multiple numbers are collected in a booking". One column cannot
// hold that. `phone` stays the primary — every existing caller keeps working —
// and `phonesJson` carries the rest, each with a label so that "which of these
// is the guy actually driving down here" is answerable at a glance.

// "+1 (713) 515-6135", "713-515-6135" and "7135156135" are one number.
// Everything is stored E.164 so comparisons are string comparisons.
function normalizePhone(raw) {
  const digits = String(raw == null ? "" : raw).replace(/\D/g, "");
  if (!digits) return null;
  // A US 10-digit number, or 11 digits already carrying the country code.
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  // Anything else is kept as typed rather than mangled into a wrong number —
  // an international guest is rarer than a bug that eats a digit.
  return "+" + digits;
}

// "+17135156135" tells you nothing at a glance; "(713) 515-6135" is a number
// you can recognise as right or wrong before you tap.
function prettyPhone(raw) {
  const d = String(raw == null ? "" : raw).replace(/\D/g, "");
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (n.length !== 10) return String(raw == null ? "" : raw);
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}

// A number is only textable if we can actually dial it.
function isDialable(raw) {
  const d = String(raw == null ? "" : raw).replace(/\D/g, "");
  return d.length === 10 || (d.length === 11 && d.startsWith("1"));
}

function parseExtras(booking) {
  const raw = booking && booking.phonesJson;
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((e) => (typeof e === "string" ? { number: e, label: "" } : e))
      .filter((e) => e && e.number)
      .map((e) => ({ number: normalizePhone(e.number), label: String(e.label || "").trim() }))
      .filter((e) => e.number);
  } catch {
    // A malformed column must not take the dock page down with it.
    return [];
  }
}

// Every number on this booking, primary first, deduped.
//
// Deduped by NUMBER, not by label: the same phone entered twice under two
// names is one phone, and showing it twice invites texting the gate code to it
// twice. The first occurrence wins so the primary keeps its position.
function bookingPhones(booking) {
  const out = [];
  const seen = new Set();
  const primary = normalizePhone(booking && booking.phone);
  if (primary) {
    seen.add(primary);
    out.push({ number: primary, label: primaryLabel(booking), primary: true });
  }
  for (const e of parseExtras(booking)) {
    if (seen.has(e.number)) continue;
    seen.add(e.number);
    out.push({ number: e.number, label: e.label, primary: false });
  }
  return out;
}

// The booker's own name, when we have it, so the primary is not just an
// unlabelled number sitting above the labelled ones.
function primaryLabel(booking) {
  const name = String((booking && booking.guestName) || "").trim();
  if (!name) return "on the booking";
  return name.split(/\s+/)[0] + " (booked it)";
}

// Add a number, or relabel one already there. Returns the new phonesJson
// string; the primary column is never touched by this.
function addPhone(booking, rawNumber, label) {
  const number = normalizePhone(rawNumber);
  if (!number) return booking && booking.phonesJson ? booking.phonesJson : null;
  const primary = normalizePhone(booking && booking.phone);
  const extras = parseExtras(booking).filter((e) => e.number !== number);
  // Relabelling the primary is a primary-column concern, not an extras one:
  // adding it here would show the same number twice.
  if (number === primary) return extras.length ? JSON.stringify(extras) : null;
  extras.push({ number, label: String(label || "").trim() });
  return JSON.stringify(extras);
}

// Drop a number. Removing the primary PROMOTES the next one rather than
// leaving the booking unreachable — a booking with numbers on it must never
// end up with an empty `phone` while extras sit unused underneath.
function removePhone(booking, rawNumber) {
  const number = normalizePhone(rawNumber);
  const primary = normalizePhone(booking && booking.phone);
  const extras = parseExtras(booking).filter((e) => e.number !== number);
  if (number && number === primary) {
    const promoted = extras.shift() || null;
    return {
      phone: promoted ? promoted.number : null,
      phonesJson: extras.length ? JSON.stringify(extras) : null,
    };
  }
  return {
    phone: booking ? booking.phone : null,
    phonesJson: extras.length ? JSON.stringify(extras) : null,
  };
}

// Make one of the numbers the primary, pushing the old primary into extras so
// nothing is lost. This is the fix for "the site captured the wrong person":
// the right number is usually already on the booking, just not first.
function makePrimary(booking, rawNumber) {
  const number = normalizePhone(rawNumber);
  if (!number) return { phone: booking ? booking.phone : null, phonesJson: booking ? booking.phonesJson : null };
  const oldPrimary = normalizePhone(booking && booking.phone);
  const chosen = parseExtras(booking).find((e) => e.number === number);
  const extras = parseExtras(booking).filter((e) => e.number !== number);
  if (oldPrimary && oldPrimary !== number) {
    extras.unshift({ number: oldPrimary, label: labelForOldPrimary(booking) });
  }
  return {
    phone: number,
    phonesJson: extras.length ? JSON.stringify(extras) : null,
    demotedLabel: chosen ? chosen.label : "",
  };
}

function labelForOldPrimary(booking) {
  const name = String((booking && booking.guestName) || "").trim();
  return name ? "was on the booking" : "was on the booking";
}

module.exports = {
  normalizePhone, prettyPhone, isDialable,
  bookingPhones, addPhone, removePhone, makePrimary,
};
