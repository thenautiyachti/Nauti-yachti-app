const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

const DAY_TYPE_LABEL = { weekday: "weekday", weekend: "weekend" };

// Body shapes (all admin-only):
//   { field: "price", value: number }
//   { field: "pricePerGuest", value: number }
//   { field: "hourlyByVesselCell", vesselId, dayType, hour, value }
//   { field: "tier", tierIndex, value }
//
// Every successful price change also writes a PriceChangeLog row (internal
// audit trail only — never surfaced on the public site) so a pricing
// discrepancy can be traced back to exactly what changed and when.
async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.package.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  const data = {};
  let logEntry = null; // { field, oldValue, newValue }

  if (body.field === "price") {
    const newValue = Number(body.value);
    logEntry = { field: "Flat price", oldValue: existing.price, newValue };
    data.price = newValue;
  } else if (body.field === "pricePerGuest") {
    const newValue = Number(body.value);
    logEntry = { field: "Per-guest price", oldValue: existing.pricePerGuest, newValue };
    data.pricePerGuest = newValue;
  } else if (body.field === "hourlyByVesselCell") {
    const { vesselId, dayType, hour, value } = body;
    const newValue = Number(value);
    const hourly = existing.hourlyJson ? JSON.parse(existing.hourlyJson) : {};
    const oldValue = hourly[vesselId]?.[dayType]?.[hour] ?? null;
    hourly[vesselId] = hourly[vesselId] || { weekday: {}, weekend: {} };
    hourly[vesselId][dayType] = { ...hourly[vesselId][dayType], [hour]: newValue };
    data.hourlyJson = JSON.stringify(hourly);

    const vessel = await prisma.vessel.findUnique({ where: { id: vesselId }, select: { name: true } });
    logEntry = {
      field: `${vessel?.name || vesselId} / ${DAY_TYPE_LABEL[dayType] || dayType} / ${hour}hr`,
      oldValue,
      newValue,
    };
  } else if (body.field === "tier") {
    const { tierIndex, value } = body;
    const newValue = Number(value);
    const tiers = existing.tiersJson ? JSON.parse(existing.tiersJson) : [];
    if (!tiers[tierIndex]) {
      return NextResponse.json({ error: "Invalid tier index" }, { status: 400 });
    }
    const oldValue = tiers[tierIndex].price ?? null;
    const rangeLabel = tierIndex === 0
      ? `up to ${tiers[0].max ?? "?"}`
      : tiers[tierIndex].max == null
      ? `${(tiers[tierIndex - 1]?.max || 0) + 1}+`
      : `${(tiers[tierIndex - 1]?.max || 0) + 1}-${tiers[tierIndex].max}`;
    tiers[tierIndex] = { ...tiers[tierIndex], price: newValue };
    data.tiersJson = JSON.stringify(tiers);
    logEntry = { field: `Tier ${tierIndex + 1} (${rangeLabel} guests)`, oldValue, newValue };
  } else {
    return NextResponse.json({ error: "Unknown field" }, { status: 400 });
  }

  const [updated] = await Promise.all([
    prisma.package.update({ where: { id }, data }),
    logEntry && logEntry.oldValue !== logEntry.newValue
      ? prisma.priceChangeLog.create({
          data: { packageId: id, packageName: existing.name, field: logEntry.field, oldValue: logEntry.oldValue, newValue: logEntry.newValue },
        })
      : Promise.resolve(),
  ]);
  return NextResponse.json(updated);
}

module.exports = { PATCH };
