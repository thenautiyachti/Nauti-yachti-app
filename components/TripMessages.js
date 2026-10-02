"use client";

import { useEffect, useState } from "react";

// The message board on a trip page. A guest writes; the owner is emailed and
// answers from the console. Nothing here is answered by a machine: replies are
// written or approved by him (owner, 2 Oct 2026: "drafts, you send").

const CARD = {
  background: "var(--ink)", borderRadius: 14, padding: "18px 20px",
  border: "1px solid rgba(203,108,230,0.18)", margin: "0 0 16px",
};

function when(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TripMessages({ tripRef, tripKey, demo, defaultName, contactPhone }) {
  const [messages, setMessages] = useState([]);
  const [author, setAuthor] = useState(defaultName || "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentNote, setSentNote] = useState("");

  const qs = "ref=" + encodeURIComponent(tripRef || "") + "&k=" + encodeURIComponent(tripKey || "");

  async function load() {
    if (demo) return;
    const r = await fetch("/api/trip/messages?" + qs).then((x) => x.json()).catch(() => null);
    if (r && Array.isArray(r.messages)) setMessages(r.messages);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSentNote("");
    if (demo) { setSentNote("Demo page: nothing was sent."); return; }
    setBusy(true);
    const res = await fetch("/api/trip/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: tripRef, k: tripKey, author, body }),
    }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setError(out.error || "That didn't send. Check your signal and try again."); return; }
    setBody("");
    setSentNote("Sent. We'll reply on this page.");
    load();
  }

  return (
    <section style={CARD}>
      <h2 style={{ fontSize: 17, color: "var(--text)", margin: "0 0 8px", fontWeight: 700 }}>Message us</h2>
      <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.55, margin: "0 0 12px" }}>
        Questions about your trip? Ask here and the captain will answer on this page. Anyone with this link
        can read this conversation. For anything urgent on the day, call or text {contactPhone}.
      </p>

      {messages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "0 0 14px" }}>
          {messages.map((m) => (
            <div key={m.id} style={{
              alignSelf: m.fromGuest ? "flex-end" : "flex-start", maxWidth: "88%",
              background: m.fromGuest ? "rgba(203,108,230,0.16)" : "var(--ink-soft)",
              border: "1px solid rgba(203,108,230,0.18)", borderRadius: 12, padding: "9px 12px",
            }}>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 3 }}>
                {(m.fromGuest ? (m.author || "You") : (m.author || "The Nauti Yachti")) + " · " + when(m.createdAt)}
              </div>
              <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.body}</div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit}>
        <input aria-label="Your name" placeholder="Your name" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={60}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 16, borderRadius: 10, border: "1px solid rgba(203,108,230,0.35)", background: "var(--ink-soft)", color: "var(--text)", marginBottom: 8 }} />
        <textarea aria-label="Your message" placeholder="What can we help with?" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={2000} rows={3}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 16, borderRadius: 10, border: "1px solid rgba(203,108,230,0.35)", background: "var(--ink-soft)", color: "var(--text)", resize: "vertical", fontFamily: "inherit" }} />
        {error && <p role="alert" style={{ color: "var(--pink)", fontSize: 14, margin: "8px 0 0" }}>{error}</p>}
        <button type="submit" disabled={busy || !body.trim()} style={{
          marginTop: 10, width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612",
          border: "none", borderRadius: 8, padding: "12px", fontWeight: 700, fontSize: 15, opacity: busy || !body.trim() ? 0.55 : 1,
        }}>
          {busy ? "Sending…" : "Send message"}
        </button>
        {sentNote && <p role="status" style={{ color: "var(--text)", fontSize: 14, margin: "10px 0 0" }}>{sentNote}</p>}
      </form>
    </section>
  );
}
