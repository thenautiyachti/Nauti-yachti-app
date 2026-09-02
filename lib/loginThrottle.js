// Brute-force throttle for the admin passcode.
//
// Behind that one passcode sits every guest's name, phone number and email,
// the whole booking ledger and the finances. Without a throttle an attacker
// can guess at whatever rate the network allows, and a short passcode falls in
// hours. This makes that attack take longer than it is worth.
//
// State lives in memory, deliberately. A serverless instance may be recycled
// and a determined attacker could spread guesses across instances, so this is
// a large speed bump rather than a wall — the passcode's own length is still
// what ultimately protects the account. It costs nothing, needs no schema
// change, and stops the realistic case: a script hammering from one address.

const WINDOW_MS = 15 * 60 * 1000; // failures older than this stop counting
const FREE_ATTEMPTS = 5;          // honest mistakes shouldn't lock the owner out
const BASE_LOCK_MS = 60 * 1000;   // then 1m, 2m, 4m ... doubling per failure
const MAX_LOCK_MS = 60 * 60 * 1000;
const MAX_TRACKED = 5000;         // bound memory; an attacker can rotate IPs

const attempts = new Map();

function prune(now) {
  for (const [key, rec] of attempts) {
    if (now - rec.last > WINDOW_MS && (!rec.lockedUntil || rec.lockedUntil < now)) {
      attempts.delete(key);
    }
  }
  // Still oversized after pruning: drop the oldest. Losing a record only
  // grants a few extra guesses, which beats growing without limit.
  if (attempts.size > MAX_TRACKED) {
    const oldest = [...attempts].sort((a, b) => a[1].last - b[1].last);
    for (let i = 0; i < oldest.length - MAX_TRACKED; i++) attempts.delete(oldest[i][0]);
  }
}

// Trust only the leftmost hop Vercel itself sets. A client can send whatever
// x-forwarded-for it likes, so reading the last entry would let an attacker
// hand us a fresh identity on every request.
function clientKey(req) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0].trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

// Returns null when the request may proceed, or the seconds still to wait.
function lockedFor(req) {
  const now = Date.now();
  prune(now);
  const rec = attempts.get(clientKey(req));
  if (!rec || !rec.lockedUntil || rec.lockedUntil <= now) return null;
  return Math.ceil((rec.lockedUntil - now) / 1000);
}

function recordFailure(req) {
  const now = Date.now();
  const key = clientKey(req);
  const rec = attempts.get(key);
  // A first failure after a quiet window starts the count over.
  if (!rec || now - rec.last > WINDOW_MS) {
    attempts.set(key, { fails: 1, last: now, lockedUntil: 0 });
    return;
  }
  rec.fails += 1;
  rec.last = now;
  if (rec.fails > FREE_ATTEMPTS) {
    const over = rec.fails - FREE_ATTEMPTS - 1;
    rec.lockedUntil = now + Math.min(BASE_LOCK_MS * 2 ** over, MAX_LOCK_MS);
  }
}

function recordSuccess(req) {
  attempts.delete(clientKey(req));
}

module.exports = { lockedFor, recordFailure, recordSuccess };
