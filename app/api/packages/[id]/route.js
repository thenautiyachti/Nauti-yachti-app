const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Body shapes (all admin-only):
//   { field: "price", value: number }
//   { field: "pricePerGuest", value: number }
//   { field: "hourlyByVesselCell", vesselId, dayType, hour, value }
//   { field: "tier", tierIndex, value }
async function PATCH(req, { params }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = params;
  const body = await req.json();
  const existing = await prisma.package.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  const data = {};

  if (body.field === "price") {
    data.price = Number(body.value);
  } else if (body.field === "pricePerGuest") {
    data.pricePerGuest = Number(body.value);
  } else if (body.field === "hourlyByVesselCell") {
    const { vesselId, dayType, hour, value } = body;
    const hourly = existing.hourlyJson ? JSON.parse(existing.hourlyJson) : {};
    hourly[vesselId] = hourly[vesselId] || { weekday: {}, weekend: {} };
    hourly[vesselId][dayType] = { ...hourly[vesselId][dayType], [hour]: Number(value) };
    data.hourlyJson = JSON.stringify(hourly);
  } else if (body.field === "tier") {
    const { tierIndex, value } = body;
    const tiers = existing.tiersJson ? JSON.parse(existing.tiersJson) : [];
    if (!tiers[tierIndex]) {
      return NextResponse.json({ error: "Invalid tier index" }, { status: 400 });
    }
    tiers[tierIndex] = { ...tiers[tierIndex], price: Number(value) };
    data.tiersJson = JSON.stringify(tiers);
  } else {
    return NextResponse.json({ error: "Unknown field" }, { status: 400 });
  }

  const updated = await prisma.package.update({ where: { id }, data });
  return NextResponse.json(updated);
}

module.exports = { PATCH };
