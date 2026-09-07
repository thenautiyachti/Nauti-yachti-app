"use client";

// A radar you can drag from two hours ago into the next two hours.
//
// The dock page had a Windy iframe pinned to `calendar=now`, which plays back
// where rain HAS been. On the water on 6 Sep 2026 that could not answer the
// only question that mattered, and the owner sat out a squall in a borrowed
// covered slip working it out by eye. His framing afterwards: without some
// future insight "there's no suggested path".
//
// TWO SOURCES, ONE TIMELINE. The left half is real radar from RainViewer —
// observed frames, ten minutes apart, back about two hours. The right half is
// a forecast grid from Open-Meteo.
//
// It has to be two sources because RainViewer only generates its nowcast when
// there is precipitation to project: sampled twice on a clear evening, it
// returned zero future frames both times. A future layer that vanishes
// whenever the sky is clear cannot be planned against. Open-Meteo is always
// there, so the forecast half is coarse cells rather than a radar picture —
// honest about being a model, and present when it is needed.
//
// Deliberately no map library. Leaflet is ~140KB before its stylesheet, to do
// panning and layer management that one fixed view of one lake does not need.
// The projection maths lives in lib/tiles.js, where it is tested.
import { useState, useEffect, useRef, useCallback } from "react";
import { TILE, tilesFor, pointIn, isVisible, zoomToFit, project } from "../lib/tiles";
import { isHazard, HAZARD_COLOUR, HAZARD_EDGE, KIND_LABEL } from "../lib/waterPoints";

// THE LAKE IS DRAWN, NOT TILED.
//
// This used CARTO's dark basemap. Their tiles now answer with an "API KEY
// REQUIRED / Zoom Level Not Supported" watermark painted across the map — and
// they answer it with HTTP 200 and a valid PNG, so a check that verified the
// status and the file signature passed it as working. Only looking at the
// rendered page caught it.
//
// Rather than take a key and a per-view dependency on eighteen tile requests
// over boat signal, the one thing that actually matters is drawn directly: the
// shoreline, fetched once from OpenStreetMap and shipped with the app. 29KB,
// no third party at runtime, and it still works when the signal does not.
//
// OSM DATA is ODbL — free to use with attribution, which is a different thing
// from a tile rendering service's terms.
import LAKE_SHAPE from "../lib/lakeConroe.json";

const WET_MM = 0.2;

function fill(tpl, t) {
  return tpl.replace("{z}", t.z).replace("{x}", t.x).replace("{y}", t.y);
}

function clock(ms) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase().replace(" ", "");
}

// Rain intensity to colour. Roughly the ramp every radar uses, so it reads the
// way he expects: green light, yellow moderate, red heavy.
function rainColour(mm) {
  if (mm < WET_MM) return null;
  if (mm < 0.6) return "rgba(64,196,120,0.42)";
  if (mm < 1.5) return "rgba(226,214,74,0.48)";
  if (mm < 3.5) return "rgba(232,147,74,0.55)";
  return "rgba(226,80,80,0.62)";
}

