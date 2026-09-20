"use client";

import { useEffect, useState } from "react";

// The guest-facing upload.
//
// EACH FILE IS ITS OWN JOURNEY: sign, upload straight to storage, confirm. One
// failing does not take the others with it, because a guest who sent eleven
// clips and lost all of them to the twelfth will not try again.
//
// The bytes never pass through our server. The browser PUTs to a signed URL
// that lasts an hour, which is the only way a 2GB phone video gets here at all.

const FIELD = {
  width: "100%", padding: "11px 13px", borderRadius: 8,
  border: "1px solid var(--ink-soft)", background: "var(--card)",
  color: "var(--text)", fontSize: 16, fontFamily: "inherit",
};
const LABEL = { display: "block", fontSize: 13.5, fontWeight: 600, margin: "0 0 6px" };
const ROW = { marginBottom: 18 };

function prettySize(n) {
  if (!(n > 0)) return "";
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + " GB";
  if (n >= 1048576) return Math.round(n / 1048576) + " MB";
  return Math.max(1, Math.round(n / 1024)) + " KB";
}

export default function UploadForm() {
  const [config, setConfig] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [eventKey, setEventKey] = useState("");
  const [otherLabel, setOtherLabel] = useState("");
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/guest-uploads")
      .then((r) => r.json())
      .then((d) => { if (live) setConfig(d); })
      .catch(() => { if (live) setConfig({ events: [], maxLabel: "2 GB", configured: false }); });
    return () => { live = false; };
  }, []);

  const maxLabel = (config && config.maxLabel) || "2 GB";
  const events = (config && config.events) || [];
  const isOther = eventKey === "other";
  const label = isOther
    ? otherLabel.trim()
    : (events.find((e) => e.key === eventKey) || {}).label || "";

  const ready = name.trim() && phone.replace(/\D/g, "").length >= 10
    && eventKey && label && consent && files.length > 0 && !busy;

  async function sendOne(file, idx) {
    const mark = (patch) =>
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

    mark({ state: "signing" });
    const signRes = await fetch("/api/guest-uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sign", name, phone, email, consent,
        eventKey: isOther ? "other" : eventKey,
        eventLabel: label,
        file: { name: file.name, size: file.size, type: file.type },
      }),
    });
    const signed = await signRes.json().catch(() => ({}));
    if (!signRes.ok) { mark({ state: "failed", message: signed.error || "Could not start" }); return false; }

    mark({ state: "sending", pct: 0 });
    const ok = await new Promise((resolve) => {
      // XHR, not fetch: it is still the only way to show a guest a progress bar,
      // and on a 2GB video over phone data a bar is the difference between
      // waiting and giving up.
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", signed.uploadUrl, true);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) mark({ pct: Math.round((e.loaded / e.total) * 100) });
      };
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
    if (!ok) { mark({ state: "failed", message: "Upload interrupted" }); return false; }

    mark({ state: "checking", pct: 100 });
    const conf = await fetch("/api/guest-uploads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", id: signed.id }),
    }).then((r) => r.json()).catch(() => ({}));

    if (conf && conf.ok) { mark({ state: "done" }); return true; }
    mark({ state: "failed", message: "We could not see it land" });
    return false;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, size: f.size, state: "waiting", pct: 0 })));
    let good = 0;
    for (let i = 0; i < files.length; i++) {
      // Deliberately one at a time. Six parallel 200MB uploads on a phone at a
      // boat ramp finishes none of them.
      if (await sendOne(files[i], i)) good++;
    }
    setBusy(false);
    if (good > 0) setDone(true);
    else setError("Nothing went through. Check your signal and try again, or just text them to us.");
  }

  if (config && config.configured === false) {
    return (
      <div style={{ ...FIELD, padding: 20, lineHeight: 1.6 }}>
        <strong>Uploads are not switched on yet.</strong>
        <div style={{ color: "var(--muted)", marginTop: 6 }}>
          Text your photos and video to <a href="tel:+18329482912">(832) 948-2912</a> and
          we will get them that way.
        </div>
      </div>
    );
  }

  if (done) {
    const sent = rows.filter((r) => r.state === "done");
    const failed = rows.filter((r) => r.state === "failed");
    return (
      <div style={{ ...FIELD, padding: 22, lineHeight: 1.6 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 21 }}>Got them — thank you.</h2>
        <p style={{ margin: "0 0 10px", color: "var(--muted)" }}>
          {sent.length} {sent.length === 1 ? "file" : "files"} arrived
          {label ? <> from <strong style={{ color: "var(--text)" }}>{label}</strong></> : null}.
          Somebody will go through them. If we use one, we will let you know.
        </p>
        {failed.length > 0 && (
          <p style={{ margin: 0, color: "var(--pink)" }}>
            {failed.length} did not make it. Worth another go on wifi.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div style={ROW}>
        <label style={LABEL} htmlFor="gu-event">Which trip was it?</label>
        <select id="gu-event" style={FIELD} value={eventKey}
          onChange={(e) => setEventKey(e.target.value)} required>
          <option value="">Choose your charter…</option>
          {events.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
          <option value="other">Another date — I'll type it in</option>
        </select>
        {isOther && (
          <input style={{ ...FIELD, marginTop: 10 }} placeholder="Which trip, and roughly when?"
            value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} maxLength={160} required />
        )}
      </div>

      <div style={ROW}>
        <label style={LABEL} htmlFor="gu-name">Your name</label>
        <input id="gu-name" style={FIELD} value={name} onChange={(e) => setName(e.target.value)}
          maxLength={80} autoComplete="name" required />
      </div>

      <div style={{ ...ROW, display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px" }}>
          <label style={LABEL} htmlFor="gu-phone">Phone</label>
          <input id="gu-phone" style={FIELD} value={phone} onChange={(e) => setPhone(e.target.value)}
            type="tel" inputMode="tel" autoComplete="tel" maxLength={30} required />
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <label style={LABEL} htmlFor="gu-email">Email <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span></label>
          <input id="gu-email" style={FIELD} value={email} onChange={(e) => setEmail(e.target.value)}
            type="email" autoComplete="email" maxLength={120} />
        </div>
      </div>

      <div style={ROW}>
        <label style={LABEL} htmlFor="gu-files">Photos and video</label>
        <input id="gu-files" style={{ ...FIELD, padding: 10 }} type="file" multiple
          accept="video/*,image/*"
          onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "8px 0 0" }}>
          Up to <strong>{maxLabel} per file</strong>, as many as you like. Straight off
          the phone is fine — do not shrink them, the big ones are the useful ones.
          On mobile data a long video can take a while; wifi is kinder.
        </p>
        {files.length > 0 && (
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "6px 0 0" }}>
            {files.length} selected · {prettySize(files.reduce((n, f) => n + f.size, 0))} altogether
          </p>
        )}
      </div>

      <div style={{ ...ROW, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input id="gu-consent" type="checkbox" checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 3, width: 18, height: 18, flex: "0 0 auto" }} required />
        <label htmlFor="gu-consent" style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--muted)" }}>
          These are mine to share, everyone in them is happy for me to send them,
          and The Nauti Yachti can use them in its posts and advertising. Change
          your mind later and we will take them down — just ask.
        </label>
      </div>

      {rows.length > 0 && (
        <div style={{ ...ROW, borderTop: "1px solid var(--ink-soft)", paddingTop: 14 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "5px 0" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              <span style={{ flex: "0 0 auto", color: r.state === "failed" ? "var(--pink)" : "var(--muted)" }}>
                {r.state === "waiting" && "waiting"}
                {r.state === "signing" && "starting…"}
                {r.state === "sending" && (r.pct || 0) + "%"}
                {r.state === "checking" && "finishing…"}
                {r.state === "done" && "sent ✓"}
                {r.state === "failed" && (r.message || "failed")}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color: "var(--pink)", fontSize: 14, margin: "0 0 14px" }}>{error}</p>}

      <button type="submit" disabled={!ready}
        style={{
          ...FIELD, width: "auto", minWidth: 220, cursor: ready ? "pointer" : "not-allowed",
          background: ready ? "var(--purple)" : "var(--ink-soft)",
          color: "#fff", border: "none", fontWeight: 700, fontSize: 16, padding: "13px 26px",
          opacity: ready ? 1 : 0.65,
        }}>
        {busy ? "Sending…" : files.length > 1 ? "Send " + files.length + " files" : "Send it over"}
      </button>
    </form>
  );
}
