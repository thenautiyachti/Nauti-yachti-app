"use client";

import { useCallback, useEffect, useState } from "react";

// Marketing -> Photo Requests: our photos of guests' trips, waiting on his yes.
//
// Coral proposes the best stills from each completed charter; he approves them
// here, and only then do they appear on that booking's trip page. Owner,
// 2 Oct 2026: "Coral picks, I approve." Every proposal starts ticked, because the
// usual answer is yes and he should only have to untick the odd one out.

function sizeLabel(n) {
  if (!(n > 0)) return "";
  return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
}

export default function TripPhotosPanel({ onWaiting }) {
  const [data, setData] = useState(null);
  const [unticked, setUnticked] = useState({});
  const [busy, setBusy] = useState(null);
  const [openApproved, setOpenApproved] = useState({});

  const load = useCallback(() => {
    fetch("/api/admin/trip-photos")
      .then((r) => r.json())
      .then((d) => {
        setData(d && Array.isArray(d.charters) ? d : { charters: [], summary: {} });
        if (onWaiting && d && d.summary) onWaiting(d.summary.waiting || 0);
      })
      .catch(() => setData({ charters: [], summary: {}, error: "Could not load photos for guests." }));
  }, [onWaiting]);
  useEffect(() => { load(); }, [load]);

  async function decide(ids, status, key) {
    if (!ids.length) return;
    setBusy(key);
    await fetch("/api/admin/trip-photos", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    }).catch(() => {});
    setBusy(null);
    setUnticked({});
    load();
  }

  if (!data) return <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 26 }}>Loading photos for guests…</div>;
  const charters = data.charters || [];

  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
        Photos for guests{data.summary && data.summary.waiting ? " (" + data.summary.waiting + " waiting on you)" : ""}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, maxWidth: 640, marginBottom: 12 }}>
        Coral picks the best stills from each completed charter. Anything you approve appears on that
        booking&rsquo;s trip page for the guests to view and download; nothing appears until you do.
        {data.error && <span style={{ color: "#ff4d5e" }}> {data.error}</span>}
      </div>

      {!charters.length && <div style={{ fontSize: 13, color: "var(--muted)" }}>Nothing proposed yet.</div>}

      <div style={{ display: "grid", gap: 16 }}>
        {charters.map((c) => {
          const key = c.charterDate + "|" + c.folder;
          const proposed = c.photos.filter((p) => p.status === "proposed");
          const approved = c.photos.filter((p) => p.status === "approved");
          const ticked = proposed.filter((p) => !unticked[p.id]).map((p) => p.id);
          return (
            <div key={key} style={{ border: "1px solid rgba(203,108,230,0.22)", borderRadius: 8, padding: "11px 13px", background: "rgba(0,0,0,0.18)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>{c.folder}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>
                Visible to: {c.visibleTo.map((b) => (b.name || "guest") + " (" + b.ref + ")").join(", ")}
              </div>
              {c.warning && (
                <div style={{ marginBottom: 8, padding: "6px 9px", borderRadius: 5, fontSize: 11.5, background: "rgba(232,147,74,0.12)", border: "1px solid rgba(232,147,74,0.45)", color: "#E8934A" }}>
                  {c.warning}
                </div>
              )}

              {proposed.length > 0 && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, marginBottom: 8 }}>
                    {proposed.map((p) => {
                      const on = !unticked[p.id];
                      return (
                        <label key={p.id} style={{ display: "block", cursor: "pointer", opacity: on ? 1 : 0.45 }} title={p.fileName}>
                          <div style={{ aspectRatio: "4 / 3", borderRadius: 6, overflow: "hidden", background: "rgba(0,0,0,0.35)", outline: on ? "2px solid var(--purple)" : "none" }}>
                            {p.url
                              ? <img src={p.url} alt={p.fileName} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <span style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--muted)" }}>no preview</span>}
                          </div>
                          <span style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                            <input type="checkbox" checked={on} onChange={() => setUnticked((u) => ({ ...u, [p.id]: on }))} />
                            {sizeLabel(p.bytes)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="console-btn" disabled={busy === key || !ticked.length}
                      onClick={() => decide(ticked, "approved", key)}>
                      {busy === key ? "…" : "Approve " + ticked.length + " for the guests"}
                    </button>
                    <button type="button" className="console-btn" disabled={busy === key || ticked.length === proposed.length}
                      onClick={() => decide(proposed.filter((p) => unticked[p.id]).map((p) => p.id), "rejected", key)}
                      title="Rejects the ones you unticked">
                      Reject unticked
                    </button>
                  </div>
                </>
              )}

              {approved.length > 0 && (
                <div style={{ marginTop: proposed.length ? 10 : 0, fontSize: 12, color: "var(--muted)" }}>
                  <button type="button" onClick={() => setOpenApproved((o) => ({ ...o, [key]: !o[key] }))}
                    style={{ background: "none", border: "none", padding: 0, color: "#7FE0B8", fontSize: 12, cursor: "pointer" }}>
                    {approved.length} on the trip page {openApproved[key] ? "▾" : "▸"}
                  </button>
                  {openApproved[key] && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6, marginTop: 6 }}>
                      {approved.map((p) => (
                        <div key={p.id}>
                          <div style={{ aspectRatio: "4 / 3", borderRadius: 5, overflow: "hidden", background: "rgba(0,0,0,0.35)" }}>
                            {p.url && <img src={p.url} alt={p.fileName} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                          </div>
                          <button type="button" disabled={busy === p.id} onClick={() => decide([p.id], "proposed", p.id)}
                            title="Takes it off the trip page and back into the waiting list"
                            style={{ background: "none", border: "none", padding: 0, color: "var(--purple)", fontSize: 11, textDecoration: "underline", cursor: "pointer" }}>
                            take it down
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
