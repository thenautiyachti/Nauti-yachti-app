// Generates a set of old-world atlas regions as SVG data URIs, one per console
// panel, so each tile is a different piece of coast instead of the same sheet of
// grid paper repeated twenty-one times.
//
// Generated rather than hand-drawn for one reason: hand-drawing twenty distinct
// coastlines that all stay clear of dense text is a lot of fiddly path data to
// get wrong, and a seeded generator gives genuinely different shapes that are
// reproducible -- rerun this and you get the same regions back, so the CSS is
// stable across edits.
//
// Each region is square and composed to survive cropping, because a panel can be
// wide and short or tall and narrow and the background is sized to cover. Land
// sits in corners and islands scatter, so any crop still reads as a piece of
// chart.

// Seeded PRNG. Reproducibility is the whole point: an unseeded generator would
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

const S = 200; // region box, square so any crop stays sensible

// One dial for the whole plate. The individual opacities below are tuned
// against each other -- coastline heavier than hatching, hatching heavier than
// soundings -- and that balance is what makes it read as engraving. Rescaling
// them one by one to calm the thing down would wreck the balance, so the entire
// drawing goes inside a group and this scales all of it at once.
//
// It sits behind live figures. At full strength the maps are handsome and the
// money is unreadable, which is the wrong trade every time.
const INK = 0.42;

// The public site runs quieter than this. The console is a working tool the
// owner reads for minutes at a time and already knows by heart; the booking
// pages are where a guest decides to spend money, and a price or a capacity
// competing with a coastline costs more than the coastline is worth. Callers
// pass their own value -- see PLATE_INK in generate-site-plates.
const r2 = (n) => Math.round(n * 10) / 10;

// A coast running across the box from one edge, as a closed path. The walk is
// what gives it bays and headlands; a plain sine would read as a wave.
function coast(rand, edge, depthMin, depthMax) {
  const steps = 7 + Math.floor(rand() * 3);
  const pts = [];
  let depth = depthMin + rand() * (depthMax - depthMin);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    depth += (rand() - 0.5) * 26;
    depth = Math.max(depthMin * 0.55, Math.min(depthMax * 1.25, depth));
    pts.push([t * (S + 20) - 10, depth]);
  }
  // Catmull-Rom through the points, so the coast curves instead of kinking,
  // with the occasional headland left sharp.
  let d = `M-10 -10 L${S + 10} -10 L${S + 10} ${r2(pts[pts.length - 1][1])}`;
  for (let i = pts.length - 1; i > 0; i--) {
    const p = pts[i], q = pts[i - 1];
    if (rand() < 0.22) { d += ` L${r2(q[0])} ${r2(q[1])}`; continue; } // headland
    const cx1 = p[0] - (p[0] - q[0]) * 0.45, cy1 = p[1] + (rand() - 0.5) * 14;
    const cx2 = q[0] + (p[0] - q[0]) * 0.45, cy2 = q[1] + (rand() - 0.5) * 14;
    d += ` C${r2(cx1)} ${r2(cy1)}, ${r2(cx2)} ${r2(cy2)}, ${r2(q[0])} ${r2(q[1])}`;
  }
  d += " Z";
  // The walk is written for a coast along the top; the other three edges are the
  // same shape turned, which is cheaper and more reliable than four generators.
  const turn = { top: "", bottom: `rotate(180 ${S / 2} ${S / 2})`, left: `rotate(-90 ${S / 2} ${S / 2})`, right: `rotate(90 ${S / 2} ${S / 2})` }[edge];
  return { d, turn };
}

// An island: a closed polar shape with a noisy radius, so no two are alike and
// none is an oval.
function island(rand, cx, cy, rad) {
  const n = 7 + Math.floor(rand() * 3);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (0.62 + rand() * 0.58);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.78]);
  }
  let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2 + (rand() - 0.5) * rad * 0.5;
    const my = (p[1] + q[1]) / 2 + (rand() - 0.5) * rad * 0.5;
    d += ` Q${r2(mx)} ${r2(my)}, ${r2(q[0])} ${r2(q[1])}`;
  }
  return d + " Z";
}

