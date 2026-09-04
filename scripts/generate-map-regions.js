// Generates the atlas plates behind the console panels and the public booking
// cards -- one distinct piece of coast per panel, rather than the same sheet of
// grid paper repeated twenty times.
//
// Generated rather than hand-drawn because twenty distinct coastlines that all
// stay clear of dense text is a lot of fiddly path data to get wrong by hand.
// The generator is seeded, so re-running it reproduces exactly the plates the
// site already references instead of reshuffling every panel.
//
//   node scripts/generate-map-regions.js
//
// ---------------------------------------------------------------------------
// THE COORDINATE SPACE IS THE WHOLE DESIGN. Read this before changing S.
//
// A plate is a background sized to `cover`, so it scales by
// max(panelWidth/S, panelHeight/S). The first version used S = 200, and the
// Board panel is roughly 440x1200 -- which magnified everything on the plate
// SIX times. Coastlines turned into fat ribbons and the little mountains turned
// into bare triangles the size of a thumbnail, with no clue what they were.
//
// S = 640 keeps that factor near 1.4 on the tallest panel and below 1 on most,
// so a feature drawn small stays small. Anything added below should be sized as
// a fraction of S, never as a fixed number that happens to look right in one
// panel.
// ---------------------------------------------------------------------------

// Seeded PRNG. Reproducibility is the point: an unseeded generator would
// reshuffle every coastline on each run and churn the stylesheet.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const S = 640;

// One dial for the whole plate. The individual opacities below are tuned
// against each other -- coastline heavier than hatching, hatching heavier than
// soundings -- and that balance is what makes it read as engraving. Rescaling
// them one by one to calm the thing down would wreck the balance, so the entire
// drawing goes inside a group and this scales all of it at once.
//
// It sits behind live figures. At full strength the maps are handsome and the
// money is unreadable, which is the wrong trade every time.
//
// The public site runs quieter still: the console is a tool the owner reads for
// minutes at a time, the booking cards are where a guest decides to spend
// money. Callers pass their own level.
const INK = 0.58;

const r2 = (n) => Math.round(n * 10) / 10;
const r0 = (n) => Math.round(n); // outline coords; tenths are invisible at 1.4x
const C = "%23CB6CE6"; // pre-encoded so the data-URI form stays valid

// --- land ------------------------------------------------------------------

// A landmass: a closed outline whose radius is a sum of sine octaves rather
// than per-vertex noise.
//
// Per-vertex noise was the first attempt and it produces blobs -- every wobble
// the same size, which is what a potato looks like, not a coast. Real coastline
// has structure at several scales at once: one or two great bays, a handful of
// headlands inside those, and fine crenellation along the whole run. Summing a
// few harmonics gives exactly that, and the same function draws a continent or
// an islet depending only on the radius passed in.
//
// `squash` flattens one axis so masses are not all circular, and `rough` scales
// the whole harmonic stack -- islands want more relative roughness than a
// continent, or they read as pebbles.
function landmass(rand, cx, cy, rad, rough = 1, squash = 0.78 + rand() * 0.4) {
  // Deep harmonics carry the great bays, shallow ones the crenellation. The
  // first attempt stopped at the 13th and produced a smooth amoeba: recognisably
  // organic, but nothing you would call a coast. Real shoreline keeps breaking
  // up all the way down to the resolution you draw it at, so the stack runs to
  // the 34th and the higher terms are only lightly damped.
  const octaves = [
    [2, 0.20 * rough, rand() * 6.28],
    [3, 0.15 * rough, rand() * 6.28],
    [5, 0.10 * rough, rand() * 6.28],
    [8, 0.065 * rough, rand() * 6.28],
    [13, 0.045 * rough, rand() * 6.28],
    [21, 0.028 * rough, rand() * 6.28],
    [34, 0.018 * rough, rand() * 6.28],
  ];
  // Enough points to actually resolve the 34th harmonic -- roughly three per
  // cycle, or the fine detail is computed and then thrown away by the sampling.
  const n = Math.max(40, Math.min(150, Math.round(rad * 0.85)));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let rr = 1;
    for (const [k, amp, ph] of octaves) rr += amp * Math.sin(k * a + ph);
    rr *= rad;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash]);
  }
  // Closed Catmull-Rom, so the outline is a smooth continuous coast rather than
  // a polygon with visible corners.
  let d = `M${r0(pts[0][0])} ${r0(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${r0(p1[0] + (p2[0] - p0[0]) / 6)} ${r0(p1[1] + (p2[1] - p0[1]) / 6)}` +
         ` ${r0(p2[0] - (p3[0] - p1[0]) / 6)} ${r0(p2[1] - (p3[1] - p1[1]) / 6)}` +
         ` ${r0(p2[0])} ${r0(p2[1])}`;
  }
  // The furthest the outline ever gets from the centre. Everything placed after
  // a mass is kept clear of THIS, not of `rad` -- the harmonics push the coast
  // out well past the nominal radius, and guarding the nominal one is how ships
  // ended up moored in the middle of a continent.
  let reach = 0;
  for (const p of pts) reach = Math.max(reach, Math.hypot(p[0] - cx, p[1] - cy));
  return { d, cx, cy, rad, reach };
}

