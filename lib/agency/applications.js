// The front door: who may apply, and what happens to them afterwards.
//
// THE AGE GATE IS THE WHOLE POINT OF THIS FILE. Everything else here is
// bookkeeping.
//
// A creator-management business has exactly one failure it cannot recover from,
// and it happens at the beginning, not the end: someone under 18 gets into the
// pipeline. By the time content exists the damage is done, and no amount of
// downstream checking undoes it. So the check runs at the earliest possible
// moment — before a database row exists, before anyone reads the application,
// before a human is involved at all.
//
// AN APPLICANT WHO FAILS IT LEAVES NO RECORD. That is deliberate and it is not
// an oversight in the audit trail. The instinct is to log the refusal "for
// compliance", which would mean storing a minor's name, email, phone and date
// of birth in order to prove we declined to deal with them. Holding that data
// is the harm. We decline, we keep nothing, and the only thing recorded is an
// anonymous count.
//
// The attestation is not proof. Somebody ticking a box is a claim, and this
// module treats it as one. Proof is a government ID looked at by a named person,
// which happens later and lives in AgencyComplianceRecord. Both are required:
// the gate keeps minors out of the funnel, the ID check keeps them out of the
// business.

// Minimum age. Eighteen everywhere this operates; kept as a constant because a
// number this important should be findable by searching for what it means
// rather than by searching for "18".
const MINIMUM_AGE = 18;

const STATUSES = [
  "submitted",
  "screening",
  "verified",
  "agreement_sent",
  "signed",
  "declined",
  "withdrawn",
];

// What can follow what.
//
// Forward only, with two exits available from anywhere. "withdrawn" is somebody
// changing their mind, which can happen at any point and is not a rejection —
// the console shows the two differently because telling a person they were
// declined when they withdrew is both wrong and insulting.
const NEXT_STATUSES = {
  submitted: ["screening", "declined", "withdrawn"],
  screening: ["verified", "declined", "withdrawn"],
  verified: ["agreement_sent", "declined", "withdrawn"],
  agreement_sent: ["signed", "declined", "withdrawn"],
  signed: [],
  declined: [],
  withdrawn: ["screening"], // they came back; pick up where they left off
};

function todayKey(today) {
  if (typeof today === "string" && today) return today.slice(0, 10);
  const d = today instanceof Date ? today : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ageOn(dateOfBirth, dateKey) {
  if (!dateOfBirth || !dateKey) return null;
  const dob = new Date(`${String(dateOfBirth).slice(0, 10)}T00:00:00Z`);
  const on = new Date(`${String(dateKey).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(on.getTime())) return null;

  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const month = on.getUTCMonth() - dob.getUTCMonth();
  if (month < 0 || (month === 0 && on.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

// May this application proceed at all?
//
// Returns { ok } or { ok: false, reason, tone }. `tone` exists because the two
// refusals need different words in front of a person: somebody who mistyped a
// date should be asked to check it, and somebody who is sixteen should be told
// plainly and kindly that they cannot apply, not handed a validation error that
// invites them to try a different number.
//
// FAILS CLOSED. An unreadable or missing date of birth is a refusal, not a
// warning and not a pass-with-a-flag. "We could not tell how old they were" and
// "they were old enough" must never resolve to the same outcome.
function ageGate({ dateOfBirth, agreedToAgeTerms }, today) {
  if (!agreedToAgeTerms) {
    return {
      ok: false,
      tone: "check",
      reason: "Please confirm you are 18 or over to continue.",
    };
  }

  if (!dateOfBirth) {
    return { ok: false, tone: "check", reason: "Please enter your date of birth." };
  }

  const day = todayKey(today);
  const age = ageOn(dateOfBirth, day);

  if (age === null) {
    return { ok: false, tone: "check", reason: "That date of birth could not be read. Please check it." };
  }
  if (age > 120) {
    return { ok: false, tone: "check", reason: "Please check your date of birth." };
  }
  if (String(dateOfBirth).slice(0, 10) > day) {
    return { ok: false, tone: "check", reason: "Please check your date of birth." };
  }

  if (age < MINIMUM_AGE) {
    return {
      ok: false,
      tone: "under_age",
      reason:
        `You must be ${MINIMUM_AGE} or over to apply. We have not kept any of the ` +
        `details you entered.`,
    };
  }

  return { ok: true, age };
}

// Tidy up what the form sent, and say what is missing.
//
// Length caps on every field. This is a public endpoint, so the only thing
// standing between it and a megabyte of pasted text is this function.
function normalizeApplication(body) {
  const text = (value, max) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";

  const application = {
    name: text(body.name, 120),
    email: text(body.email, 200).toLowerCase(),
    phone: text(body.phone, 40),
    socials: text(body.socials, 500),
    experience: text(body.experience, 2000),
    about: text(body.about, 2000),
    referredBy: text(body.referredBy, 60) || null,
    sourcePath: text(body.sourcePath, 200) || null,
  };

  const errors = [];
  if (!application.name) errors.push("Please tell us your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(application.email)) {
    errors.push("Please enter an email address we can reach you at.");
  }

  return { application, errors };
}

// Is this a legal status change?
//
// Checked in the route rather than trusted from the console, because the
// console is a screen somebody left open and the statuses carry meaning — a
// jump straight from "submitted" to "signed" would mean an agreement went out
// to somebody whose ID nobody ever looked at.
function canTransition(from, to) {
  if (!STATUSES.includes(to)) return false;
  return (NEXT_STATUSES[from] || []).includes(to);
}

// What has to be true before this applicant becomes a creator.
//
// The conversion is the moment the business takes responsibility for a person,
// so it is gated on the two things that cannot be filled in afterwards: a
// government ID that a named person actually looked at, and a signed agreement.
function conversionBlockers(application) {
  const blockers = [];
  if (!application) return ["No application."];

  if (application.status !== "signed") {
    blockers.push("The agreement has not been signed.");
  }
  if (!application.verifiedAt) {
    blockers.push("No identity verification recorded — a person must check a government ID.");
  }
  if (!application.agreementSignedAt) {
    blockers.push("No signature date recorded.");
  }
  if (application.creatorId) {
    blockers.push("This application has already been converted.");
  }
  return blockers;
}

// The stages, in order, for the console and for the applicant's own status page.
const PIPELINE = [
  { status: "submitted", label: "Application received", blurb: "We read every one." },
  { status: "screening", label: "Under review", blurb: "We are looking at your application." },
  { status: "verified", label: "ID verified", blurb: "We have checked your government ID." },
  { status: "agreement_sent", label: "Agreement sent", blurb: "Read it properly before you sign." },
  { status: "signed", label: "Signed", blurb: "Onboarding begins." },
];

module.exports = {
  MINIMUM_AGE,
  STATUSES,
  NEXT_STATUSES,
  PIPELINE,
  ageOn,
  ageGate,
  normalizeApplication,
  canTransition,
  conversionBlockers,
};
