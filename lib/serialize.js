// Turns a raw Package row (with its *Json string columns) into the shape
// the frontend components expect (parsed objects/arrays).
function parsePackage(p) {
  return {
    ...p,
    bullets: p.bulletsJson ? JSON.parse(p.bulletsJson) : null,
    tiers: p.tiersJson ? JSON.parse(p.tiersJson) : null,
    hourlyByVessel: p.hourlyJson ? JSON.parse(p.hourlyJson) : null,
    vessels: JSON.parse(p.vesselsJson),
  };
}

function groupBlockedDates(rows) {
  const grouped = {};
  for (const row of rows) {
    grouped[row.vesselId] = grouped[row.vesselId] || [];
    grouped[row.vesselId].push(row.date);
  }
  return grouped;
}

module.exports = { parsePackage, groupBlockedDates };
