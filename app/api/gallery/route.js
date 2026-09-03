const fs = require("fs");
const path = require("path");
const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");
const { imageSize, remoteImageSize } = require("../../../lib/imageSize");

// The gallery lays out justified rows, which needs each photo's shape up front.
// Measuring on the way in means a photo added through the console lays out
// correctly straight away, with no list for anyone to remember to update.
async function measure(image) {
  try {
    if (/^https?:\/\//i.test(image)) return await remoteImageSize(image);
    const file = path.join(process.cwd(), "public", image.replace(/^\//, ""));
    return imageSize(fs.readFileSync(file));
  } catch {
    // A photo whose size cannot be read still gets added; the gallery falls
    // back to a portrait shape for it rather than refusing the upload.
    return null;
  }
}

async function GET() {
  const items = await prisma.galleryItem.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(items);
}

// Add a tile. The gallery was read-only, so the only way to change it was a
// direct database edit — which is why 32 of its 35 images still point at
// BrandCrowd, a logo-design service that happened to be handy at the time.
//
// New images belong in `public/gallery/` and are referenced as "/gallery/x.jpg":
// served by Vercel, versioned in git, and dependent on nobody else's account
// staying alive.
async function POST(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const image = String(body.image || "").trim();
  const category = String(body.category || "").trim();
  if (!image || !category) {
    return NextResponse.json({ error: "image and category are both required" }, { status: 400 });
  }

  // Ids are human-readable and category-scoped ("g-tubing-6"), which is how
  // every existing row is named — keep that rather than switching to cuids
  // halfway through the table.
  const siblings = await prisma.galleryItem.findMany({ where: { category } });
  const nextNum = siblings.reduce((max, g) => {
    const m = String(g.id).match(/-(\d+)$/);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0) + 1;

  const size = await measure(image);

  const item = await prisma.galleryItem.create({
    data: {
      id: `g-${category}-${nextNum}`,
      image,
      caption: String(body.caption || "").trim(),
      category,
      width: size ? size.width : null,
      height: size ? size.height : null,
      // Sorting is per-category in the public gallery, so a new tile goes last
      // within its own group rather than last overall.
      sortOrder: siblings.length ? Math.max(...siblings.map((g) => g.sortOrder || 0)) + 1 : 1,
    },
  });
  return NextResponse.json(item);
}

module.exports = { GET, POST };
