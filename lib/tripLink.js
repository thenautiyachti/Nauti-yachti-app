// The guest's own trip page: thenautiyachti.com/trip/NY-20260919-03/<key>
//
// WHY A SIGNED LINK AND NOT A PASSWORD. Owner, 2 Oct 2026, choosing between
// three ways in: "Private link + phone." A guest at a boat ramp will not
// remember a password and should not need one. The link goes out in the
// confirmation email and the reminder text; tapping it is the sign-in. A guest
// who has lost it types the booking number and the phone number on file at
// /trip and is sent to the same link.
//
// WHY THE BOOKING NUMBER CANNOT BE THE KEY ON ITS OWN. NY-20260919-03 is the
// charter date and a daily counter that rarely passes 03, so anybody who knows
// the date can walk them -- the reason lib/payableBooking.js refuses to let one
// open a /pay page. The key after it is an HMAC of the number, so the number is
// public and the link is not.
//
// ANYONE HOLDING THE LINK IS THE GUEST. That is the point -- the person who
// booked forwards it to the group chat and everybody aboard can send their
// photos in -- and it is also the limit. The page says so beside the message
// box rather than pretending the thread is private to one person.
const crypto = require("crypto");

const SITE = "https://www.thenautiyachti.com";

// Its own secret when one is set. Otherwise derived from SESSION_SECRET with a
// label, so a trip key and an admin session can never stand in for each other:
// an admin cookie is "<base64 payload>.<hex signature>" and is checked against
// the raw secret, while a trip key is 16 characters with no dot made from a
// different key entirely. Known limit: rotating SESSION_SECRET without setting
// TRIP_LINK_SECRET first withdraws every trip link ever sent.
function tripKeyMaterial(env = process.env) {
  if (env.TRIP_LINK_SECRET) return env.TRIP_LINK_SECRET;
  if (!env.SESSION_SECRET) return null;
  return crypto.createHmac("sha256", env.SESSION_SECRET).update("nauti-trip-link-v1").digest("hex");
}

// "ny 20260919 3", "NY-20260919-03" and "ny2026091903" are one booking number.
// Returns null for anything that is not shaped like one, so a typo is answered
// the same way as a wrong number: we could not find it.
function normalizeRef(raw) {
  const s = String(raw == null ? "" : raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^NY(\d{8})(\d{1,3})$/.exec(s);
  if (!m) return null;
  const n = Number(m[2]);
  if (!(n > 0)) return null;
  return "NY-" + m[1] + "-" + (n < 100 ? String(n).padStart(2, "0") : String(n));
}

// 12 bytes, base64url: 16 characters, 96 bits. Short enough to survive being
// pasted into a text, long enough that guessing one is not a plan.
function tripKeyFor(ref, env = process.env) {
  const material = tripKeyMaterial(env);
  const r = normalizeRef(ref);
  if (!material || !r) return null;
  return crypto.createHmac("sha256", material).update("trip:" + r).digest().subarray(0, 12).toString("base64url");
}

function verifyTripKey(ref, key, env = process.env) {
  const want = tripKeyFor(ref, env);
  const got = String(key == null ? "" : key);
  if (!want || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

function tripPath(ref, env = process.env) {
  const r = normalizeRef(ref);
  const k = tripKeyFor(r, env);
  return r && k ? "/trip/" + r + "/" + k : null;
}

function tripUrl(ref, env = process.env) {
  const p = tripPath(ref, env);
  return p ? SITE + p : null;
}

// The fallback sign-in. Last ten digits, because "+1 (713) 515-6135" and
// "713-515-6135" are the same phone. Fewer than ten digits never matches:
// "6135" is a lot of people.
function lastTen(raw) {
  const d = String(raw == null ? "" : raw).replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

function phoneMatches(entered, numbers) {
  const want = lastTen(entered);
  if (!want) return false;
  return (numbers || []).some((n) => lastTen(n) === want);
}

module.exports = {
  SITE, normalizeRef, tripKeyFor, verifyTripKey, tripPath, tripUrl, phoneMatches, lastTen,
};
