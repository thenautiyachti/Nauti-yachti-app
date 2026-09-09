// Where a visitor came from, captured once and remembered until they act.
//
// WHY THIS EXISTS. A DM automation that sends people to
// /packages/tubing-wakeboarding-charter?from=ig-tube is only worth running if
// you can tell afterwards whether it brought anything in. Before this, an
// Inquiry recorded nothing about its origin, so the answer to "did the
// Instagram funnel work" was a guess — and that guess is what decides whether
// to build four more automations or switch them off.
//
// THE PART THAT IS EASY TO GET WRONG. The tag is on the LANDING url, and
// almost nobody submits a form on the page they landed on. They read the
// package, click through to the fleet, come back, then inquire — and by then
// the query string is long gone. So it is stashed on first sight and read back
// at submit time.
//
// sessionStorage, not localStorage, on purpose: this should describe the visit
// that is happening, not attribute a booking in November to a DM somebody
// tapped in September. It also disappears when the tab does, which is the
// correct lifetime for "how did you get here".

const KEY = "ny_ref_src";

// The parameters worth reading. `from` is ours and the short one to put in a
// DM; the utm_* pair is what every other tool in the world emits, and ignoring
// them would mean a link built in any ad manager silently recorded nothing.
const PARAMS = ["from", "utm_source", "ref"];

// Kept short, printable and boring: this ends up in a database column and on a
// console card, and a 400-character redirect chain in there helps nobody.
function clean(value) {
  if (!value) return null;
  const v = String(value).trim().slice(0, 60);
  // Letters, digits and the separators campaign tags actually use.
  if (!/^[\w. :\/-]+$/.test(v)) return null;
  return v;
}

// Read the tag off the current URL, if there is one.
function fromLocation(search) {
  try {
    const params = new URLSearchParams(search || "");
    for (const p of PARAMS) {
      const hit = clean(params.get(p));
      if (hit) return hit;
    }
  } catch {
    // A malformed query string is not worth breaking a page over.
  }
  return null;
}

// Call once on load. Records the tag if this visit carried one, and otherwise
// leaves whatever was already stashed alone — the FIRST touch is the one that
// earned the visit, and overwriting it with a later empty page view would
// quietly attribute everything to "direct".
function captureReferralSource(search) {
  if (typeof window === "undefined") return null;
  const found = fromLocation(search == null ? window.location.search : search);
  try {
    if (found) {
      window.sessionStorage.setItem(KEY, found);
      return found;
    }
    return window.sessionStorage.getItem(KEY);
  } catch {
    // Private browsing, or storage blocked. The form still submits; it just
    // submits without a source, which is exactly the state we were in before.
    return found;
  }
}

// Read it back at submit time.
function getReferralSource() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

module.exports = { captureReferralSource, getReferralSource, clean, KEY, PARAMS };
