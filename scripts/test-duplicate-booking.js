// Two rows, one person -- and, more importantly, two rows that are two people.
//
//     node scripts/test-duplicate-booking.js
//
// Owner, 18 Sep 2026: "if there's already an entry for that name and it matches
// a Stripe checkout ... that would be a merged thing."
//
// Half of these tests are about NOT matching. A detector that pairs everything
// is worse than none: the owner would stop reading it, and the morning it was
// right would be the morning he scrolled past. The expensive false positive is
// two friends who booked separately from one phone, which is an ordinary thing
// on a boat that seats fourteen.
const { looksLikeSamePerson, findDuplicatePairs, namesOverlap, phoneKey } =
  require("../lib/duplicateBooking");

let pass = 0;
const fails = [];
function ok(label, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(label + "  expected " + JSON.stringify(want) + ", got " + JSON.stringify(got));
}
const conf = (r) => (r ? r.confidence : null);

const DATE = "2026-09-19";

// --- the case this exists for -----------------------------------------------
// The owner typed "Jim" in from a text thread. Jim then booked on the website,
// where the card says Jim Gonzalez. Same phone, same night.
const typedIn = { id: "1", guestName: "Jim", phone: "(979) 402-8379", date: DATE, packageId: "glowz", status: "booked" };
const fromSite = { id: "2", name: "Jim Gonzalez", phone: "+19794028379", email: "gonzalez_jaime@aol.com", date: DATE, packageId: "glowz", status: "booked" };
ok("the same man typed in and booked online", conf(looksLikeSamePerson(typedIn, fromSite)), "certain");

// Order must not matter.
ok("and the same the other way round", conf(looksLikeSamePerson(fromSite, typedIn)), "certain");

// --- phone formats that are the same number ---------------------------------
ok("a texted number and a typed one", phoneKey("+1 (979) 402-8379"), "9794028379");
ok("a number too short to be one", phoneKey("402-8379"), "");

// --- names that are the same person ------------------------------------------
ok('"Jim" fits inside "Jim Gonzalez"', namesOverlap("Jim", "Jim Gonzalez"), true);
ok("and is not confused with another Gonzalez", namesOverlap("Maria Gonzalez", "Jim Gonzalez"), false);
ok("initials and punctuation do not break it", namesOverlap("carlyn", "Carlyn  Hardy!"), true);

// --- THE ONES THAT MUST NOT MATCH --------------------------------------------

// An Inquiry and the booking row written from it share a booking number. One
// charter, recorded twice on purpose. Reporting these would mean reporting
// EVERY website booking, every morning, forever.
const inquiry = { id: "3", name: "Carlyn", bookingId: "NY-20260919-05", phone: "8329695276", date: DATE, packageId: "glowz", status: "booked" };
const mirror = { id: "4", guestName: "Carlyn", bookingId: "NY-20260919-05", phone: "8329695276", date: DATE, packageId: "glowz", status: "booked" };
ok("an inquiry and its own mirror are not a duplicate", looksLikeSamePerson(inquiry, mirror), null);

// A repeat guest is the good kind of guest.
const septGlow = { id: "5", guestName: "Jim", phone: "9794028379", date: "2026-09-19", packageId: "glowz", status: "booked" };
const juneGlow = { id: "6", guestName: "Jim", phone: "9794028379", date: "2026-06-20", packageId: "glowz", status: "booked" };
ok("the same guest on a different night is not a duplicate", looksLikeSamePerson(septGlow, juneGlow), null);

// TWO FRIENDS, ONE PHONE. The expensive false positive, and the reason nothing
// here merges on its own -- this pair IS reported, because it cannot be told
// apart from a real duplicate without asking a person.
const friendA = { id: "7", guestName: "Devon", phone: "3466044378", date: DATE, packageId: "glowz", status: "booked" };
const friendB = { id: "8", guestName: "Chris", phone: "3466044378", date: DATE, packageId: "glowz", status: "booked" };
const friends = looksLikeSamePerson(friendA, friendB);
ok("two names on one phone are still raised", conf(friends), "certain");
ok("...and the reason says only that the phone matched", friends.reasons.length, 1);

// A cancelled booking followed by a new one is a rebooking.
const cancelled = { id: "9", guestName: "Jim", phone: "9794028379", date: DATE, packageId: "glowz", status: "cancelled" };
ok("a cancelled row is not a duplicate of its replacement", looksLikeSamePerson(cancelled, typedIn), null);

// No date, no answer. Without it a name and a number alone would pair a guest
// with himself across the whole season.
const undated = { id: "10", guestName: "Jim", phone: "9794028379", date: null, status: "booked" };
ok("a booking with no date is never paired", looksLikeSamePerson(undated, typedIn), null);

// Two different people who happen to share a first name and a night.
const mikeOne = { id: "11", guestName: "Mike Alvarez", phone: "2815551111", date: DATE, packageId: "glowz", status: "booked" };
const mikeTwo = { id: "12", guestName: "Mike Fenton", phone: "2815552222", date: DATE, packageId: "glowz", status: "booked" };
ok("two different Mikes on one Saturday", looksLikeSamePerson(mikeOne, mikeTwo), null);

// A shared name with nothing else is not enough on its own...
const bareA = { id: "13", guestName: "Jim Gonzalez", date: DATE, packageId: "glowz", status: "booked" };
const bareB = { id: "14", guestName: "Jim", date: DATE, packageId: "glowz", status: "booked" };
ok("but a name that fits plus the same package is 'likely'", conf(looksLikeSamePerson(bareA, bareB)), "likely");

const differentPackage = { id: "15", guestName: "Jim", date: DATE, packageId: "tubing", status: "booked" };
ok("the same name on two different packages is not raised", looksLikeSamePerson(bareA, differentPackage), null);

// --- pairs, not one finding per row ------------------------------------------
const pairs = findDuplicatePairs([typedIn, fromSite, inquiry, mirror, mikeOne, mikeTwo]);
ok("one pair reported, not two findings", pairs.length, 1);
ok("and it is the right pair", [pairs[0].a.id, pairs[0].b.id], ["1", "2"]);

// Certain before likely, because that is the order attention is worth spending.
// A different name for the "likely" pair on purpose: bareA and bareB are also
// Jim on the same night with the same package, so mixing them with typedIn and
// fromSite correctly produces six pairs rather than two. All four ARE the same
// man; the ordering test just needs two pairs that do not touch.
const tylerFull = { id: "16", guestName: "Tyler Roxo", date: DATE, packageId: "glowz", status: "booked" };
const tylerShort = { id: "17", guestName: "Tyler", date: DATE, packageId: "glowz", status: "booked" };
const ordered = findDuplicatePairs([tylerFull, tylerShort, typedIn, fromSite]);
ok("two pairs, not four", ordered.length, 2);
ok("certain sorts ahead of likely", ordered.map((p) => p.confidence), ["certain", "likely"]);

console.log("\n  " + pass + " passed, " + fails.length + " failed");
for (const f of fails) console.log("   FAIL  " + f);
process.exitCode = fails.length ? 1 : 0;
