// The guest trip page link: who it lets in, and who it does not.
//
// Owner, 2 Oct 2026, choosing "Private link + phone": the link is the sign-in,
// and the fallback is the booking number plus the phone on the booking. The
// booking number alone must never be enough, because it is the date and a
// counter. No database, no network.
const {
  normalizeRef, tripKeyFor, verifyTripKey, tripPath, tripUrl, phoneMatches,
} = require("../lib/tripLink");
const { verifySessionCookieValue } = require("../lib/session");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(62) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "  want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

const env = { SESSION_SECRET: "test-session-secret-not-real" };

console.log("\n  booking numbers, however they are typed");
ok("canonical form passes through", normalizeRef("NY-20260919-03"), "NY-20260919-03");
ok("lower case and spaces", normalizeRef(" ny 20260919 3 "), "NY-20260919-03");
ok("no dashes at all", normalizeRef("ny2026091903"), "NY-20260919-03");
ok("three-digit counter kept", normalizeRef("NY-20260919-104"), "NY-20260919-104");
ok("not a booking number", normalizeRef("hello"), null);
ok("counter of zero is not real", normalizeRef("NY-20260919-00"), null);

console.log("\n  the key");
const k = tripKeyFor("NY-20260919-03", env);
ok("is 16 url-safe characters", /^[A-Za-z0-9_-]{16}$/.test(k), true);
ok("verifies for its own booking", verifyTripKey("NY-20260919-03", k, env), true);
ok("verifies however the number was typed", verifyTripKey("ny2026091903", k, env), true);
ok("does NOT open the next booking that day", verifyTripKey("NY-20260919-04", k, env), false);
ok("a truncated key fails", verifyTripKey("NY-20260919-03", k.slice(0, 15), env), false);
ok("an empty key fails", verifyTripKey("NY-20260919-03", "", env), false);
ok("a different secret gives a different key", tripKeyFor("NY-20260919-03", { SESSION_SECRET: "other" }) === k, false);
ok("TRIP_LINK_SECRET, when set, wins", tripKeyFor("NY-20260919-03", { ...env, TRIP_LINK_SECRET: "own" }) === k, false);
ok("no secret at all: no link rather than a weak one", tripKeyFor("NY-20260919-03", {}), null);

console.log("\n  a trip key is not an admin session");
const saved = process.env.SESSION_SECRET;
process.env.SESSION_SECRET = env.SESSION_SECRET;
ok("the key fails as an admin cookie", verifySessionCookieValue(k), false);
ok("number.key fails as an admin cookie", verifySessionCookieValue("NY-20260919-03." + k), false);
process.env.SESSION_SECRET = saved;

console.log("\n  the link");
ok("path shape", tripPath("ny2026091903", env), "/trip/NY-20260919-03/" + k);
ok("url is on the www host (the bare domain redirects)", tripUrl("NY-20260919-03", env), "https://www.thenautiyachti.com/trip/NY-20260919-03/" + k);

console.log("\n  the phone check");
ok("same number, different punctuation", phoneMatches("(713) 515-6135", ["+17135156135"]), true);
ok("matches a second number on the booking", phoneMatches("832-555-0101", ["+17135156135", "+18325550101"]), true);
ok("last four digits are not enough", phoneMatches("6135", ["+17135156135"]), false);
ok("a different number fails", phoneMatches("7135156136", ["+17135156135"]), false);
ok("a booking with no phone cannot be opened by phone", phoneMatches("7135156135", []), false);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
