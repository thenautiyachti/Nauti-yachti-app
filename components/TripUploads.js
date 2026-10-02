"use client";

import { useEffect, useState } from "react";

// The photo box on a trip page, and what the party has already sent.
//
// Same transfer as components/UploadForm.js: one file at a time, straight to
// the private bucket against a signed URL, with a progress bar, then a confirm
// the server checks against storage. The difference is that there is no trip
// to choose and no phone number to give -- the link already says which booking
// this is.

const CARD = {
  background: "var(--ink)", borderRadius: 14, padding: "18px 20px",
  border: "1px solid rgba(203,108,230,0.18)", margin: "0 0 16px",
};
const FIELD = {
  width: "100%", boxSizing: "border-box", padding: "11px 13px", fontSize: 16,
  borderRadius: 10, border: "1px solid rgba(203,108,230,0.35)", background: "var(--ink-soft)", color: "var(--text)",
};

function prettySize(n) {
  if (!(n > 0)) return "";
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + " GB";
  if (n >= 1048576) return Math.round(n / 1048576) + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
}

export default function TripUploads({ tripRef, tripKey, canUpload, demo, defaultName, consentText }) {
  const [sent, setSent] = useState([]);
  const [name, setName] = useState(defaultName || "");
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const qs = "ref=" + encodeURIComponent(tripRef || "") + "&k=" + encodeURIComponent(tripKey || "");

  async function load() {
    if (demo) return;
    const r = await fetch("/api/trip/uploads?" + qs).then((x) => x.json()).catch(() => null);
    if (r && Array.isArray(r.uploads)) setSent(r.uploads);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendOne(file, idx) {
    const mark = (patch) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    mark({ state: "starting" });
    const signRes = await fetch("/api/trip/uploads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sign", ref: tripRef, k: tripKey, name, consent, file: { name: file.name, size: file.size, type: file.type } }),
    });
    const signed = await signRes.json().catch(() => ({}));
    if (!signRes.ok) { mark({ state: "failed", message: signed.error || "Could not start" }); return false; }

    mark({ state: "sending", pct: 0 });
    const ok = await new Promise((resolve) => {
      // XHR for the progress bar; see UploadForm.js.
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", signed.uploadUrl, true);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) mark({ pct: Math.round((e.loaded / e.total) * 100) }); };
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
    if (!ok) { mark({ state: "failed", message: "Upload interrupted" }); return false; }

    mark({ state: "checking", pct: 100 });
    const conf = await fetch("/api/trip/uploads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", ref: tripRef, k: tripKey, id: signed.id }),
    }).then((r) => r.json()).catch(() => ({}));
    if (conf && conf.ok) { mark({ state: "done" }); return true; }
    mark({ state: "failed", message: "We could not see it land" });
    return false;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setNote("");
    if (demo) { setNote("Demo page: nothing was uploaded."); return; }
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, size: f.size, state: "waiting", pct: 0 })));
    let good = 0;
    // One at a time on purpose: six parallel videos over phone data finishes none.
    for (let i = 0; i < files.length; i++) if (await sendOne(files[i], i)) good++;
    setBusy(false);
    if (good) {
      setNote(good === files.length ? "Got them, thank you!" : "Got " + good + " of " + files.length + ". Try the others again.");
      setFiles([]);
      load();
    } else {
      setNote("Nothing went through. Check your signal and try again, or text them to us.");
    }
  }

  return (
    <section style={CARD}>
      <h2 style={{ fontSize: 17, color: "var(--text)", margin: "0 0 8px", fontWeight: 700 }}>Your photos and video</h2>

      {!canUpload && (
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          The photo box opens on the day of your trip. Afterwards, send us your best shots here and
          everyone in your group with this link can add theirs.
        </p>
      )}

      {canUpload && (
        <form onSubmit={onSubmit}>
          <p style={{ color: "var(--text)", opacity: 0.85, fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" }}>
            Anyone with this link can add photos and video. Full quality is fine: big videos are welcome.
          </p>
          <label htmlFor="tu-name" style={{ display: "block", fontSize: 13, color: "var(--muted)", margin: "0 0 6px" }}>Your name</label>
          <input id="tu-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} style={{ ...FIELD, marginBottom: 12 }} />
          <input type="file" multiple accept="image/*,video/*" onChange={(e) => setFiles(Array.from(e.target.files || []))}
            style={{ color: "var(--text)", fontSize: 14, marginBottom: 6, maxWidth: "100%" }} />
          {files.length > 0 && (
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 8px" }}>
              {files.length} selected · {prettySize(files.reduce((n, f) => n + f.size, 0))}
            </p>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "10px 0 12px" }}>
            <input id="tu-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required
              style={{ marginTop: 3, width: 18, height: 18, flex: "0 0 auto" }} />
            <label htmlFor="tu-consent" style={{ fontSize: 13, lineHeight: 1.55, color: "var(--muted)" }}>{consentText}</label>
          </div>
          {rows.length > 0 && (
            <div style={{ margin: "0 0 12px" }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "4px 0", color: "var(--text)" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ flex: "0 0 auto", color: r.state === "failed" ? "var(--pink)" : "var(--muted)" }}>
                    {r.state === "sending" ? r.pct + "%" : r.state === "failed" ? r.message : r.state === "done" ? "sent" : r.state}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button type="submit" disabled={busy || !files.length || !consent || !name.trim()} style={{
            width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612",
            border: "none", borderRadius: 8, padding: "13px", fontWeight: 700, fontSize: 15.5,
            opacity: busy || !files.length || !consent || !name.trim() ? 0.55 : 1,
          }}>
            {busy ? "Sending…" : files.length > 1 ? "Send " + files.length + " files" : "Send"}
          </button>
          {note && <p role="status" style={{ color: "var(--text)", fontSize: 14, margin: "10px 0 0" }}>{note}</p>}
        </form>
      )}

      {sent.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 8px" }}>Sent in so far ({sent.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
            {sent.map((u) => (
              <a key={u.id} href={u.url || undefined} target="_blank" rel="noopener noreferrer" title={u.fileName + (u.by ? " · from " + u.by : "")}
                style={{ display: "block", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden", background: "var(--ink-soft)", border: "1px solid rgba(203,108,230,0.18)" }}>
                {u.kind === "image" && u.url
                  ? <img src={u.url} alt={"Photo from " + (u.by || "your group")} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--muted)", padding: 6, textAlign: "center" }}>
                      {u.kind === "video" ? "▶ video" : "photo"}
                    </span>}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
