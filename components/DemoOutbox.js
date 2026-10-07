"use client";
// The demo's outbox, shown at the top of the console's Overview in demo mode
// only (components/AdminView.js). Every email the live system would have sent
// to a guest or the owner lands here instead, so a prospect can book with a
// test card and then read the confirmation that guest would have received.
import { useEffect, useState } from "react";

export default function DemoOutbox() {
  const [messages, setMessages] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    fetch("/api/admin/demo-outbox", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages(d.messages || []))
      .catch(() => setMessages([]));
  }, []);

  if (messages === null) return null;
  return (
    <section style={{ border: "1px solid #E8934A", borderRadius: 8, padding: 14, margin: "0 0 18px" }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Demo outbox</h3>
      <p style={{ margin: "0 0 10px", fontSize: 13, opacity: 0.8 }}>
        On the live system these emails go to the guest and the owner. In the demo they stop here.
        Book a charter on the site with test card 4242 4242 4242 4242 and the confirmation appears below.
      </p>
      {!messages.length && <p style={{ fontSize: 13, margin: 0 }}>Nothing yet.</p>}
      {messages.map((m, i) => (
        <div key={i} style={{ borderTop: "1px solid rgba(128,128,128,.25)", padding: "8px 0" }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", fontSize: 13 }}
          >
            <strong>{m.subject || "(no subject)"}</strong>
            <span style={{ opacity: 0.7 }}> · to {(m.to || []).join(", ")} · {new Date(m.at).toLocaleString()}</span>
          </button>
          {open === i && (
            m.html
              ? <iframe title={m.subject} sandbox="" srcDoc={m.html} style={{ width: "100%", height: 420, border: 0, background: "#fff", marginTop: 8 }} />
              : <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 8 }}>{m.text}</pre>
          )}
        </div>
      ))}
    </section>
  );
}
