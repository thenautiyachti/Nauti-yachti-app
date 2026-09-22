const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { requireAdmin, bad } = require("../_guard");
const { REQUIRED_TO_PAY } = require("../../../../lib/agency/compliance");

async function GET(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const creatorId = new URL(req.url).searchParams.get("creatorId");
  const records = await prisma.agencyComplianceRecord.findMany({
    where: creatorId ? { creatorId } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(records);
}

// Record that a document exists and has been looked at.
//
// NO DOCUMENT IS ACCEPTED HERE, only a reference to one. Government ID scans
// and tax forms do not belong in this database and are not put in it: a leaked
// backup should embarrass this business rather than expose the people who
// trusted it with a passport photo. The route rejects anything that looks like
// an embedded file for the same reason, because the easiest way for that rule
// to fail is for somebody to paste a data URL into the reference field.
async function POST(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.creatorId) return bad("creatorId is required.");
  if (!body.kind) return bad("kind is required.");

  if (typeof body.reference === "string" && /^data:/i.test(body.reference.trim())) {
    return bad(
      "reference is a pointer to the secure store, not the document itself. " +
        "Identity documents must not be stored in this database."
    );
  }
  if (typeof body.reference === "string" && body.reference.length > 500) {
    return bad("reference is too long to be a pointer. Store the document elsewhere and link to it.");
  }

  // Verification is an assertion by a named person. Recording that a document
  // was checked without recording who checked it is the part that fails an
  // inspection, so it is required rather than defaulted.
  if (body.verifiedAt && !body.verifiedBy) {
    return bad("Recording a verification requires the name of whoever performed it.");
  }

  const record = await prisma.agencyComplianceRecord.create({
    data: {
      creatorId: body.creatorId,
      kind: body.kind,
      reference: body.reference || null,
      verifiedBy: body.verifiedBy || null,
      verifiedAt: body.verifiedAt ? new Date(body.verifiedAt) : null,
      expiresOn: body.expiresOn || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json({ record, requiredKinds: REQUIRED_TO_PAY });
}

module.exports = { GET, POST };