// --- chart furniture -------------------------------------------------------
// Coastline alone reads as an abstract shape. What makes an antique plate read
// as one is what the engraver put in the empty water.
//
// There is deliberately no relief here. Mountains were drawn as the little
// humps a 17th-century map uses, and at the old coordinate scale they magnified
// into anonymous triangles scattered across the panels. Fixing the scale would
// have made them legible again, but they were the least informative thing on
// the plate, so they came out instead of back.

function rose(x, y, R) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((d) => `<line x1='0' y1='0' x2='0' y2='${r2(d % 90 === 0 ? -R : -R * 0.6)}'` +
      ` stroke='${C}' stroke-opacity='.5' stroke-width='${d % 90 === 0 ? 1.4 : 0.9}' transform='rotate(${d})'/>`)
    .join("");
  return `<g transform='translate(${r2(x)} ${r2(y)})'>` +
    `<circle r='${r2(R)}' fill='none' stroke='${C}' stroke-opacity='.48' stroke-width='1.2'/>` +
    `<circle r='${r2(R * 0.6)}' fill='none' stroke='${C}' stroke-opacity='.38' stroke-width='.9'/>` +
    rays +
    `<path d='M0 ${r2(-R)} L${r2(R * 0.16)} ${r2(-R * 0.16)} L0 0 L${r2(-R * 0.16)} ${r2(-R * 0.16)} Z'` +
    ` fill='${C}' fill-opacity='.5'/></g>`;
}

const ship = (x, y, sc, flip) =>
  `<use href='%23s' transform='translate(${r2(x)} ${r2(y)}) scale(${r2(flip ? -sc : sc)} ${r2(sc)})'/>`;

const serpent = (x, y, sc, flip) =>
  `<use href='%23w' transform='translate(${r2(x)} ${r2(y)}) scale(${r2(flip ? -sc : sc)} ${r2(sc)})'/>`;

// Rhumb lines converging on a rose, the way a portolan rules them right across
// the water. This reads as "sea chart" faster than anything else on the sheet.
function rhumbs(x, y) {
  let out = `<g stroke='${C}' stroke-opacity='.13' stroke-width='.9'>`;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    out += `<line x1='${r2(x)}' y1='${r2(y)}' x2='${r2(x + Math.cos(a) * S * 1.5)}' y2='${r2(y + Math.sin(a) * S * 1.5)}'/>`;
  }
  return out + "</g>";
}

// The curved meridians of a hemisphere plate, cropped by the panel edge.
function meridians(rand) {
  const cx = rand() < 0.5 ? -S * 0.2 : S * 1.2;
  let out = "";
  for (let i = 0; i < 3; i++) {
    out += `<circle cx='${r2(cx)}' cy='${r2(S / 2 + (rand() - 0.5) * S * 0.25)}' r='${r2(S * 0.6 + i * S * 0.23)}'` +
      ` fill='none' stroke='${C}' stroke-opacity='.18' stroke-width='1'/>`;
  }
  return out;
}

