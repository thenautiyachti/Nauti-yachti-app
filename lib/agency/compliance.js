// The paperwork gate. Nothing publishes and nobody gets paid without it.
//
// This is not a policy this codebase invented. 18 U.S.C. § 2257 puts a
// record-keeping duty on the producer of sexually explicit content: the
// performer's legal name, date of birth, and proof of both, held on file and
// produced on inspection. The duty sits with whoever produces and distributes,
// which in an agency arrangement means this business, not the creator.
//
// WHY IT IS ENFORCED IN CODE RATHER THAN IN A CHECKLIST. The failure mode is
// never "we decided to skip it". It is a creator who onboarded in a hurry
// during a good week, posted for four months, and whose ID nobody ever actually
// looked at — invisible because nothing was ever going to look. A gate that
// runs on every payout and every approval is the only version of this that
// survives a busy month.
//
// It blocks PAYOUTS rather than deleting or hiding anything. Money is the only
// lever that reliably gets a document sent, and a creator who is told exactly
// which form is missing usually sends it the same day. A hold with a reason is
// a request; a hold without one is a dispute.

// What has to be on file before anything of this creator's goes out.
const REQUIRED_TO_PUBLISH = ["government_id", "age_verification", "model_release", "content_license"];

// Everything above, plus the tax form. Paying a US contractor without a W-9
// leaves the payer holding the backup-withholding problem at year end, and by
// then the creator has often stopped replying.
const REQUIRED_TO_PAY = [...REQUIRED_TO_PUBLISH, "tax_form"];

const LABELS = {
  government_id: "Government ID",
  age_verification: "Age verification",
  model_release: "Model release",
  content_license: "Content licence",
  tax_form: "Tax form (W-9 / W-8BEN)",
  platform_agreement: "Platform agreement",
};

function label(kind) {
  return LABELS[kind] || kind;
}

function todayKey(today) {
  if (typeof today === "string" && today) return today.slice(0, 10);
  const d = today instanceof Date ? today : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A record is only as good as its expiry date.
//
// "valid" needs someone to have verified it AND the document not to have
// lapsed. An ID checked in 2024 that expired in 2025 is not a verified ID, and
// the distinction is invisible unless something compares the dates — which is
// the whole reason AgencyComplianceRecord.expiresOn exists.
function recordState(record, today) {
  if (!record) return "missing";
  if (!record.verifiedAt) return "unverified";
  if (record.expiresOn && record.expiresOn < todayKey(today)) return "expired";
  return "valid";
}

// The newest record of each kind wins. Re-verifying issues a new row rather
// than editing the old one, so the history of who checked what and when stays
// intact — which is the part an inspection actually asks for.
function latestByKind(records) {
  const best = new Map();
  for (const r of records || []) {
    const current = best.get(r.kind);
    const stamp = r.verifiedAt || r.createdAt || 0;
    const currentStamp = current ? current.verifiedAt || current.createdAt || 0 : null;
    if (!current || new Date(stamp) >= new Date(currentStamp)) best.set(r.kind, r);
  }
  return best;
}

// How old the creator was on a given day. Null if we cannot say.
//
// Null is not zero and is not "probably fine". A creator with no date of birth
// on file cannot be cleared to publish, because the one question § 2257 asks is
// the one question the record cannot answer.
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

// The whole compliance picture for one creator.
//
// Returns reasons, not just booleans. Every blocker here ends up in front of a
// human — on the payout row as a hold reason, or in a message to the creator —
// so a blocker that cannot explain itself is a support ticket waiting to
// happen.
function creatorCompliance(creator, records, today) {
  const day = todayKey(today);
  const latest = latestByKind(records);

  const states = {};
  for (const kind of REQUIRED_TO_PAY) {
    states[kind] = recordState(latest.get(kind), day);
  }

  const publishBlockers = [];
  const payBlockers = [];

  if (!creator || !creator.dateOfBirth) {
    publishBlockers.push("No date of birth on file — age cannot be verified (18 U.S.C. § 2257).");
  } else {
    const age = ageOn(creator.dateOfBirth, day);
    if (age !== null && age < 18) {
      publishBlockers.push(`Creator is ${age}. Nothing may be published or paid.`);
    }
  }

  for (const kind of REQUIRED_TO_PUBLISH) {
    const state = states[kind];
    if (state === "missing") publishBlockers.push(`${label(kind)} not on file.`);
    else if (state === "unverified") publishBlockers.push(`${label(kind)} uploaded but never verified.`);
    else if (state === "expired") publishBlockers.push(`${label(kind)} expired.`);
  }

  const taxState = states.tax_form;
  if (taxState === "missing") payBlockers.push("Tax form not on file.");
  else if (taxState === "unverified") payBlockers.push("Tax form uploaded but never verified.");
  else if (taxState === "expired") payBlockers.push("Tax form expired.");

  if (creator && !creator.payoutMethod) payBlockers.push("No payout method on file.");
  if (creator && creator.payoutMethod && !creator.payoutHandle) {
    payBlockers.push("Payout method has no account details.");
  }

  // Anything blocking publication also blocks payment. Paying for content that
  // should never have gone out compounds the original problem rather than
  // settling it.
  const allPayBlockers = [...publishBlockers, ...payBlockers];

  return {
    creatorId: creator && creator.id,
    states,
    publishable: publishBlockers.length === 0,
    payable: allPayBlockers.length === 0,
    publishBlockers,
    payBlockers: allPayBlockers,
    // Documents due to lapse inside 30 days. Chasing a renewal before it
    // expires costs a message; chasing it afterwards costs a held payout.
    expiringSoon: REQUIRED_TO_PAY.map((kind) => {
      const record = latest.get(kind);
      if (!record || !record.expiresOn || !record.verifiedAt) return null;
      const days = Math.round((new Date(record.expiresOn) - new Date(day)) / 86400000);
      return days >= 0 && days <= 30 ? { kind, label: label(kind), expiresOn: record.expiresOn, days } : null;
    }).filter(Boolean),
  };
}

// Can this specific piece of content be approved?
//
// Separate from creatorCompliance because it asks a different question. The
// creator being over 18 TODAY does not clear a clip shot two years ago, and
// that gap — content produced before the performer turned 18, delivered after —
// is the exact case § 2257's production-date requirement exists for.
function submissionBlockers(request, creator, today) {
  const blockers = [];
  if (!request) return blockers;

  if (!request.producedOn) {
    blockers.push("No production date recorded — age at production cannot be verified.");
    return blockers;
  }

  if (!creator || !creator.dateOfBirth) {
    blockers.push("No date of birth on file — age at production cannot be verified.");
    return blockers;
  }

  const age = ageOn(creator.dateOfBirth, request.producedOn);
  if (age === null) {
    blockers.push("Date of birth or production date is unreadable.");
  } else if (age < 18) {
    blockers.push(
      `Creator was ${age} on ${request.producedOn}. This content cannot be approved, ` +
        `published or paid for under any circumstances.`
    );
  }

  if (request.producedOn > todayKey(today)) {
    blockers.push(`Production date ${request.producedOn} is in the future.`);
  }

  return blockers;
}

module.exports = {
  REQUIRED_TO_PUBLISH,
  REQUIRED_TO_PAY,
  LABELS,
  label,
  recordState,
  latestByKind,
  ageOn,
  creatorCompliance,
  submissionBlockers,
};
