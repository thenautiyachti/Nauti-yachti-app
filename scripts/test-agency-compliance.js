// The gate, the chase list, and the payout run.
//
// The case this was written around: content produced before a performer turned
// 18 and delivered after. The creator is over 18 on the day the payout runs,
// every document on file is valid, and nothing about the payout looks wrong.
// Only the production date catches it — which is why § 2257 asks about
// production and why AgencyContentRequest.producedOn is not optional in
// practice. It is the last block of tests in here.

const {
  recordState, ageOn, creatorCompliance, submissionBlockers, latestByKind,
} = require("../lib/agency/compliance");
const { requestState, daysLate, chaseList, cadenceHealth } = require("../lib/agency/pipeline");
const { planPayouts, carryFrom } = require("../lib/agency/payouts");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(62) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

const TODAY = "2026-09-22";

// --- ages --------------------------------------------------------------------
console.log("\n  AGE\n");
ok("the day before a birthday is still the younger age", ageOn("2000-09-23", TODAY), 25);
ok("a birthday counts on the day", ageOn("2000-09-22", TODAY), 26);
ok("no date of birth is null, never a number", ageOn(null, TODAY), null);
ok("an unreadable date of birth is null", ageOn("sometime in 2001", TODAY), null);

// --- document states ---------------------------------------------------------
console.log("\n  DOCUMENTS\n");
ok("absent is missing", recordState(null, TODAY), "missing");
ok("uploaded but unchecked is unverified",
  recordState({ kind: "government_id", createdAt: "2026-01-01" }, TODAY), "unverified");
ok("checked and current is valid",
  recordState({ verifiedAt: "2026-01-01", expiresOn: "2030-01-01" }, TODAY), "valid");
ok("checked but lapsed is expired, not valid",
  recordState({ verifiedAt: "2024-01-01", expiresOn: "2025-06-01" }, TODAY), "expired");
ok("no expiry means it does not lapse",
  recordState({ verifiedAt: "2024-01-01" }, TODAY), "valid");
ok("the newest record of a kind wins",
  latestByKind([
    { kind: "government_id", verifiedAt: "2024-01-01", reference: "old" },
    { kind: "government_id", verifiedAt: "2026-01-01", reference: "new" },
  ]).get("government_id").reference, "new");

// --- the gate ----------------------------------------------------------------
console.log("\n  THE GATE\n");
const fullPaperwork = (creatorId) => [
  { kind: "government_id", creatorId, verifiedAt: "2026-01-01", expiresOn: "2031-01-01" },
  { kind: "age_verification", creatorId, verifiedAt: "2026-01-01" },
  { kind: "model_release", creatorId, verifiedAt: "2026-01-01" },
  { kind: "content_license", creatorId, verifiedAt: "2026-01-01" },
  { kind: "tax_form", creatorId, verifiedAt: "2026-01-01" },
];

const cleared = creatorCompliance(
  { id: "c1", dateOfBirth: "1998-04-02", payoutMethod: "ach", payoutHandle: "****1234" },
  fullPaperwork("c1"), TODAY);
ok("a fully documented creator can publish", cleared.publishable, true);
ok("and can be paid", cleared.payable, true);
ok("with nothing to report", cleared.payBlockers, []);

const noDob = creatorCompliance(
  { id: "c2", payoutMethod: "ach", payoutHandle: "x" }, fullPaperwork("c2"), TODAY);
ok("no date of birth blocks publication", noDob.publishable, false);
ok("and blocks payment too", noDob.payable, false);
ok("naming § 2257", noDob.publishBlockers[0].includes("2257"), true);

const lapsed = creatorCompliance(
  { id: "c3", dateOfBirth: "1998-04-02", payoutMethod: "ach", payoutHandle: "x" },
  [...fullPaperwork("c3").slice(1),
   { kind: "government_id", verifiedAt: "2023-01-01", expiresOn: "2025-02-01" }], TODAY);
ok("an expired ID blocks payment", lapsed.payable, false);
ok("and says which document", lapsed.payBlockers.some((b) => /Government ID expired/.test(b)), true);

const noBank = creatorCompliance(
  { id: "c4", dateOfBirth: "1998-04-02" }, fullPaperwork("c4"), TODAY);
ok("no payout method blocks payment", noBank.payable, false);
ok("but not publication — the content is cleared", noBank.publishable, true);

const noTax = creatorCompliance(
  { id: "c5", dateOfBirth: "1998-04-02", payoutMethod: "ach", payoutHandle: "x" },
  fullPaperwork("c5").filter((r) => r.kind !== "tax_form"), TODAY);