// --- chart furniture ------------------------------------------------------
// Coastline alone reads as an abstract shape. What makes an antique plate read
// as one is what the engraver put in the empty water: a rose, a ship or two,
// meridian arcs. These are the difference between "textured panel" and "piece
// of an atlas", so most regions get at least one.

function rose(x, y, R) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((d) => `<line x1='0' y1='0' x2='0' y2='${d % 90 === 0 ? -R : -R * 0.6}' stroke='%23CB6CE6' stroke-opacity='.5' stroke-width='${d % 90 === 0 ? 1 : 0.6}' transform='rotate(${d})'/>`)
    .join("");
  return `<g transform='translate(${r2(x)} ${r2(y)})'>` +
    `<circle r='${r2(R)}' fill='none' stroke='%23CB6CE6' stroke-opacity='.48' stroke-width='.8'/>` +
    `<circle r='${r2(R * 0.6)}' fill='none' stroke='%23CB6CE6' stroke-opacity='.38' stroke-width='.6'/>` +
    rays +
    `<path d='M0 ${r2(-R)} L3 -3 L0 0 L-3 -3 Z' fill='%23CB6CE6' fill-opacity='.5'/></g>`;
}

// A ship, small enough to be a mark rather than an illustration: hull, mast,
// two bellied sails, and a suggestion of a wake.
function ship(x, y, sc, flip) {
  return `<use href='%23s' transform='translate(${r2(x)} ${r2(y)}) scale(${flip ? -sc : sc} ${sc})'/>`;
}

// A sea serpent. Every plate of this period puts something in the empty ocean,
// and the monsters are the most recognisable thing on them -- humped body
// breaking the surface, spined back, blunt head. Kept to a few strokes: at this
// size anything more detailed turns to mud.
function serpent(x, y, sc, flip) {
  return `<g transform='translate(${r2(x)} ${r2(y)}) scale(${flip ? -sc : sc} ${sc})' fill='none' stroke='%23CB6CE6' stroke-opacity='.5' stroke-width='1.1'>` +
    `<path d='M-20 2 Q-14 -7 -8 2 Q-2 10 4 2 Q10 -6 15 1'/>` +
    `<path d='M15 1 L20 -3 L26 0 L20 4 Z'/>` +
    `<path d='M-13 -2 l-2 -4 M-6 -2 l1 -4 M2 2 l-1 -5' stroke-opacity='.4'/>` +
    `<path d='M-24 4 Q-22 0 -19 3' stroke-opacity='.4'/>` +
    `<circle cx='22' cy='0' r='.8' fill='%23CB6CE6' fill-opacity='.5' stroke='none'/></g>`;
}

// Rhumb lines converging on a rose, the way a portolan rules them right across
// the water. This is the device that reads as "sea chart" faster than anything
// else on the sheet.
function rhumbs(x, y) {
  let out = `<g stroke='%23CB6CE6' stroke-opacity='.14' stroke-width='.5'>`;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    out += `<line x1='${r2(x)}' y1='${r2(y)}' x2='${r2(x + Math.cos(a) * 300)}' y2='${r2(y + Math.sin(a) * 300)}'/>`;
  }
  return out + "</g>";
}

// The curved meridians of a hemisphere plate, cropped by the panel edge. Two or
// three arcs is enough to imply the projection.
function meridians(rand) {
  const cx = rand() < 0.5 ? -40 : S + 40;
  let out = "";
  for (let i = 0; i < 3; i++) {
    const rr = 120 + i * 46;
    out += `<circle cx='${cx}' cy='${r2(S / 2 + (rand() - 0.5) * 50)}' r='${rr}' fill='none' stroke='%23CB6CE6' stroke-opacity='.20' stroke-width='.7'/>`;
  }
  return out;
}

const EDGES = ["top", "bottom", "left", "right"];

