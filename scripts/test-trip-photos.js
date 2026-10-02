// Our photos of a guest's trip: who may see one, and what is never offered.
//
// Owner, 2 Oct 2026: guests see the photos "good enough to publish", Coral picks
// and he approves. These are the shared rules (lib/tripPhotos.js) that decide
// which trip pages a photo can reach. No database, no network.
const {
  isRestricted, refsField, refsList, refNeedle, photoPathFor, acceptableName, sharingWarning, PREFIX,
} = require("../lib/tripPhotos");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(62) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "  want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

console.log("\n  who may see a photo");
const field = refsField(["NY-20260919-03", "ny-20260919-04", "NY-20260919-03"]);
ok("comma-wrapped, upper-cased, deduped, sorted", field, ",NY-20260919-03,NY-20260919-04,");
ok("back to a list", refsList(field), ["NY-20260919-03", "NY-20260919-04"]);
ok("a booking on it matches", field.includes(refNeedle("NY-20260919-04")), true);
ok("a booking NOT on it does not", field.includes(refNeedle("NY-20260919-05")), false);
ok("a prefix of a real number does not match", ",NY-20260919-031,".includes(refNeedle("NY-20260919-03")), false);
ok("no bookings: empty, so nobody sees it", refsField([]), "");

console.log("\n  what is never offered");
ok("an NDA charter folder", isRestricted("2026-06-14 Lake Bryan [NDA]", "a.jpg"), true);
ok("a not-for-use subfolder", isRestricted("2025-08-02 Christina Coronado", "_not for use/x.jpg"), true);
ok("Kuykendall is not an NDA (anchored)", isRestricted("2026-07-04 Sara Kuykendall", "a.jpg"), false);
ok("an ordinary still", isRestricted("2026-09-06 Oscar RoblesGil R", "_from video/a.jpg"), false);
ok("photos only: jpg", acceptableName("_from video/x.JPG"), true);
ok("photos only: png", acceptableName("x.png"), true);
ok("no video yet (free storage plan)", acceptableName("clip.mp4"), false);
ok("no HEIC (browsers cannot show it)", acceptableName("IMG_1.heic"), false);

console.log("\n  where the web copy lives");
ok("under trip-photos/, by date", photoPathFor("2026-09-19", "abc"), PREFIX + "2026-09-19/abc.jpg");

console.log("\n  the warning before he approves");
ok("one booking: no warning", sharingWarning([{ ref: "A", packageName: "Tubing" }]), null);
ok("a glow night: no warning, they were all aboard",
  sharingWarning([{ packageName: "Boatz & Glowz" }, { packageName: "Boatz & Glowz" }, { packageName: "Boatz & Glowz" }]), null);
ok("two private charters on one day: warned",
  typeof sharingWarning([{ packageName: "Tubing" }, { packageName: "Birthday Party" }]), "string");

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
