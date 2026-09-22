const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { requireAdmin, bad } = require("../_guard");
const {
  ageGate, normalizeApplication, canTransition, conversionBlockers,
} = require("../../../../lib/agency/applications");

// --- submission throttle -----------------------------------------------------
//
// The only unauthenticated write in the agency. Without a limit it is a form
// that will write rows as fast as a script can post, and the rows land in the
// list a human is supposed to read every morning. In memory, like
// lib/loginThrottle.js, and for the same reason: it stops the realistic case
// cheaply, and the endpoint costs an attacker nothing worth having.
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const SUBMIT_LIMIT = 5;
const MAX_TRACKED = 5000;
const submissions = new Map();

function clientKey(req) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

function throttled(req, now) {
  const key = clientKey(req);
  for (const [k, times] of submissions) {
    const live = times.filter((t) => now - t < SUBMIT_WINDOW_MS);
    if (live.length) submissions.set(k, live);
    else submissions.delete(k);
  }
  if (submissions.size > MAX_TRACKED) {
    submissions.delete(submissions.keys().next().value);
  }

  const mine = submissions.get(key) || [];
  if (mine.length >= SUBMIT_LIMIT) return true;
  submissions.set(key, [...mine, now]);
  return false;
}

// --- public: somebody applying ----------------------------------------------

// PUBLIC AND UNAUTHENTICATED. The only route in the agency that is.
//
// THE AGE CHECK RUNS BEFORE ANYTHING IS WRITTEN, and an applicant who fails it
// leaves no row behind. See lib/agency/applications.js for why keeping a record
// of the refusal would be the opposite of careful.
//
// The response deliberately does not say whether the email is already on file.
// A form that answers "you have already applied" is a form that tells anybody
// who asks whether a particular woman has applied to an adult-content agency,
// and that answer is nobody's business. Duplicates are dropped quietly and the
// applicant sees the same thank-you either way.
async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request body.");
  }

  if (throttled(req, Date.now())) {
    return NextResponse.json(
      { error: "Too many applications from this connection. Please try again later." },
      { status: 429 }
    );
  }

  const gate = ageGate(body, new Date());
  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason, tone: gate.tone }, { status: 400 });
  }

  const { application, errors } = normalizeApplication(body);
  if (errors.length) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  const existing = await prisma.creatorApplication.findFirst({
    where: { email: application.email, status: { notIn: ["declined", "withdrawn"] } },
    select: { id: true },
  });

  if (!existing) {
    await prisma.creatorApplication.create({
      data: { ...application, ageAttestedAt: new Date() },
    });
  }

  // The same answer whether or not a row was written.
  return NextResponse.json({
    ok: true,
    message: "Thanks — your application is in. We read every one and will be in touch by email.",
  });
}

// --- admin: the pipeline -----------------------------------------------------

async function GET(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const status = new URL(req.url).searchParams.get("status");
  const applications = await prisma.creatorApplication.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const counts = {};
  for (const row of await prisma.creatorApplication.groupBy({ by: ["status"], _count: true })) {
    counts[row.status] = row._count;
  }

  return NextResponse.json({ applications, counts });
}

// Move an application along, or convert it into a creator.
//
// THE TWO GATES THAT CANNOT BE SKIPPED. A status change must be a legal one —
// the route checks rather than trusting the console, because a jump from
// "submitted" straight to "signed" would mean an agreement went to somebody
// whose ID nobody ever looked at. And "verified" requires the name of whoever
// did the verifying: a verification with no verifier is the record that fails
// an inspection.
async function PATCH(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.id) return bad("id is required.");

  const application = await prisma.creatorApplication.findUnique({ where: { id: body.id } });
  if (!application) return bad("No such application.");

  const data = {};

  if (body.status && body.status !== application.status) {
    if (!canTransition(application.status, body.status)) {
      return bad(
        `An application cannot go from "${application.status}" to "${body.status}". ` +
          `Each stage exists because the next one depends on it.`
      );
    }

    if (body.status === "verified" && !body.verifiedBy) {
      return bad("Recording an identity check requires the name of whoever performed it.");
    }
    if (body.status === "declined" && !body.declineReason) {
      return bad("A decline needs a reason — the applicant is a person and may ask.");
    }

    data.status = body.status;
    const now = new Date();
    if (body.status === "screening" && !application.screenedAt) {
      data.screenedAt = now;
      data.screenedBy = body.screenedBy || null;
    }
    if (body.status === "verified") {
      data.verifiedAt = now;
      data.screenedBy = body.verifiedBy;
    }
    if (body.status === "agreement_sent") data.agreementSentAt = now;
    if (body.status === "signed") data.agreementSignedAt = now;
    if (body.status === "declined") data.declineReason = body.declineReason;
  }

  for (const field of ["notes", "referredBy"]) {
    if (body[field] !== undefined) data[field] = body[field];
  }

  const updated = await prisma.creatorApplication.update({ where: { id: body.id }, data });
  return NextResponse.json(updated);
}

// Turn a signed, verified application into a creator.
//
// Separate from PATCH because it is a different kind of act: everything above
// edits a record, and this one takes on a person. It creates the AgencyCreator
// the payout and compliance machinery works from, and it refuses unless the
// identity check and the signature both actually happened.
//
// It does NOT copy across a date of birth, because the application never held
// one — the age gate read it and discarded it. The creator's date of birth is
// entered by whoever checked the government ID, from the document, which is the
// only place it should ever have come from.
async function PUT(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.id) return bad("id is required.");
  if (!body.dateOfBirth) {
    return bad("A date of birth from the verified government ID is required to create a creator.");
  }

  const application = await prisma.creatorApplication.findUnique({ where: { id: body.id } });
  const blockers = conversionBlockers(application);
  if (blockers.length) {
    return NextResponse.json(
      { error: "This application cannot become a creator yet.", blockers },
      { status: 422 }
    );
  }

  const creator = await prisma.agencyCreator.create({
    data: {
      stageName: body.stageName || application.name,
      legalName: body.legalName || application.name,
      email: application.email,
      phone: application.phone,
      status: "onboarding",
      dateOfBirth: body.dateOfBirth,
      creatorShareBp: Number.isInteger(body.creatorShareBp) ? body.creatorShareBp : 5000,
      splitBasis: body.splitBasis === "gross" ? "gross" : "net",
      notes: application.notes,
    },
  });

  await prisma.creatorApplication.update({
    where: { id: application.id },
    data: { creatorId: creator.id },
  });

  return NextResponse.json({ creator, applicationId: application.id });
}

module.exports = { POST, GET, PATCH, PUT };
