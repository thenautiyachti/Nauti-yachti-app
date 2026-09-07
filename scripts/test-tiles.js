// Tile maths is the kind of thing that looks right and is off by one tile.
// Checked against known reference values rather than against itself.
const { TILE, project, unproject, tilesFor, pointIn, isVisible, zoomToFit } = require("../lib/tiles");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(56) +
    (good ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}
function near(what, got, want, tol) {
  const good = got != null && Number.isFinite(got) && Math.abs(got - want) <= tol;
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(56) +
    (good ? "" : `\n         got ${got}  want ~${want} (±${tol})`));
  good ? pass++ : fail++;
}

const LAKE = { lat: 30.3935, lon: -95.5836 };

console.log("\n  THE PROJECTION, AGAINST KNOWN VALUES\n");
// Null island at zoom 1 sits exactly on the corner where all four tiles meet.
ok("0,0 at z1 is the centre of the world", project(0, 0, 1), { x: 1, y: 1 });
ok("0,0 at z0 is the middle of the single tile", project(0, 0, 0), { x: 0.5, y: 0.5 });
// The antimeridian and the western edge.
near("lon -180 is x=0", project(0, -180, 4).x, 0, 1e-9);
near("lon 180 is the far edge", project(0, 180, 4).x, 16, 1e-9);
// Lake Conroe at z10 — the tile every US radar viewer would agree on.
const p = project(LAKE.lat, LAKE.lon, 10);
// Derived by hand from the Web Mercator formulas, not from this module:
//   x = (-95.5836 + 180)/360 * 1024 = 240.12
//   y = (1 - ln(tan(30.3935deg) + sec(30.3935deg))/pi)/2 * 1024 = 421.182
ok("Lake Conroe is in tile 240/421 at z10", [Math.floor(p.x), Math.floor(p.y)], [240, 421]);
near("and about a tenth into that tile horizontally", p.x - 240, 0.118, 0.005);
near("and about a fifth into it vertically", p.y - 421, 0.182, 0.005);
// Mercator blows up at the poles; clamping keeps it finite.
ok("the north pole does not produce Infinity", Number.isFinite(project(90, 0, 4).y), true);
ok("nor the south pole", Number.isFinite(project(-90, 0, 4).y), true);

console.log("\n  AND BACK AGAIN\n");
const rt = unproject(p.x, p.y, 10);
near("round trip keeps the latitude", rt.lat, LAKE.lat, 1e-9);
near("round trip keeps the longitude", rt.lon, LAKE.lon, 1e-9);
const rt2 = unproject(project(-33.86, 151.21, 8).x, project(-33.86, 151.21, 8).y, 8);
near("southern hemisphere too", rt2.lat, -33.86, 1e-9);
near("and eastern", rt2.lon, 151.21, 1e-9);

console.log("\n  COVERING THE VIEWPORT\n");
const W = 340, H = 400;
const tiles = tilesFor(LAKE.lat, LAKE.lon, 10, W, H);
ok("every tile is at the requested zoom", tiles.every((t) => t.z === 10), true);
ok("no duplicate tiles requested", new Set(tiles.map((t) => t.key)).size, tiles.length);
// The point of the grid is that it leaves no gap.
const minL = Math.min(...tiles.map((t) => t.left));
const maxR = Math.max(...tiles.map((t) => t.left + TILE));
const minT = Math.min(...tiles.map((t) => t.top));
const maxB = Math.max(...tiles.map((t) => t.top + TILE));
ok("covers the left edge", minL <= 0, true);
ok("covers the right edge", maxR >= W, true);
ok("covers the top edge", minT <= 0, true);
ok("covers the bottom edge", maxB >= H, true);
// And that it does not fetch half the planet to do it.
ok("does not over-fetch", tiles.length <= 25, true);

console.log("\n  TILES THAT DO NOT EXIST ARE NOT REQUESTED\n");
// A 404 from a tile server renders as a broken square, so out-of-range rows
// must never be asked for.
const atPole = tilesFor(85, 0, 2, W, H);
ok("no negative y", atPole.every((t) => t.y >= 0), true);
ok("no y past the bottom of the world", atPole.every((t) => t.y < Math.pow(2, 2)), true);
// X wraps instead, because the world is a cylinder.
const atEdge = tilesFor(0, 179.9, 2, W, H);
ok("x wraps rather than going out of range",
  atEdge.every((t) => t.x >= 0 && t.x < Math.pow(2, 2)), true);

console.log("\n  PLACING THE BOAT AND THE DOCK\n");
const centre = pointIn(LAKE.lat, LAKE.lon, LAKE.lat, LAKE.lon, 10, W, H);
ok("the centre point lands in the middle", [Math.round(centre.left), Math.round(centre.top)], [W / 2, H / 2]);
// North is up and east is right, which is worth asserting because a sign slip
// here puts the boat on the wrong side of the dock.
const north = pointIn(LAKE.lat + 0.05, LAKE.lon, LAKE.lat, LAKE.lon, 10, W, H);
ok("further north draws higher up", north.top < centre.top, true);
const east = pointIn(LAKE.lat, LAKE.lon + 0.05, LAKE.lat, LAKE.lon, 10, W, H);
ok("further east draws to the right", east.left > centre.left, true);
const south = pointIn(LAKE.lat - 0.05, LAKE.lon, LAKE.lat, LAKE.lon, 10, W, H);
ok("further south draws lower down", south.top > centre.top, true);

ok("a point in the box is visible", isVisible(centre, W, H), true);
ok("a point far outside is not", isVisible({ left: -900, top: 40 }, W, H), false);
ok("a margin admits one just off the edge", isVisible({ left: -20, top: 40 }, W, H, 40), true);

console.log("\n  A ZOOM THAT FITS BOTH\n");
const OUT = { lat: 30.44, lon: -95.61 };
const z = zoomToFit(OUT, LAKE, W, H);
ok("picks a real slippy zoom", z >= 6 && z <= 12, true);
// Both must actually be inside the box at the chosen zoom — that is the point.
const a = pointIn(OUT.lat, OUT.lon, LAKE.lat, LAKE.lon, z, W, H);
ok("the boat is on screen at that zoom", isVisible(a, W, H), true);
// Two points far apart force a wider view than two close together.
ok("further apart means zoomed further out",
  zoomToFit({ lat: 32.7, lon: -96.8 }, LAKE, W, H) < zoomToFit(OUT, LAKE, W, H), true);
ok("no second point falls back to the closest zoom", zoomToFit(null, LAKE, W, H), 12);

console.log("\n  " + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
