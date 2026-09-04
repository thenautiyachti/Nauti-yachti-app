// Old-world chart treatment for the console.
//
// THE CONSTRAINT: a real portolan is cream parchment. This console is near
// black, and a cream card would wreck both the palette and the contrast the
// text depends on. So this borrows the DRAWING LANGUAGE of an old chart -- the
// graticule, rhumb lines, wind roses, hand-drawn coastlines, a neatline border,
// aged blotching -- and renders it in the console's own colours instead.
//
// Tiles get CSS gradients, not an SVG filter. A dozen cards each running
// feTurbulence is a real cost for a texture nobody should consciously notice;
// layered gradients are composited on the GPU and free by comparison. The one
// place a filter earns its keep is the chain-of-command chart, which is a
// single instance and the piece meant to look like a map.
const fs = require("fs");
const P = "components/AdminView.js";
let s = fs.readFileSync(P, "utf8");
const rep = (a, b, l, all) => {
  if (!s.includes(a)) { console.error("MISS: " + l); process.exit(1); }
  s = all ? s.split(a).join(b) : s.replace(a, b);
  console.log("ok  " + l);
};

// --- the shared texture, defined once
rep(`function crewAccent(shortName) {`,
`// Aged chart paper, in the console's palette rather than parchment cream.
// Three soft blooms give the uneven, foxed look of old stock; the two hairline
// repeats are the graticule a chart is ruled with. Every layer is under 6%
// opacity: this has to survive being read through, on twelve tiles at once.
const CHART_PAPER = [
  "radial-gradient(ellipse 120% 80% at 12% 8%, rgba(203,108,230,0.055), transparent 62%)",
  "radial-gradient(ellipse 95% 70% at 88% 22%, rgba(79,243,255,0.028), transparent 58%)",
  "radial-gradient(ellipse 110% 65% at 55% 100%, rgba(203,108,230,0.045), transparent 62%)",
  "repeating-linear-gradient(0deg, rgba(203,108,230,0.03) 0 1px, transparent 1px 34px)",
  "repeating-linear-gradient(90deg, rgba(203,108,230,0.03) 0 1px, transparent 1px 34px)",
].join(", ");

function crewAccent(shortName) {`,
"CHART_PAPER constant");

// --- apply to every card. backgroundImage sits after the background shorthand
//     so it is not reset by it.
rep(`  const CARD = { background: "var(--card)", borderRadius: 12, padding: 14, border: "1px solid rgba(203,108,230,0.16)" };`,
`  const CARD = {
    background: "var(--card)", backgroundImage: CHART_PAPER,
    borderRadius: 12, padding: 14, border: "1px solid rgba(203,108,230,0.16)",
  };`,
"CARD (crew cards and alerts) x2", true);

rep(`  const CARD = { background: "var(--card)", borderRadius: 10, padding: 14, minWidth: 0 };`,
`  const CARD = { background: "var(--card)", backgroundImage: CHART_PAPER, borderRadius: 10, padding: 14, minWidth: 0 };`,
"CARD (overview panels)", true);

// --- the chain of command: a proper chart, not just a grid
const OLD_BG_START = `          <defs>`;
const oldIdx = s.indexOf(OLD_BG_START);
if (oldIdx < 0) { console.error("MISS: chart defs"); process.exit(1); }
const endMark = `          </g>\n\n          {/* owner -> pearl */}`;
const endIdx = s.indexOf(endMark, oldIdx);
if (endIdx < 0) { console.error("MISS: chart background end"); process.exit(1); }
const OLD_BG = s.slice(oldIdx, endIdx + "          </g>".length);

