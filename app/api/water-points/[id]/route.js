const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { isKind, PERMISSION } = require("../../../../lib/waterPoints");

// Rename a saved place, move it, or add a note — a fuel dock that changes hands
// keeps its position and loses its name.
async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const data = {};
  if ("name" in body) {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "A place needs a name" }, { status: 400 });
    data.name = name;
  }
  if ("kind" in body) {
    if (!isKind(body.kind)) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
    data.kind = body.kind;
  }
  if ("lat" in body) {
    const lat = Number(body.lat);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return NextResponse.json({ error: "Latitude is not a real position" }, { status: 400 });
    }
    data.lat = lat;
  }
  if ("lon" in body) {
    const lon = Number(body.lon);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      return NextResponse.json({ error: "Longitude is not a real position" }, { status: 400 });
    }
    data.lon = lon;
  }
  if ("radiusYards" in body) {
    if (body.radiusYards == null || body.radiusYards === "") {
      data.radiusYards = null;
    } else {
      const r = Math.round(Number(body.radiusYards));
      if (!Number.isFinite(r) || r <= 0 || r > 5000) {
        return NextResponse.json({ error: "Radius must be 1-5000 yards" }, { status: 400 });
      }
      data.radiusYards = r;
    }
  }
  // The four safe-harbor facts. Unknown stays null: "nobody has checked" is a
  // different answer from "no", and only one of them excludes a slip.
  for (const f of ["covered", "onProperty", "motorized"]) {
    if (f in body) data[f] = body[f] == null || body[f] === "" ? null : Boolean(body[f]);
  }
  if ("permission" in body) {
    if (!body.permission) data.permission = null;
    else if (!PERMISSION.includes(body.permission)) {
      return NextResponse.json({ error: "Permission must be yes, no or asked" }, { status: 400 });
    } else data.permission = body.permission;
  }
  if ("note" in body) data.note = String(body.note || "").trim() || null;

  const updated = await prisma.waterPoint.update({ where: { id }, data });
  return NextResponse.json(updated);
}

async function DELETE(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.waterPoint.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