ok("a missing W-9 blocks payment", noTax.payable, false);
ok("and does not block publication", noTax.publishable, true);

const soon = creatorCompliance(
  { id: "c6", dateOfBirth: "1998-04-02", payoutMethod: "ach", payoutHandle: "x" },
  [...fullPaperwork("c6").slice(1),
   { kind: "government_id", verifiedAt: "2021-01-01", expiresOn: "2026-10-10" }], TODAY);
ok("an ID lapsing in 18 days is flagged before it lapses", soon.expiringSoon.length, 1);
ok("and is still valid today", soon.payable, true);

const minor = creatorCompliance(
  { id: "c7", dateOfBirth: "2009-01-01", payoutMethod: "ach", payoutHandle: "x" },
  fullPaperwork("c7"), TODAY);
ok("an underage creator cannot publish whatever the paperwork says", minor.publishable, false);
ok("or be paid", minor.payable, false);

// --- content produced before eighteen ----------------------------------------
console.log("\n  CONTENT PRODUCED BEFORE EIGHTEEN — the case that hides\n");
const nowAdult = { id: "c8", dateOfBirth: "2008-06-01" }; // 18 today, 17 last year
ok("the creator is 18 now", ageOn(nowAdult.dateOfBirth, TODAY), 18);
ok("so the creator-level gate would clear them",
  creatorCompliance({ ...nowAdult, payoutMethod: "ach", payoutHandle: "x" },
    fullPaperwork("c8"), TODAY).publishable, true);
ok("but a clip shot last year is blocked",
  submissionBlockers({ producedOn: "2025-08-01" }, nowAdult, TODAY).length, 1);
ok("naming the age at production",
  submissionBlockers({ producedOn: "2025-08-01" }, nowAdult, TODAY)[0].includes("was 17"), true);
ok("a clip shot this month is fine",
  submissionBlockers({ producedOn: "2026-09-01" }, nowAdult, TODAY), []);
ok("no production date is itself a blocker",
  submissionBlockers({ producedOn: null }, nowAdult, TODAY).length, 1);
ok("a production date in the future is a blocker",
  submissionBlockers({ producedOn: "2027-01-01" }, nowAdult, TODAY)
    .some((b) => /in the future/.test(b)), true);

// --- the chase list ----------------------------------------------------------
console.log("\n  WHO OWES US MEDIA\n");
const requests = [
  { id: "r1", creatorId: "c1", accountId: "a1", title: "Beach set", mediaType: "photo", quantity: 12, dueOn: "2026-09-10", status: "requested", priority: "urgent" },
  { id: "r2", creatorId: "c1", accountId: "a1", title: "PPV clip", mediaType: "video", quantity: 1, dueOn: "2026-09-23", status: "requested", priority: "normal" },
  { id: "r3", creatorId: "c2", accountId: "a2", title: "Weekly set", mediaType: "photo", quantity: 5, dueOn: "2026-09-20", status: "submitted", priority: "normal" },
  { id: "r4", creatorId: "c3", accountId: "a3", title: "Done already", mediaType: "photo", quantity: 3, dueOn: "2026-09-01", status: "published", priority: "normal" },
  { id: "r5", creatorId: "c2", accountId: "a2", title: "No deadline", mediaType: "video", quantity: 1, dueOn: null, status: "requested", priority: "low" },
];

ok("past its date is overdue", requestState(requests[0], TODAY), "overdue");
ok("tomorrow is due-soon", requestState(requests[1], TODAY), "due-soon");
ok("delivered and unreviewed is in-review, not waiting", requestState(requests[2], TODAY), "in-review");
ok("published is done", requestState(requests[3], TODAY), "done");
ok("no due date is just waiting", requestState(requests[4], TODAY), "waiting");
ok("twelve days late is twelve days late", daysLate(requests[0], TODAY), 12);
ok("no due date cannot be late", daysLate(requests[4], TODAY), null);

const chase = chaseList(
  [{ id: "c1", stageName: "Ava", status: "active" },
   { id: "c2", stageName: "Bea", status: "active" },
   { id: "c3", stageName: "Cyd", status: "active" }],
  requests, TODAY);
ok("only creators with open requests appear", chase.length, 2);
ok("the most overdue is first", chase[0].stageName, "Ava");
ok("with the late item listed", chase[0].overdue.map((i) => i.title), ["Beach set"]);
ok("and the one due tomorrow kept separate", chase[0].dueSoon.map((i) => i.title), ["PPV clip"]);
ok("our own review queue is not the creator's fault",
  chase.find((c) => c.stageName === "Bea").inReview.map((i) => i.title), ["Weekly set"]);