const NEW_BG = `          <defs>
            {/* Foxing and fibre. This is the one place a turbulence filter is
                worth it -- a single instance, and it is the element that is
                supposed to look like a map. */}
            <filter id="cc-age" x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n" />
              <feColorMatrix in="n" type="saturate" values="0" result="g" />
              <feComponentTransfer in="g" result="soft">
                <feFuncA type="linear" slope="0.05" intercept="0" />
              </feComponentTransfer>
              <feComposite in="soft" in2="SourceGraphic" operator="in" />
            </filter>
            <pattern id="cc-grid" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M56 0V56M0 56H56" fill="none" stroke="var(--purple)" strokeWidth="0.5" opacity="0.16" />
            </pattern>
            {/* Minute marks along the graticule, as a real chart rules them. */}
            <pattern id="cc-ticks" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M14 55.5v-3M28 55.5v-4.5M42 55.5v-3M55.5 14h-3M55.5 28h-4.5M55.5 42h-3"
                    stroke="var(--purple)" strokeWidth="0.5" opacity="0.13" />
            </pattern>
          </defs>

          {/* Background. Everything here is under a quarter opacity: eight
              portraits and sixteen labels sit on top of it, and a chart you
              could comfortably read would compete with them. */}
          <g aria-hidden="true">
            <rect x="0" y="0" width={W} height={CHART_H} fill="url(#cc-grid)" />
            <rect x="0" y="0" width={W} height={CHART_H} fill="url(#cc-ticks)" />
            <rect x="0" y="0" width={W} height={CHART_H} fill="var(--purple)" filter="url(#cc-age)" opacity="0.5" />

            {/* Neatline: the double-ruled frame every printed chart carries. */}
            <g fill="none" stroke="var(--purple)" opacity="0.2">
              <rect x="7" y="7" width={W - 14} height={CHART_H - 14} strokeWidth="1" />
              <rect x="11.5" y="11.5" width={W - 23} height={CHART_H - 23} strokeWidth="0.4" />
            </g>

            {/* Rhumb lines. On a portolan these radiate from roses set around a
                hidden circle and cross the whole sheet -- the network is the
                single most recognisable thing about the form. */}
            <g stroke="var(--purple)" strokeWidth="0.4" opacity="0.09">
              {[[130, 355], [W - 120, 120], [W / 2, CHART_H - 40]].map(([ox, oy], i) => (
                <g key={i}>
                  {Array.from({ length: 16 }, (_, k) => {
                    const a = (k * Math.PI) / 8;
                    return (
                      <line key={k} x1={ox} y1={oy}
                        x2={ox + Math.cos(a) * 1200} y2={oy + Math.sin(a) * 1200} />
                    );
                  })}
                </g>
              ))}
            </g>

            {/* A coastline, hatched on the seaward side the way an engraver
                shades one. Drawn low so it runs under the bottom row. */}
            <g fill="none" stroke="var(--purple)" opacity="0.22">
              <path d="M-10 372 C 90 352, 150 392, 244 374 S 420 336, 520 366 S 700 402, 820 372 S 950 340, 1000 356"
                    strokeWidth="1.1" />
              <g strokeWidth="0.45" opacity="0.55">
                {Array.from({ length: 40 }, (_, i) => {
                  const x = 10 + i * 24.5;
                  return <line key={i} x1={x} y1={368} x2={x - 5} y2={378} />;
                })}
              </g>
            </g>

            {/* Soundings: the depth figures stippled across a chart's shallows. */}
            <g fill="var(--purple)" opacity="0.16" fontSize="7" fontFamily="ui-monospace, monospace">
              {[[190, 410, "7"], [300, 398, "12"], [430, 412, "9"], [560, 400, "15"],
                [690, 414, "11"], [810, 400, "8"], [900, 412, "14"]].map(([x, y, n]) => (
                <text key={x} x={x} y={y}>{n}</text>
              ))}
            </g>

            {/* The rose itself, in the corner the tree leaves empty. */}
            <g transform={\`translate(130, 355)\`} opacity="0.3">
              <circle r="44" fill="none" stroke="var(--purple)" strokeWidth="0.7" />
              <circle r="30" fill="none" stroke="var(--purple)" strokeWidth="0.5" />
              <circle r="4.5" fill="none" stroke="var(--purple)" strokeWidth="0.6" />
              {Array.from({ length: 16 }, (_, k) => {
                const deg = k * 22.5;
                const len = deg % 90 === 0 ? -44 : deg % 45 === 0 ? -32 : -24;
                return (
                  <line key={k} x1="0" y1="0" x2="0" y2={len}
                    stroke="var(--purple)" strokeWidth={deg % 90 === 0 ? 0.9 : 0.4}
                    transform={\`rotate(\${deg})\`} />
                );
              })}
              {/* Four filled cardinal points, the way a rose is drawn. */}
              {[0, 90, 180, 270].map((deg) => (
                <path key={deg} d="M0 -44 L4.5 -9 L0 0 L-4.5 -9 Z"
                  fill="var(--purple)" opacity={deg === 0 ? 0.55 : 0.28}
                  transform={\`rotate(\${deg})\`} />
              ))}
              <text x="0" y="-50" textAnchor="middle" fontSize="9" fill="var(--purple)" opacity="0.75">N</text>
            </g>
          </g>`;

s = s.replace(OLD_BG, NEW_BG);
console.log("ok  chain of command redrawn as a portolan");

fs.writeFileSync(P, s);
