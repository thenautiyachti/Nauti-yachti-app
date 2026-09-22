const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { requireAdmin, bad } = require("../_guard");
const { submissionBlockers } = require("../../../../lib/agency/compliance");

const STATUSES = ["requested", "submitted", "approved", "rejected", "published", "cancelled"];

async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const requests = await prisma.agencyContentRequest.findMany({
    orderBy: [{ status: "asc" }, { dueOn: "asc" }],
    include: { creator: { select: { id: true, stageName: true } } },
  });
  return NextResponse.json(requests);
}

async function POST(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.creatorId) return bad("creatorId is required.");
  if (!body.title) return bad("A title is required — 'content' is not something anyone can deliver.");

  const request = await prisma.agencyContentRequest.create({
    data: {
      creatorId: body.creatorId,
      accountId: body.accountId || null,
      title: body.title,
      description: body.description || null,
      mediaType: body.mediaType || "photo",
      quantity: Number.isFinite(Number(body.quantity)) ? Number(body.quantity) : 1,
      dueOn: body.dueOn || null,
      priority: body.priority || "normal",
      notes: body.notes || null,
    },
  });
  return NextResponse.json(request);
}

// Move a request along, with the age check standing between "submitted" and
// "approved".
//
// THE ONE TRANSITION THAT CAN BE REFUSED. Approval is the moment this business
// takes responsibility for a piece of content, and it is the only point at
// which the production date can still be checked cheaply. A creator who is over
// 18 today does not clear a clip shot when they were 17 — see
// lib/agency/compliance.js — and no note, override flag or hurry gets past it,
// because there is no version of that content this business can lawfully
// publish or pay for.
async function PATCH(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.id) return bad("id is required.");
  if (body.status && !STATUSES.includes(body.status)) return bad(`status must be one of ${STATUSES.join(", ")}`);

  const existing = await prisma.agencyContentRequest.findUnique({
    where: { id: body.id },
    include: { creator: true },
  });
  if (!existing) return bad("No such request.");

  const producedOn = body.producedOn !== undefined ? body.producedOn : existing.producedOn;

  if (body.status === "approved" || body.status === "published") {
    const blockers = submissionBlockers({ ...existing, producedOn }, existing.creator, new Date());
    if (blockers.length) {
      return NextResponse.json(
        { error: "This content cannot be approved.", blockers },
        { status: 422 }
      );
    }
  }

  if (body.status === "rejected" && !body.rejectionReason && !existing.rejectionReason) {
    return bad("A rejection needs a reason, or it becomes the same request twice.");
  }

  const data = {};
  for (const field of ["title", "description", "mediaType", "dueOn", "priority", "notes", "rejectionReason", "accountId"]) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (body.quantity !== undefined) data.quantity = Number(body.quantity);
  if (body.producedOn !== undefined) data.producedOn = body.producedOn;

  if (body.status && body.status !== existing.status) {
    data.status = body.status;
    const now = new Date();
    if (body.status === "submitted" && !existing.submittedAt) data.submittedAt = now;
    if (body.status === "approved" && !existing.approvedAt) data.approvedAt = now;
    if (body.status === "published" && !existing.publishedAt) data.publishedAt = now;
  }

  const updated = await prisma.agencyContentRequest.update({ where: { id: body.id }, data });
  return NextResponse.json(updated);
}

module.exports = { GET, POST, PATCH };