function region(seed, ink = INK) {
  const rand = rng(seed);

  // Everything placed so far, as circles, so nothing can be dropped on top of
  // anything else. This is the fix for the collisions: land used to be scattered
  // at random and regularly overlapped, which reads as a mistake rather than as
  // an archipelago.
  const placed = [];
  const spot = (rad, margin, box = 0) => {
    for (let t = 0; t < 80; t++) {
      const lo = box || rad, hi = S - lo;
      const x = lo + rand() * (hi - lo), y = lo + rand() * (hi - lo);
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - y) < p[2] + rad + margin)) continue;
      placed.push([x, y, rad]);
      return [x, y];
    }
    return null; // no room; draw fewer things rather than overlap
  };

  // Three or four masses spread across the sheet, not one big one.
  //
  // Two things drive this. The plate is sized to `cover` and centre-cropped, so
  // a wide panel sees only a band through the middle -- land has to be spread
  // through the box to be present in every crop. And the interesting part of a
  // chart is the coastline, not the fill: one continent covering half the plate
  // gives a crop that is mostly undifferentiated hatching, while several smaller
  // masses put shoreline everywhere. An earlier version had a single mass of
  // radius 0.3S and read as an amoeba in an empty sea.
  const lands = [];
  const want = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < want; i++) {
    const rad = S * (0.11 + rand() * 0.075);
    // Placed against `reach` rather than `rad`, so masses cannot merge into
    // each other -- two overlapping coastlines is the collision the panels were
    // showing.
    const probe = landmass(rand, 0, 0, rad, 1);
    const at = spot(probe.reach, S * 0.035, S * 0.06);
    if (at) lands.push(landmass(rand, at[0], at[1], rad, 1));
  }

  // Archipelagos, not an even scatter. On a real chart small islands come in
  // chains and clusters with empty water between them; spacing them uniformly
  // across the sheet is the tell that something drew them at random. So pick
  // two or three centres and crowd a group around each, with the islands
  // getting smaller toward the edge of the group.
  //
  // More roughness at this size than a continent gets, or they read as pebbles.
  const isl = [];
  for (let g = 0, groups = 3 + Math.floor(rand() * 3); g < groups; g++) {
    const spread = S * (0.08 + rand() * 0.10);
    const seat = spot(spread * 0.5, S * 0.03, S * 0.1);
    if (!seat) continue;
    for (let i = 0, n = 3 + Math.floor(rand() * 5); i < n; i++) {
      const rad = S * (0.011 + rand() * 0.024) * (1 - i / (n * 1.8));
      const a = rand() * Math.PI * 2, dist = rand() * spread;
      const x = seat[0] + Math.cos(a) * dist, y = seat[1] + Math.sin(a) * dist;
      if (x < rad || y < rad || x > S - rad || y > S - rad) continue;
      const isle = landmass(rand, x, y, rad, 1.5);
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - y) < p[2] + isle.reach + S * 0.012)) continue;
      placed.push([x, y, isle.reach]);
      isl.push(isle.d);
    }
  }

  // Soundings: the stippling through a chart's water. These may sit anywhere,
  // land included -- on a real plate the depth figures run right up to a coast.
  let dots = "";
  for (let i = 0; i < 26; i++) {
    dots += `<circle cx='${r2(rand() * S)}' cy='${r2(rand() * S)}' r='1.7' fill='${C}' fill-opacity='.26'/>`;
  }

  const arcs = rand() < 0.35 ? meridians(rand) : "";
  let under = "", furniture = "";
  if (rand() < 0.6) {
    const R = S * (0.06 + rand() * 0.035);
    const at = spot(R, S * 0.03);
    if (at) { under += rhumbs(at[0], at[1]); furniture += rose(at[0], at[1], R); }
  }
  for (let i = 0, n = 3 + Math.floor(rand() * 3); i < n; i++) {
    const at = spot(S * 0.035, S * 0.015);
    if (at) furniture += ship(at[0], at[1], 1.3 + rand() * 0.7, rand() < 0.5);
  }
  if (rand() < 0.5) {
    const at = spot(S * 0.055, S * 0.015);
    if (at) furniture += serpent(at[0], at[1], 1 + rand() * 0.5, rand() < 0.5);
  }

  // Coastal shading first, then tone, then hatch and coastline. Without a tone
  // under it the hatching alone leaves land indistinguishable from water.
  //
  // Each outline is defined once and referenced three times. A detailed
  // continent is a couple of thousand characters of path data, and emitting it
  // once per pass tripled the file -- 29KB a plate, which is not a decoration
  // budget. The <use> elements carry the styling; the definitions carry none,
  // so it inherits.
  const all = lands.map((L) => L.d).concat(isl);
  let defs = "", parts = "";
  all.forEach((d, i) => { defs += `<path id='L${i}' d='${d}'/>`; });
  const pass = (attrs) => all.map((_, i) => `<use href='%23L${i}' ${attrs}/>`).join("");
  parts += pass(`fill='none' stroke='${C}' stroke-opacity='.10' stroke-width='13'`);
  parts += pass(`fill='${C}' fill-opacity='.13'`);
  parts += pass(`fill='url(%23h)' stroke='${C}' stroke-opacity='.62' stroke-width='1.5'`);

  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${S}' height='${S}' viewBox='0 0 ${S} ${S}'><defs>` +
    `<pattern id='h' width='9' height='9' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>` +
    `<line x1='0' y1='0' x2='0' y2='9' stroke='${C}' stroke-opacity='.5' stroke-width='.9'/></pattern>` +
    // Drawn many times per plate; defining each once is what keeps the file
    // small enough to be worth serving.
    `<g id='s' fill='none' stroke='${C}' stroke-opacity='.58' stroke-width='.95'>` +
    `<path d='M-7 4 L7 4 L5 7.5 L-5 7.5 Z'/><path d='M0 4 L0 -8'/>` +
    `<path d='M0.6 -7 Q6 -3 0.6 -0.5 Z'/><path d='M-0.6 -4 Q-5 -1 -0.6 1.5 Z'/>` +
    `<path d='M-10 9.5 Q-5 11 0 9.5 Q5 8 10 9.5' stroke-opacity='.18'/></g>` +
    `<g id='w' fill='none' stroke='${C}' stroke-opacity='.5' stroke-width='1.1'>` +
    `<path d='M-20 2 Q-14 -7 -8 2 Q-2 10 4 2 Q10 -6 15 1'/>` +
    `<path d='M15 1 L20 -3 L26 0 L20 4 Z'/>` +
    `<path d='M-13 -2 l-2 -4 M-6 -2 l1 -4 M2 2 l-1 -5' stroke-opacity='.4'/>` +
    `<path d='M-24 4 Q-22 0 -19 3' stroke-opacity='.4'/></g>` +
    defs + `</defs><g opacity='${ink}'>` + arcs + under + dots + parts + furniture + `</g></svg>`;

  // Two consumers. As a standalone .svg file none of this needs encoding, which
  // is most of why the plates are served as files.
  //
  // The encoded form is kept for anything wanting a data URI. Commas and quotes
  // both MUST be encoded there: commas because path data is full of them and an
  // unquoted url() sits inside a background shorthand, where a comma is the
  // layer separator; quotes because the URI may be written into an HTML style
  // attribute, where a raw quote ends the attribute early. Between them these
  // two produced blank panels twice, each time with no error anywhere -- an
  // invalid background simply does not paint.
  return {
    raw: svg.replace(/%23/g, "#"),
    encoded: svg.replace(/[<>"'{}|\\^`,()\s]/g, (c) =>
      c === " " ? "%20" : "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")),
  };
}

module.exports = { region };

// Rewrites every plate under public/map/. Two sets, and they are NOT
// interchangeable:
//   region-1..12  the owner console, at full ink
//   site-1..9     the public vessel and package cards, quieter
// Regenerating one without the other leaves half the site pointing at stale
// plates, so this always writes both.
if (require.main === module) {
  const nodeFs = require("fs");
  const nodePath = require("path");
  const dir = nodePath.join(__dirname, "..", "public", "map");
  nodeFs.mkdirSync(dir, { recursive: true });
  const write = (name, svg) => { nodeFs.writeFileSync(nodePath.join(dir, name), svg); return svg.length; };
  let bytes = 0;
  for (let i = 0; i < 12; i++) bytes += write("region-" + (i + 1) + ".svg", region(1000 + i * 7919).raw);
  for (let i = 0; i < 9; i++) bytes += write("site-" + (i + 1) + ".svg", region(4000 + i * 6151, 0.36).raw);
  console.log("21 plates written to public/map (" + Math.round(bytes / 1024) + "KB)");
}