function region(seed, ink = INK) {
  const rand = rng(seed);
  const parts = [];
  const lands = [];

  // One mainland, and sometimes a second on the opposite edge so the panel reads
  // as a strait rather than a single shore every time.
  const e1 = EDGES[Math.floor(rand() * 4)];
  lands.push(coast(rand, e1, 34, 62));
  const twin = rand() < 0.45;
  if (twin) {
    const opp = { top: "bottom", bottom: "top", left: "right", right: "left" }[e1];
    lands.push(coast(rand, opp, 26, 46));
  }

  // Islands in the water that is left.
  const isl = [];
  const count = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    isl.push(island(rand, 24 + rand() * (S - 48), 24 + rand() * (S - 48), 7 + rand() * 13));
  }

  // Soundings: the stippled depth figures scattered through a chart's water.
  let dots = "";
  for (let i = 0; i < 9; i++) {
    dots += `<circle cx='${r2(rand() * S)}' cy='${r2(rand() * S)}' r='.8' fill='%23CB6CE6' fill-opacity='.30'/>`;
  }

  // Relief. Engravers drew ranges, not lone hills -- a run of peaks along a
  // line, overlapping, following the lie of the land. One molehill in the
  // middle of a continent reads as a typo; five in a row read as mountains.
  let hills = "";
  for (const L of lands) {
    const ranges = 1 + Math.floor(rand() * 3);
    for (let g = 0; g < ranges; g++) {
      const n = 3 + Math.floor(rand() * 4);
      const x0 = 12 + rand() * (S - 60), y0 = 8 + rand() * 26;
      const dx = 7 + rand() * 5, drift = (rand() - 0.5) * 3.5;
      for (let i = 0; i < n; i++) {
        const sc = 0.42 + rand() * 0.34;
        hills += `<use href='%23m' transform='${L.turn ? L.turn + " " : ""}translate(${r2(x0 + i * dx)} ${r2(y0 + i * drift)}) scale(${r2(sc)})'/>`;
      }
    }
  }

  // Coastal shading first, then tone, then hatch and coastline -- the same order
  // the chain-of-command chart uses, for the same reason: without a tone under
  // it the hatching alone leaves land indistinguishable from water.
  for (const L of lands) parts.push(`<path d='${L.d}'${L.turn ? ` transform='${L.turn}'` : ""} fill='none' stroke='%23CB6CE6' stroke-opacity='.10' stroke-width='7'/>`);
  for (const d of isl) parts.push(`<path d='${d}' fill='none' stroke='%23CB6CE6' stroke-opacity='.10' stroke-width='6'/>`);
  for (const L of lands) parts.push(`<path d='${L.d}'${L.turn ? ` transform='${L.turn}'` : ""} fill='%23CB6CE6' fill-opacity='.13'/>`);
  for (const d of isl) parts.push(`<path d='${d}' fill='%23CB6CE6' fill-opacity='.13'/>`);
  for (const L of lands) parts.push(`<path d='${L.d}'${L.turn ? ` transform='${L.turn}'` : ""} fill='url(%23h)' stroke='%23CB6CE6' stroke-opacity='.62' stroke-width='1.1'/>`);
  for (const d of isl) parts.push(`<path d='${d}' fill='url(%23h)' stroke='%23CB6CE6' stroke-opacity='.62' stroke-width='1.1'/>`);

  // Somewhere in open water, given which edges the land came in on. Rough, but
  // it only has to keep a ship off a coastline, not survey it.
  const water = () => {
    const near = 80, far = twin ? S - 60 : S - 10;
    const a = near + rand() * (far - near);
    const b = 18 + rand() * (S - 36);
    return { top: [b, a], bottom: [b, S - a], left: [a, b], right: [S - a, b] }[e1];
  };

  // The furniture. Most regions get something; a few stay bare so the set does
  // not read as the same plate stamped out repeatedly.
  const arcs = rand() < 0.35 ? meridians(rand) : "";
  let under = "";      // rhumbs go beneath the land, as ruled lines do
  let furniture = "";
  // A rose on most panels, and where there is one, the rhumb lines that fan out
  // of it. Ruled first so land and ships sit on top.
  if (rand() < 0.6) {
    const [rx, ry] = water();
    under += rhumbs(rx, ry);
    furniture += rose(rx, ry, 13 + rand() * 7);
  }
  // A fleet rather than a lone vessel. The plates are busy with them, and two or
  // three small ships fill open water far better than one larger one.
  const ships = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < ships; i++) {
    const [sx, sy] = water();
    furniture += ship(sx, sy, 0.7 + rand() * 0.45, rand() < 0.5);
  }
  // And something in the deep water on about half of them.
  if (rand() < 0.5) {
    const [mx, my] = water();
    furniture += serpent(mx, my, 0.55 + rand() * 0.3, rand() < 0.5);
  }

  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${S}' height='${S}' viewBox='0 0 ${S} ${S}'>` +
    `<defs><pattern id='h' width='7' height='7' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>` +
    `<line x1='0' y1='0' x2='0' y2='7' stroke='%23CB6CE6' stroke-opacity='.50' stroke-width='.65'/></pattern>` +
    // Both of these are drawn many times per plate. Defining each once and
    // referencing it is what keeps a region near 6KB rather than 10.
    `<g id='m' fill='none' stroke='%23CB6CE6' stroke-opacity='.55' stroke-width='1.3'>` +
    `<path d='M-8 5 C -5 -1 -2 -5 0 -8 C 2 -5 5 -1 8 5 Z'/></g>` +
    `<g id='s' fill='none' stroke='%23CB6CE6' stroke-opacity='.58' stroke-width='.95'>` +
    `<path d='M-7 4 L7 4 L5 7.5 L-5 7.5 Z'/><path d='M0 4 L0 -8'/>` +
    `<path d='M0.6 -7 Q6 -3 0.6 -0.5 Z'/><path d='M-0.6 -4 Q-5 -1 -0.6 1.5 Z'/>` +
    `<path d='M-10 9.5 Q-5 11 0 9.5 Q5 8 10 9.5' stroke-opacity='.18'/></g></defs>` +
    `<g opacity='${ink}'>` + arcs + under + dots + parts.join("") + hills + furniture + `</g>` +
    `</svg>`;

  // Two consumers. As a standalone .svg file none of this needs encoding at all,
  // which is most of why the regions are served as files: the encoded form is
  // roughly half again as large, and twenty of them do not belong in a
  // stylesheet.
  //
  // The encoded form is kept for anything that does want a data URI. Commas and
  // quotes both MUST be encoded there: commas because path data is full of them
  // and an unquoted url() sits inside a background shorthand, where a comma is
  // the layer separator; quotes because the URI may be written into an HTML
  // style attribute, where a raw quote ends the attribute early. Between them
  // these two blanked two contact sheets in a row, each time with no error
  // anywhere -- an invalid background simply does not paint.
  const raw = svg.replace(/%23/g, "#");
  const encoded = svg.replace(/[<>"'{}|\^`,()s]/g, (c) =>
    c === " " ? "%20" : "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")
  );
  return { raw, encoded };
}

module.exports = { region };

// Rewrites public/map/region-*.svg. Seeded, so this reproduces exactly the
// twelve plates the console already references rather than reshuffling them --
// run it after changing anything above, and commit the result.
//
//   node scripts/generate-map-regions.js
// Rewrites every plate under public/map/. Seeded, so this reproduces exactly
// the files the site already references rather than reshuffling them -- run it
// after changing anything above, and commit the result.
//
//   node scripts/generate-map-regions.js
//
// Two sets, and they are NOT interchangeable:
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
  for (let i = 0; i < 9; i++) bytes += write("site-" + (i + 1) + ".svg", region(4000 + i * 6151, 0.26).raw);
  console.log("21 plates written to public/map (" + Math.round(bytes / 1024) + "KB)");
}
