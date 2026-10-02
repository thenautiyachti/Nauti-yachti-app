"use client";

import { useCallback, useEffect, useState } from "react";

// Marketing -> Photo Requests: our photos on guests' trip pages.
//
// A photo goes up when Coral puts it in a charter's Completed folder -- owner,
// 2 Oct 2026: "Folder is enough." This panel is where he sees what went up, and
// takes down anything he would rather a guest did not have. Taking one down is
// permanent as far as the sync is concerned: it never puts that file back.

export default function TripPhotosPanel() {
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState({});

  const load = useCallback(() => {
    fetch("/api/admin/trip-photos")
      .then((r) => r.json())
      .then((d) => setData(d && Array.isArray(d.charters) ? d : { charters: [], summary: {} }))
      .catch(() => setData({ charters: [], summary: {}, error: "Could not load the guests' photos." }));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function takeDown(ids, key) {
    if (!ids.length) return;
    if (!window.confirm("Take " + ids.length + " photo" + (ids.length > 1 ? "s" : "") + " off the guests' trip page? They will not go back up on their own.")) return;
    setBusy(key);
    await fetch("/api/admin/trip-photos", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status: "rejected" }),
    }).catch(() => {});
    setBusy(null);
    setPicked({});
    load();
  }

  if (!data) return <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 26 }}>Loading the guests&rsquo; photos…</div>;
  const charters = data.charters || [];

  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
        On guests&rsquo; trip pages{data.summary && data.summary.live ? " (" + data.summary.live + " photos)" : ""}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, maxWidth: 640, marginBottom: 12 }}>
        Photos Coral put in each charter&rsquo;s Completed folder go up on that booking&rsquo;s trip page, for the
        guests to view and download. Tick any you would rather they did not have and take them down.
        {data.error && <span style={{ color: "#ff4d5e" }}> {data.error}</span>}
      </div>

      {!charters.length && <div style={{ fontSize: 13, color: "var(--muted)" }}>No photos on any trip page yet.</div>}

      <div style={{ display: "grid", gap: 12 }}>
        {charters.map((c) => {
          const key = c.charterDate + "|" + c.folder;
          const ids = c.photos.filter((p) => picked[p.id]).map((p) => p.id);
          return (
            <div key={key} style={{ border: "1px solid rgba(203,108,230,0.22)", borderRadius: 8, padding: "11px 13px", background: "rgba(0,0,0,0.18)" }}>
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{c.folder}</span>
                <span style={{ fontSize: 12, color: "#7FE0B8" }}> · {c.photos.length} up {open[key] ? "▾" : "▸"}</span>
              </button>
              <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "3px 0 0" }}>
                Visible to: {c.visibleTo.map((b) => (b.name || "guest") + " (" + b.ref + ")").join(", ")}
              </div>
              {c.warning && (
                <div style={{ marginTop: 6, padding: "6px 9px", borderRadius: 5, fontSize: 11.5, background: "rgba(232,147,74,0.12)", border: "1px solid rgba(232,147,74,0.45)", color: "#E8934A" }}>
                  {c.warning}
                </div>
              )}
              {open[key] && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, margin: "10px 0 8px" }}>
                    {c.photos.map((p) => (
                      <label key={p.id} style={{ display: "block", cursor: "pointer" }} title={p.fileName}>
                        <div style={{ aspectRatio: "4 / 3", borderRadius: 6, overflow: "hidden", background: "rgba(0,0,0,0.35)", outline: picked[p.id] ? "2px solid #ff4d5e" : "none" }}>
                          {p.url && <img src={p.url} alt={p.fileName} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                        </div>
                        <span style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                          <input type="checkbox" checked={!!picked[p.id]} onChange={() => setPicked((x) => ({ ...x, [p.id]: !x[p.id] }))} />
                          take down
                        </span>
                      </label>
                    ))}
                  </div>
                  <button type="button" className="console-btn" disabled={busy === key || !ids.length} onClick={() => takeDown(ids, key)}>
                    {busy === key ? "…" : ids.length ? "Take down " + ids.length : "Tick photos to take down"}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
