// The front door, and the one check that has to be right.
//
// The age gate is the only piece of this system where being wrong once is
// unrecoverable, so it gets tested harder than anything else here: the boundary
// on both sides of a birthday, every shape of missing or malformed input, and
// the requirement that an unreadable date fails CLOSED rather than sliding
// through as "probably fine".

const {
  MINIMUM_AGE, ageOn, ageGate, normalizeApplication, canTransition, conversionBlockers,
} = require("../lib/agency/applications");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(62) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

const TODAY = "2026-09-22";
const gate = (body) => ageGate(body, TODAY);
const ticked = (dob) => ({ dateOfBirth: dob, agreedToAgeTerms: true });

console.log("\n  THE AGE GATE — the boundary\n");
ok(`the minimum is ${MINIMUM_AGE}`, MINIMUM_AGE, 18);
ok("eighteen today passes", gate(ticked("2008-09-22")).ok, true);
ok("one day short of eighteen does not", gate(ticked("2008-09-23")).ok, false);
ok("and is told why, kindly", gate(ticked("2008-09-23")).tone, "under_age");
ok("nineteen passes", gate(ticked("2007-01-01")).ok, true);
ok("seventeen does not", gate(ticked("2009-01-01")).ok, false);
ok("a twelve-year-old does not", gate(ticked("2014-01-01")).ok, false);

console.log("\n  IT FAILS CLOSED\n");
ok("no date of birth is a refusal", gate({ agreedToAgeTerms: true }).ok, false);
ok("an empty date of birth is a refusal", gate(ticked("")).ok, false);
ok("an unreadable date of birth is a refusal", gate(ticked("sometime in 2001")).ok, false);
ok("a date in the future is a refusal", gate(ticked("2027-01-01")).ok, false);
ok("an impossible age is a refusal", gate(ticked("1850-01-01")).ok, false);
ok("no attestation is a refusal even with a valid date", gate({ dateOfBirth: "1999-01-01" }).ok, false);
ok("an empty body is a refusal", gate({}).ok, false);
ok("a null body does not throw", ageGate({}, TODAY).ok, false);

console.log("\n  THE TWO REFUSALS READ DIFFERENTLY\n");
ok("a typo asks them to check", gate(ticked("2027-01-01")).tone, "check");
ok("being underage says so plainly", gate(ticked("2010-01-01")).tone, "under_age");
ok("and promises nothing was kept",
  gate(ticked("2010-01-01")).reason.includes("have not kept"), true);

console.log("\n  AGE ARITHMETIC\n");
ok("the day before a birthday is the younger age", ageOn("2000-09-23", TODAY), 25);
ok("a birthday counts on the day", ageOn("2000-09-22", TODAY), 26);
ok("a leap-day birthday resolves", ageOn("2004-02-29", TODAY), 22);
ok("no date of birth is null, never zero", ageOn(null, TODAY), null);

console.log("\n  THE FORM\n");
const { application, errors } = normalizeApplication({
  name: "  Jane Doe  ", email: "  JANE@EXAMPLE.COM ", phone: "(936) 555-1212",
  socials: "@janedoe", experience: "none", referredBy: "austin",
});
ok("whitespace is trimmed", application.name, "Jane Doe");
ok("email is lowercased", application.email, "jane@example.com");
ok("a good application has no errors", errors, []);
ok("a missing name is caught", normalizeApplication({ email: "a@b.co" }).errors.length, 1);
ok("a bad email is caught", normalizeApplication({ name: "A", email: "nope" }).errors.length, 1);
ok("who referred them is kept", application.referredBy, "austin");
ok("a pasted wall of text is capped",
  normalizeApplication({ name: "A", email: "a@b.co", about: "x".repeat(99999) }).application.about.length,
  2000);

console.log("\n  THE PIPELINE ONLY RUNS FORWARDS\n");
ok("submitted to screening is fine", canTransition("submitted", "screening"), true);
ok("submitted straight to signed is not", canTransition("submitted", "signed"), false);
ok("screening straight to agreement_sent skips the ID check",
  canTransition("screening", "agreement_sent"), false);
ok("verified to agreement_sent is fine", canTransition("verified", "agreement_sent"), true);
ok("anyone can withdraw", canTransition("agreement_sent", "withdrawn"), true);
ok("somebody who withdrew can come back", canTransition("withdrawn", "screening"), true);
ok("signed is the end", canTransition("signed", "screening"), false);
ok("an invented status is refused", canTransition("submitted", "approved"), false);

console.log("\n  BECOMING A CREATOR\n");
const signed = {
  status: "signed", verifiedAt: new Date("2026-09-20"),
  agreementSignedAt: new Date("2026-09-21"), creatorId: null,
};
ok("a signed, verified application converts", conversionBlockers(signed), []);
ok("an unsigned one does not",
  conversionBlockers({ ...signed, status: "screening" }).length > 0, true);
ok("one with no ID check does not",
  conversionBlockers({ ...signed, verifiedAt: null })
    .some((b) => /government ID/.test(b)), true);
ok("one already converted does not convert twice",
  conversionBlockers({ ...signed, creatorId: "cr_1" })
    .some((b) => /already been converted/.test(b)), true);
ok("nothing at all is a blocker, not a crash", conversionBlockers(null).length, 1);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
