// Web Mercator tile maths, for a small radar map drawn by hand.
//
// WHY NOT A MAP LIBRARY. This draws one fixed-size, phone-sized view of one
// lake. Leaflet would be ~140KB before its CSS, loaded on a boat with two bars
// of signal, to do panning and layer management this does not need. The maths
// below is the entire part we actually use, and having it here means it can be
// tested rather than trusted.
//
// The projection is the standard slippy-map one used by every tile server:
// longitude maps linearly, latitude through the Mercator y term, and the world
// is 2^zoom tiles square at 256px each.

const TILE = 256;

// Fractional tile coordinates — the integer part is which tile, the fraction is
// where inside it.
function project(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n;
  // Clamped to the Mercator limit: beyond ~85.05 degrees y runs to infinity,
  // and a NaN here would silently blank the whole map.
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

// The inverse, for turning a tap back into a position.
function unproject(x, y, zoom) {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const k = Math.PI - (2 * Math.PI * y) / n;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k)));
  return { lat, lon };
}

// Which tiles cover a viewport of `width` x `height` centred on lat/lon, and
// where each one sits in CSS pixels relative to the container's top-left.
//
// Returns tiles with x/y/z ready for a URL template and left/top for placement.
// Out-of-range tiles are dropped rather than requested: a tile server answers
// those with a 404 image, which renders as a broken square.
function tilesFor(lat, lon, zoom, width, height) {
  const n = Math.pow(2, zoom);
  const centre = project(lat, lon, zoom);
  // Where the centre of the map sits inside the container.
  const cx = width / 2;
  const cy = height / 2;
  // The tile containing the centre, and the offset of that tile's top-left.
  const originLeft = cx - (centre.x % 1) * TILE;
  const originTop = cy - (centre.y % 1) * TILE;
  const baseX = Math.floor(centre.x);
  const baseY = Math.floor(centre.y);

  // How many tiles either side are needed to cover the container.
  const spanX = Math.ceil((width / 2 - (TILE - (centre.x % 1) * TILE)) / TILE) + 1;
  const spanY = Math.ceil((height / 2 - (TILE - (centre.y % 1) * TILE)) / TILE) + 1;

  const out = [];
  for (let dy = -spanY; dy <= spanY; dy++) {
    for (let dx = -spanX; dx <= spanX; dx++) {
      const tx = baseX + dx;
      const ty = baseY + dy;
      // Y has no wraparound — above the pole and below it are nothing.
      if (ty < 0 || ty >= n) continue;
      // X wraps around the globe. Irrelevant for one lake, correct anyway.
      const wrapped = ((tx % n) + n) % n;
      out.push({
        key: `${zoom}/${wrapped}/${ty}`,
        x: wrapped, y: ty, z: zoom,
        left: Math.round(originLeft + dx * TILE),
        top: Math.round(originTop + dy * TILE),
      });
    }
  }
  return out;
}

// Where a lat/lon falls inside the container, in CSS pixels. Used to place the
// boat and the dock on top of the tiles.
function pointIn(lat, lon, centreLat, centreLon, zoom, width, height) {
  const c = project(centreLat, centreLon, zoom);
  const p = project(lat, lon, zoom);
  return {
    left: width / 2 + (p.x - c.x) * TILE,
    top: height / 2 + (p.y - c.y) * TILE,
  };
}

// Is that point actually inside the box we are drawing? A marker placed
// hundreds of pixels outside still renders, dragging the layout with it.
function isVisible(pt, width, height, margin) {
  const m = margin == null ? 0 : margin;
  return pt.left >= -m && pt.left <= width + m && pt.top >= -m && pt.top <= height + m;
}

// A zoom at which both points fit in the box, so the boat and the dock are on
// screen together without anyone pinching. Bounded to sensible slippy zooms.
function zoomToFit(a, b, width, height, maxZoom, minZoom) {
  const hi = maxZoom == null ? 12 : maxZoom;
  const lo = minZoom == null ? 6 : minZoom;
  if (!a || !b || a.lat == null || b.lat == null) return hi;
  for (let z = hi; z >= lo; z--) {
    const pa = project(a.lat, a.lon, z);
    const pb = project(b.lat, b.lon, z);
    // A margin so the markers are not jammed against the edge.
    if (Math.abs(pa.x - pb.x) * TILE < width * 0.7 &&
        Math.abs(pa.y - pb.y) * TILE < height * 0.7) return z;
  }
  return lo;
}

module.exports = { TILE, project, unproject, tilesFor, pointIn, isVisible, zoomToFit };