export default function RadarMap({ here, dock, points = [], height = 340 }) {
  const [radar, setRadar] = useState(null);
  const [grid, setGrid] = useState(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [width, setWidth] = useState(340);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!boxRef.current) return;
    const measure = () => setWidth(boxRef.current ? boxRef.current.clientWidth : 340);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    const q = here ? `?lat=${here.lat.toFixed(5)}&lon=${here.lon.toFixed(5)}` : "";
    Promise.all([
      fetch("/api/admin/radar-frames").then((r) => r.json()).catch(() => ({ frames: [], error: "unreachable" })),
      fetch("/api/admin/forecast-grid" + q).then((r) => r.json()).catch(() => ({ steps: [], error: "unreachable" })),
    ]).then(([rf, fg]) => {
      if (!alive) return;
      setRadar(rf);
      setGrid(fg);
    });
    return () => { alive = false; };
  }, [here && here.lat, here && here.lon]);

  // ONE TIMELINE across both sources. Observed frames up to now, then forecast
  // steps after it — deduplicated so the step straddling "now" does not appear
  // twice, and sorted so dragging left always means earlier.
  const now = Date.now();
  const observed = ((radar && radar.frames) || [])
    .filter((f) => f.time <= now)
    .map((f) => ({ time: f.time, kind: "radar", url: f.url }));
  const nowcast = ((radar && radar.frames) || [])
    .filter((f) => f.time > now)
    .map((f) => ({ time: f.time, kind: "nowcast", url: f.url }));
  const forecast = ((grid && grid.steps) || [])
    .filter((s) => s.time > now)
    .map((s) => ({ time: s.time, kind: "forecast", values: s.values }));
  // RainViewer's nowcast is better than a model grid when it exists, so where
  // both cover the same minutes the radar wins.
  const lastNowcast = nowcast.length ? nowcast[nowcast.length - 1].time : 0;
  const timeline = [...observed, ...nowcast, ...forecast.filter((f) => f.time > lastNowcast)]
    .sort((a, b) => a.time - b.time);

  // Open on now, not on the oldest frame: the past is context, now is what you
  // are looking at, and the future is one drag to the right.
  const readyRef = useRef(false);
  useEffect(() => {
    if (readyRef.current || !timeline.length) return;
    readyRef.current = true;
    let i = timeline.findIndex((f) => f.time > Date.now());
    if (i === -1) i = timeline.length - 1;
    setIdx(Math.max(0, i - 1));
  }, [timeline.length]);

  useEffect(() => {
    if (!playing || timeline.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % timeline.length), 550);
    return () => clearInterval(id);
  }, [playing, timeline.length]);

  const step = useCallback((d) => {
    setPlaying(false);
    setIdx((i) => Math.max(0, Math.min(timeline.length - 1, i + d)));
  }, [timeline.length]);

  const centre = here || dock || (grid && grid.centre) || null;
  if (!centre) {
    return (
      <div style={{ fontSize: 13, color: "var(--muted, #9A8FB4)", lineHeight: 1.5 }}>
        No position and no dock set, so there is nothing to centre the radar on.
      </div>
    );
  }

  const z = here && dock ? zoomToFit(here, dock, width, height) : 10;
  const tiles = tilesFor(centre.lat, centre.lon, z, width, height);
  const boat = here ? pointIn(here.lat, here.lon, centre.lat, centre.lon, z, width, height) : null;
  const home = dock ? pointIn(dock.lat, dock.lon, centre.lat, centre.lon, z, width, height) : null;

  const frame = timeline[idx] || null;
  const ahead = frame ? Math.round((frame.time - now) / 60000) : 0;
  const isFuture = !!frame && frame.time > now;
  const futureMinutes = timeline.length ? Math.round((timeline[timeline.length - 1].time - now) / 60000) : 0;
  const historyMinutes = timeline.length ? Math.round((now - timeline[0].time) / 60000) : 0;

  // The shoreline, projected into this view. Rebuilt when the centre or zoom
  // changes, which on a phone that is not panning is rarely.
  const shore = LAKE_SHAPE.rings.map((ring) => ring.map(([lon, lat]) => {
    const pt = pointIn(lat, lon, centre.lat, centre.lon, z, width, height);
    return Math.round(pt.left) + "," + Math.round(pt.top);
  }).join(" "));

  // Marked hazards, sized from their radius in yards. A hazard with no radius
  // still draws, at a small fixed size, rather than vanishing — a mark he took
  // the trouble to make must not be invisible because a field was left blank.
  const YARDS_PER_DEGREE_LAT = 121740; // 1 degree of latitude, near enough
  const hazards = (points || [])
    .filter((p) => p && isHazard(p.kind) && p.lat != null && p.lon != null)
    .map((p) => {
      const at = pointIn(p.lat, p.lon, centre.lat, centre.lon, z, width, height);
      const degrees = (p.radiusYards || 120) / YARDS_PER_DEGREE_LAT;
      const edge = pointIn(p.lat + degrees, p.lon, centre.lat, centre.lon, z, width, height);
      return { ...p, left: at.left, top: at.top, r: Math.max(6, Math.abs(at.top - edge.top)) };
    })
    // Off-screen circles still lay out and drag the container about.
    .filter((h) => isVisible({ left: h.left, top: h.top }, width, height, h.r + 40));

  // Forecast cells, sized in pixels from their span in degrees.
  let cellBoxes = null;
  if (frame && frame.kind === "forecast" && grid && grid.cells) {
    const half = grid.cellSpan / 2;
    cellBoxes = grid.cells.map((c, i) => {
      const mm = frame.values[i];
      const colour = rainColour(mm);
      if (!colour) return null;
      const tl = pointIn(c.lat + half, c.lon - half, centre.lat, centre.lon, z, width, height);
      const br = pointIn(c.lat - half, c.lon + half, centre.lat, centre.lon, z, width, height);
      return { key: i, colour, mm, left: tl.left, top: tl.top, w: br.left - tl.left, h: br.top - tl.top };
    }).filter(Boolean);
  }

  return (
    <div>
      <div
        ref={boxRef}
        style={{
          position: "relative", width: "100%", height, overflow: "hidden",
          borderRadius: 8, background: "#0a1020",
          border: "1px solid " + (isFuture ? "rgba(232,147,74,0.55)" : "rgba(203,108,230,0.18)"),
        }}
      >
        {/* The water. One SVG path set, drawn from shipped coordinates. */}
        <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
          {shore.map((d, i) => (
            <polyline key={i} points={d} fill="none" stroke="rgba(110,170,220,0.55)" strokeWidth="1.5"
              strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </svg>

        {/* Observed or nowcast radar: real tiles. */}
        {frame && frame.url && tiles.map((t) => (
          <img key={"r" + t.key + frame.time} src={fill(frame.url, t)} alt="" draggable={false}
            style={{ position: "absolute", left: t.left, top: t.top, width: TILE, height: TILE, opacity: 0.75, pointerEvents: "none" }} />
        ))}

        {/* Forecast: coarse cells, deliberately soft-edged so nobody mistakes a
            model for a radar return. */}
        {cellBoxes && cellBoxes.map((c) => (
          <div key={"c" + c.key} title={c.mm.toFixed(1) + "mm"}
            style={{ position: "absolute", left: c.left, top: c.top, width: c.w, height: c.h,
              background: c.colour, filter: "blur(6px)", pointerEvents: "none" }} />
        ))}

        {/* HAZARDS, over the weather and under the boat.
            His own marks, because the published hazard map for this lake is
            somebody else's copyrighted drawing from 2009 and the surveyed stump
            positions the Lake Conroe Association took in 2011 are not published
            anywhere reachable. A circle is crude on purpose: it is dropped from
            the helm or from memory, and a circle whose size he can judge beats
            a polygon that implies a survey nobody did. */}
        {hazards.map((h) => (
          <div key={"h" + h.id}
            title={KIND_LABEL[h.kind] + ": " + h.name + (h.radiusYards ? ` (~${h.radiusYards} yd)` : "")}
            style={{
              position: "absolute", left: h.left - h.r, top: h.top - h.r,
              width: h.r * 2, height: h.r * 2, borderRadius: "50%",
              background: HAZARD_COLOUR[h.kind] || "rgba(226,104,95,0.28)",
              border: "1px dashed " + (HAZARD_EDGE[h.kind] || "rgba(226,104,95,0.8)"),
              pointerEvents: "none",
            }} />
        ))}

        {home && isVisible(home, width, height, 20) && (
          <div style={{ position: "absolute", left: home.left - 7, top: home.top - 7, width: 14, height: 14,
            borderRadius: 3, background: "#4FBF8B", border: "2px solid #06210f", pointerEvents: "none" }} title="Dock" />
        )}
        {boat && isVisible(boat, width, height, 20) && (
          <div style={{ position: "absolute", left: boat.left - 8, top: boat.top - 8, width: 16, height: 16,
            borderRadius: "50%", background: "#4FF3FF", border: "3px solid #04222a",
            boxShadow: "0 0 0 4px rgba(79,243,255,0.25)", pointerEvents: "none" }} title="You" />
        )}

        <div style={{
          position: "absolute", left: 8, top: 8, padding: "4px 9px", borderRadius: 6,
          background: isFuture ? "rgba(232,147,74,0.92)" : "rgba(10,6,18,0.78)",
          color: isFuture ? "#1a0d00" : "var(--text, #ECE7F5)",
          fontSize: 12.5, fontWeight: 700, pointerEvents: "none",
        }}>
          {!frame ? "no frames"
            : isFuture ? `+${ahead} min · ${clock(frame.time)}`
            : ahead === 0 ? "now" : `${ahead} min · ${clock(frame.time)}`}
        </div>

        {frame && (
          <div style={{
            position: "absolute", right: 8, top: 8, padding: "3px 7px", borderRadius: 5,
            background: "rgba(10,6,18,0.7)", color: "var(--muted, #9A8FB4)",
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, pointerEvents: "none",
          }}>
            {frame.kind === "forecast" ? "FORECAST" : frame.kind === "nowcast" ? "NOWCAST" : "RADAR"}
          </div>
        )}

        <div style={{
          position: "absolute", right: 6, bottom: 4, fontSize: 9.5,
          color: "rgba(236,231,245,0.5)", pointerEvents: "none",
        }}>
          RainViewer · Open-Meteo · © OpenStreetMap
        </div>
      </div>

      {timeline.length > 1 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={() => setPlaying((p) => !p)}
              style={{ flex: "0 0 auto", padding: "9px 13px", borderRadius: 8, fontSize: 15, fontWeight: 700,
                border: "1px solid var(--purple, #CB6CE6)", background: playing ? "var(--purple, #CB6CE6)" : "transparent",
                color: playing ? "#0A0612" : "var(--text, #ECE7F5)" }}>
              {playing ? "❚❚" : "▶"}
            </button>
            <input
              type="range" min={0} max={timeline.length - 1} value={idx}
              onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
              style={{ flex: 1, minWidth: 0, accentColor: isFuture ? "#E8934A" : "var(--purple, #CB6CE6)" }}
            />
            <button type="button" onClick={() => step(1)}
              style={{ flex: "0 0 auto", padding: "9px 11px", borderRadius: 8, fontSize: 14,
                border: "1px solid rgba(203,108,230,0.35)", background: "transparent", color: "var(--text, #ECE7F5)" }}>
              ›
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted, #9A8FB4)", marginTop: 4 }}>
            <span>−{historyMinutes} min</span>
            <span style={{ color: "#E8934A" }}>+{futureMinutes} min ahead</span>
          </div>
        </>
      )}

      {hazards.length > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--muted, #9A8FB4)", marginTop: 6 }}>
          Dashed circles are hazards you marked &mdash; {hazards.map((h) => h.name).join(", ")}.
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "var(--muted, #9A8FB4)", marginTop: 8, lineHeight: 1.5 }}>
        Left of now is real radar. Right of now is a forecast — coarse cells, because it is a
        model rather than a picture of rain that exists.
        {grid && grid.anyWet === false && (
          <span style={{ color: "#4FBF8B" }}> Nothing wet anywhere on the lake for the next two and a half hours.</span>
        )}
      </div>

      {radar && radar.error && (
        <div style={{ fontSize: 12, color: "#E2685F", marginTop: 6 }}>
          Could not reach the radar service — the forecast half still works.
        </div>
      )}
      {!radar && !grid && (
        <div style={{ fontSize: 12.5, color: "var(--muted, #9A8FB4)", marginTop: 8 }}>Loading radar…</div>
      )}
    </div>
  );
}
