const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

// Public — anyone can submit a testimonial. It lands as "pending" and only
// shows up publicly (via GET below) once an owner approves it in the admin
// console. Same moderation-queue pattern as MediaDraft.
// Body: { name, rating, quote, packageOrVessel? }
async function POST(req) {
  const body = await req.json();
  const { name, rating, quote, packageOrVessel } = body;

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!quote || !String(quote).trim()) {
    return NextResponse.json({ error: "quote is required" }, { status: 400 });
  }
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json({ error: "rating must be an integer 1-5" }, { status: 400 });
  }

  const testimonial = await prisma.testimonial.create({
    data: {
      name: String(name).trim(),
      rating: ratingNum,
      quote: String(quote).trim(),
      packageOrVessel: packageOrVessel && String(packageOrVessel).trim() ? String(packageOrVessel).trim() : null,
    },
  });
  return NextResponse.json(testimonial);
}

// Public by default — returns only approved testimonials, most recent first,
// and never leaks pending/rejected content. When called with a valid admin
// session (the owner console's fetch carries the cookie automatically) it
// returns every testimonial instead, so the admin Testimonials tab can
// moderate the full queue through this same endpoint.
async function GET() {
  if (await isAdminAuthenticated()) {
    const all = await prisma.testimonial.findMany({ orderBy: { submittedAt: "desc" } });
    return NextResponse.json(all);
  }
  const approved = await prisma.testimonial.findMany({
    where: { status: "approved" },
    orderBy: { submittedAt: "desc" },
  });
  return NextResponse.json(approved);
}

module.exports = { GET, POST };
