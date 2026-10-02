"use client";

import { useCallback, useEffect, useState } from "react";

// Marketing -> Photo Requests: what guests have sent US.
//
// Both doors land here -- the public share page and guests' trip pages -- with
// who sent it, which charter, and when they agreed to its use. Each picture is
// shown through a link that works for an hour; the bucket itself stays private.
//
// NOTHING HERE POSTS. scripts/pull-guest-uploads.js, run on the office PC,
// brings these into Photos\00 Inbox, and from there they go through media
// drafts and his approval like any other footage. "Throw out" stops one being
// pulled at all.

function prettySize(n) {
  if (!(n > 0)) return "";
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + " GB";
  if (n >= 1048576) return Math.round(n / 1048576) + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
}

function day(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function GuestUploadsPanel() {
  const [data, setData] = useState(null);
  const [showRejected, setShowRejected] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    fetch("/api/admin/guest-uploads" + (showRejected ? "?rejected=1" : ""))
      .then((r) => r.json())
      .then((d) => setData(d && Array.isArray(d.uploads) ? d : { uploads: [], summary: {} }))
      .catch(() => setData({ uploads: [], summary: {}, error: "Could not load guest uploads." }));
  }, [showRejected]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(u, status) {
    if (status === "rejected" && !window.confirm("Throw out " + (u.fileName || "this file") + "? It will not be pulled to the PC. The record stays, and you can put it back.")) return;
    setBusy(u.id);
    await fetch("/api/admin/guest-uploads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, status }),
    }).catch(() => {});
    setBusy(null);
    load();
  }

  if (!data) return <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 26 }}>Loading guest uploads…</div>;
  const uploads = data.uploads || [];

  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
        Photos guests sent us{data.summary && data.summary.fresh ? " (" + data.summary.fresh + " not yet pulled to the PC)" : ""}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, maxWidth: 640, marginBottom: 12 }}>
        From the share-your-photos page and from guests&rsquo; trip pages. Every one came with a ticked consent to
        use it in posts and advertising. The pull script on the office PC brings them into Photos\00 Inbox; nothing here is posted.
        {data.configured === false && <span style={{ color: "#ff4d5e" }}> Storage is not configured on this deployment.</span>}
        {data.error && <span style={{ color: "#ff4d5e" }}> {data.error}</span>}
        {" "}
        <button type="button" onClick={() => setShowRejected((v) => !v)} style={{
          background: "none", border: "none", padding: 0, color: "var(--purple)", fontSize: 12, textDecoration: "underline", cursor: "pointer",
        }}>
          {showRejected ? "hide thrown out" : "show thrown out"}
        </button>
      </div>

      {!uploads.length && <div style={{ fontSize: 13, color: "var(--muted)" }}>Nothing sent in yet.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
        {uploads.map((u) => (
          <div key={u.id} style={{
            border: "1px solid rgba(203,108,230,0.22)", borderRadius: 8, overflow: "hidden",
            background: "rgba(0,0,0,0.18)", opacity: u.status === "rejected" ? 0.5 : 1,
          }}>
            <a href={u.url || undefined} target="_blank" rel="noopener noreferrer"
              style={{ display: "block", aspectRatio: "4 / 3", background: "rgba(0,0,0,0.35)" }}>
              {u.kind === "image" && u.url ? (
                <img src={u.url} alt={"From " + (u.by || "a guest")} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : u.kind === "video" && u.url ? (
                <video src={u.url} preload="metadata" muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--muted)" }}>
                  {u.url ? "open file" : u.onPcOnly ? "on the PC, in 00 Inbox" : "no preview"}
                </span>
              )}
            </a>
            <div style={{ padding: "7px 9px", fontSize: 11.5, lineHeight: 1.45, color: "var(--muted)" }}>
              <div style={{ color: "var(--text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.by || "Guest"}{u.source === "trip" ? " · trip page" : ""}
              </div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.eventLabel}>
                {u.bookingId || u.eventLabel}
              </div>
              <div>
                {day(u.createdAt)} · {prettySize(u.sizeBytes)}
                {u.status === "pulled" ? " · on the PC" : u.status === "rejected" ? " · thrown out" : " · new"}
              </div>
              <div title={u.consentText || "Consent ticked on the share page"}>consent {day(u.consentAt)}</div>
              <button type="button" disabled={busy === u.id}
                onClick={() => setStatus(u, u.status === "rejected" ? "uploaded" : "rejected")}
                style={{ marginTop: 4, background: "none", border: "none", padding: 0, color: "var(--purple)", fontSize: 11, textDecoration: "underline", cursor: "pointer" }}>
                {busy === u.id ? "…" : u.status === "rejected" ? "put it back" : "throw out"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