ok("a finished creator is off the list",
  chase.some((c) => c.stageName === "Cyd"), false);

console.log("\n  CADENCE\n");
const account = { id: "a1", handle: "ava", postsPerWeek: 5 };
const health = cadenceHealth(account, [
  { accountId: "a1", status: "published", quantity: 4, publishedAt: "2026-09-15" },
  { accountId: "a1", status: "approved", quantity: 3, approvedAt: "2026-09-18" },
  { accountId: "a1", status: "requested", quantity: 9, approvedAt: null },
  { accountId: "a1", status: "published", quantity: 50, publishedAt: "2025-01-01" },
], { today: TODAY, windowDays: 28 });
ok("five a week over four weeks is twenty expected", health.expected, 20);
ok("only delivered items in the window count", health.actual, 7);
ok("so the account is thirteen behind", health.deficit, 13);
ok("an account with no cadence is unmeasurable, not failing",
  cadenceHealth({ id: "a2", postsPerWeek: 0 }, [], { today: TODAY }).ratio, null);

// --- the payout run ----------------------------------------------------------
console.log("\n  THE PAYOUT RUN\n");
const settlement = {
  perCreator: [
    { creatorId: "p1", stageName: "Ready", creatorCents: 120000 },
    { creatorId: "p2", stageName: "NoPaperwork", creatorCents: 90000 },
    { creatorId: "p3", stageName: "Tiny", creatorCents: 1800 },
    { creatorId: "p4", stageName: "Refunded", creatorCents: -2500 },
  ],
};
const payoutCreators = [
  { id: "p1", stageName: "Ready", dateOfBirth: "1996-01-01", payoutMethod: "ach", payoutHandle: "x", payoutMinCents: 5000 },
  { id: "p2", stageName: "NoPaperwork", dateOfBirth: "1996-01-01", payoutMethod: "ach", payoutHandle: "x", payoutMinCents: 5000 },
  { id: "p3", stageName: "Tiny", dateOfBirth: "1996-01-01", payoutMethod: "ach", payoutHandle: "x", payoutMinCents: 5000 },
  { id: "p4", stageName: "Refunded", dateOfBirth: "1996-01-01", payoutMethod: "ach", payoutHandle: "x", payoutMinCents: 5000 },
];
const plan = planPayouts({
  period: "2026-09",
  settlement,
  creators: payoutCreators,
  complianceRecords: {
    p1: fullPaperwork("p1"),
    p2: fullPaperwork("p2").filter((r) => r.kind !== "tax_form"),
    p3: fullPaperwork("p3"),
    p4: fullPaperwork("p4"),
  },
  today: TODAY,
});
const row = (name) => plan.rows.find((r) => r.stageName === name);

ok("a cleared creator is ready", row("Ready").status, "ready");
ok("a missing W-9 holds the payout", row("NoPaperwork").status, "held");
ok("with a reason the creator can act on",
  row("NoPaperwork").reason.includes("Tax form not on file"), true);
ok("$18 is deferred, not held — a different message entirely", row("Tiny").status, "deferred");
ok("and says why", row("Tiny").reason.includes("Below the"), true);
ok("a negative balance defers and explains itself",
  row("Refunded").reason.includes("negative"), true);
ok("held rows sort to the top", plan.rows[0].stageName, "NoPaperwork");
ok("$1,200 is ready to send", plan.readyCents, 120000);
ok("$900 is held", plan.heldCents, 90000);
ok("one hold to clear", plan.heldCount, 1);

console.log("\n  NOTHING IS LOST BETWEEN MONTHS\n");
const carry = carryFrom(plan);
ok("the held payout carries", carry.p2, 90000);
ok("so does the one under the threshold", carry.p3, 1800);
ok("and the negative balance", carry.p4, -2500);
ok("what was sent does not carry", carry.p1, undefined);

const next = planPayouts({
  period: "2026-10",
  settlement: { perCreator: [{ creatorId: "p3", stageName: "Tiny", creatorCents: 4000 }] },
  creators: payoutCreators,
  complianceRecords: { p3: fullPaperwork("p3") },
  carryForward: carry,
  today: "2026-10-22",
});
ok("last month's $18 plus this month's $40 clears the threshold",
  next.rows[0].dueCents, 5800);
ok("so it pays this time", next.rows[0].status, "ready");

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
