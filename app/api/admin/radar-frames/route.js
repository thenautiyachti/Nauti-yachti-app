const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// Radar frames: where the rain has been, and where it is going.
//
// The homepage keeps its Windy embed, which is fine for a guest deciding
// whether to come. This is for the owner on the water, where the question is
// not "is it raining" but "is that thing going to reach me before I reach the
// dock", and Windy pinned to calendar=now cannot answer it.
//
// RainViewer publishes both halves free and without a key: roughly two hours of
// observed frames at ten-minute steps, and a nowcast run ahead of now. The
// nowcast is the whole point — the owner's words were that without some future
// insight "there's no suggested path".
//
// PROXIED, not fetched from the browser. The page then talks only to our own
// origin for data, which keeps `connect-src 'self'` in the CSP honest. The
// image tiles themselves are unavoidably third-party and are declared in
// next.config.js under img-src.
const INDEX = "https://api.rainviewer.com/public/weather-maps.json";

async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Short cache: frames advance every ten minutes, and hammering a free
    // service from a page that auto-refreshes would be rude and pointless.
    const res = await fetch(INDEX, { next: { revalidate: 120 } });
    if (!res.ok) throw new Error("radar index " + res.status);
    const d = await res.json();

    const host = d.host || "https://tilecache.rainviewer.com";
    const shape = (f, kind) => ({
      time: f.time * 1000,
      // The full tile template. 256px tiles, colour scheme 2 (the universal
      // blue-to-red ramp), smoothed, with snow shown separately.
      url: `${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
      kind,
    });

    const past = ((d.radar && d.radar.past) || []).map((f) => shape(f, "past"));
    const nowcast = ((d.radar && d.radar.nowcast) || []).map((f) => shape(f, "future"));

    // One ordered timeline, so the page scrubs through it without having to
    // know which half a frame came from.
    const frames = [...past, ...nowcast].sort((a, b) => a.time - b.time);

    return NextResponse.json({
      frames,
      // Stated separately so the page can be honest when the future half is
      // missing rather than quietly showing only history. RainViewer's nowcast
      // is genuinely absent sometimes — it returned zero frames when this was
      // built — and a radar that silently stops at "now" while claiming to
      // show what is coming is exactly the failure being fixed.
      pastCount: past.length,
      futureCount: nowcast.length,
      futureMinutes: nowcast.length
        ? Math.round((nowcast[nowcast.length - 1].time - Date.now()) / 60000)
        : 0,
      historyMinutes: past.length
        ? Math.round((Date.now() - past[0].time) / 60000)
        : 0,
      generated: (d.generated || 0) * 1000,
      fetchedAt: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({
      frames: [], pastCount: 0, futureCount: 0, futureMinutes: 0, historyMinutes: 0,
      error: String(err && err.message ? err.message : err),
    }, { status: 200 });
  }
}

module.exports = { GET };
