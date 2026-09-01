const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { caption } = await req.json();
  const updated = await prisma.galleryItem.update({
    where: { id: params.id },
    data: { caption },
  });
  return NextResponse.json(updated);
}

module.exports = { PATCH };
