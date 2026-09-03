const fs = require("fs");
const path = require("path");
const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");
const { imageSize, remoteImageSize } = require("../../../../lib/imageSize");

// Swapping the image changes the shape the gallery lays the tile out at, so
// the stored size is re-read rather than left describing the old photo.
async function measure(image) {
  try {
    if (/^https?:\/\//i.test(image)) return await remoteImageSize(image);
    return imageSize(fs.readFileSync(path.join(process.cwd(), "public", image.replace(/^\//, ""))));
  } catch {
    return null;
  }
}

// Body: { caption?, image?, category?, sortOrder? } — only the fields present
// are changed, so editing a caption cannot accidentally blank an image.
//
// `params` is awaited: it is a promise in this version of Next, and reading
// params.id directly happened to work in dev while being wrong. Every other
// route here already awaits it.
async function PATCH(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data = {};
  if ("caption" in body) data.caption = String(body.caption ?? "");
  if ("category" in body && String(body.category || "").trim()) data.category = String(body.category).trim();
  if ("sortOrder" in body && Number.isFinite(Number(body.sortOrder))) data.sortOrder = Number(body.sortOrder);
  if ("image" in body) {
    const image = String(body.image || "").trim();
    // An empty image would render a broken tile on the public gallery, which is
    // worse than leaving the old one — removing a tile is what DELETE is for.
    if (!image) return NextResponse.json({ error: "image cannot be empty — delete the tile instead" }, { status: 400 });
    data.image = image;
    const size = await measure(image);
    data.width = size ? size.width : null;
    data.height = size ? size.height : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await prisma.galleryItem.update({ where: { id }, data });
  return NextResponse.json(updated);
}

// Removes the tile from the public gallery. The image file itself stays in
// public/gallery/ — it is versioned in git and may be reused, and deleting a
// file from disk is not something an API call should do quietly.
async function DELETE(req, { params }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.galleryItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

module.exports = { PATCH, DELETE };
