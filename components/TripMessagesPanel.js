"use client";

import { useCallback, useEffect, useState } from "react";

// Marketing -> Messages: conversations from guests' trip pages.
//
// Laid out like the DM cards below it, because it is the same job. The
// difference is who is asking: these are booked guests writing about their own
// charter, from a page only they have, so a question here going unanswered is
// a guest turning up unsure where to go.
//
// THE DRAFT IS A DRAFT. Owner, 2 Oct 2026: "drafts, you send." Pearl's draft
// pre-fills the box and nothing leaves until he presses Send and confirms.

const BORDER = { waiting: "#ffb454", answered: "rgba(203,108,230,0.35)" };

function ago(ts) {
  const h = (Date.now() - new Date(ts).getTime()) / 3600000;
  if (!(h >= 0)) return "";
  if (h < 1) return Math.max(1, Math.round(h * 60)) + "m ago";
  if (h < 48) return Math.round(h) + "h ago";
  return Math.round(h / 24) + "d ago";
}

export default function TripMessagesPanel({ onWaiting }) {
  const [data, setData] = useState(null);
  const [typed, setTyped] = useState({});
  const [sending, setSending] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/trip-messages")
      .then((r) => r.json())
      .then((d) => {
        setData(d && Array.isArray(d.threads) ? d : { threads: [], summary: {} });
        if (onWaiting && d && d.summary) onWaiting(d.summary.waiting || 0);
      })
      .catch(() => setData({ threads: [], summary: {}, error: "Could not load trip page messages." }));
  }, [onWaiting]);
  useEffect(() => { load(); }, [load]);

  // What is in the box: whatever he typed, or else the draft. A box he has
  // emptied on purpose stays empty, as in the DM tab.
  function boxOf(t) {
    if (typed[t.bookingId] !== undefined) return typed[t.bookingId];
    return t.draft && t.draft.action === "draft" ? t.draft.suggestion : "";
  }

  async function send(t) {
    const text = String(boxOf(t) || "").trim();
    if (!text) return;
    const how = t.hasEmail
      ? "It appears on their trip page and they are emailed a copy."
      : "It appears on their trip page. There is no email on this booking, so they will only see it if they look — text them too if it matters.";
    if (!window.confirm("Send this to " + (t.guest || t.bookingId) + " as The Nauti Yachti?\n\n" + text + "\n\n" + how)) return;

    setSending(t.bookingId);
    setNotice("");
    try {
      const res = await fetch("/api/admin/trip-messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: t.bookingId, body: text }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(out.error || "That did not send."); return; }
      setTyped((d) => { const n = { ...d }; delete n[t.bookingId]; return n; });
      setNotice(out.emailed ? "Sent, and emailed to them." : "Sent to their trip page" + (t.hasEmail ? ", but the email copy did not go." : "."));
      load();
    } finally {
      setSending(null);
    }
  }

  async function markRead(t) {
    await fetch("/api/admin/trip-messages", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: t.bookingId }),
    }).catch(() => {});
    load();
  }

  if (!data) return <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>Loading trip page messages…</div>;
  const threads = data.threads || [];

  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
        Trip page messages{data.summary && data.summary.waiting ? " (" + data.summary.waiting + " waiting)" : ""}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, maxWidth: 640, marginBottom: 12 }}>
        Booked guests writing from their own trip page. You are emailed when one arrives. Pearl drafts an answer
        when the booking itself has it — the time, the meeting point, what to bring — and holds everything else
        for you. Nothing is sent until you press Send.
        {data.error && <span style={{ color: "#ff4d5e" }}> {data.error}</span>}
      </div>

      {notice && <div role="status" style={{ fontSize: 12.5, color: "#7FE0B8", marginBottom: 10 }}>{notice}</div>}

      {!threads.length && (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>No trip page messages yet.</div>
      )}

      <div style={{ display: "grid", gap: 11 }}>
        {threads.map((t) => (
          <div key={t.bookingId} style={{
            border: "1px solid rgba(203,108,230,0.22)", borderLeft: "3px solid " + (t.waiting ? BORDER.waiting : BORDER.answered),
            borderRadius: 8, padding: "11px 13px", background: "rgba(0,0,0,0.18)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>
                {t.guest || "Guest"} · {t.bookingId}
                <span style={{ fontWeight: 400, color: "var(--muted)" }}>
                  {[t.when, t.packageName, t.vesselName].filter(Boolean).length ? " · " + [t.when, t.packageName, t.vesselName].filter(Boolean).join(" · ") : ""}
                </span>
              </span>
              <span style={{ fontSize: 11.5, color: t.waiting ? BORDER.waiting : "var(--muted)" }}>
                {t.waiting ? "waiting · " : ""}{ago(t.lastAt)}
                {t.tripPath && (
                  <> · <a href={t.tripPath} target="_blank" rel="noopener noreferrer" style={{ color: "var(--purple)" }}>their page ↗</a></>
                )}
              </span>
            </div>

            <div style={{ display: "grid", gap: 7, marginBottom: 10 }}>
              {t.messages.map((m) => (
                <div key={m.id} style={{
                  fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap",
                  color: m.fromGuest ? "var(--text)" : "var(--muted)", paddingLeft: m.fromGuest ? 0 : 22,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 11.5, color: m.fromGuest ? BORDER.waiting : "var(--purple)" }}>
                    {m.fromGuest ? (m.author || "Guest") : "Us"}
                  </span>
                  {" · "}{m.body}
                </div>
              ))}
            </div>

            {t.draft && (
              <div style={{ marginBottom: 6, fontSize: 11, color: "var(--muted)" }}>
                {t.draft.action === "draft"
                  ? (t.draft.author || "Pearl") + " drafted this from the booking. Type over it if you'd rather."
                  : "Yours to answer — " + t.draft.reason + "."}
              </div>
            )}

            <textarea
              value={boxOf(t)}
              onChange={(e) => setTyped((d) => ({ ...d, [t.bookingId]: e.target.value }))}
              placeholder="Write a reply…"
              rows={2}
              style={{
                width: "100%", boxSizing: "border-box", resize: "vertical",
                background: "rgba(0,0,0,0.3)", color: "var(--text)",
                border: "1px solid rgba(203,108,230,0.28)", borderRadius: 6,
                padding: "8px 10px", fontSize: 13, fontFamily: "inherit", lineHeight: 1.5,
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 7, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: (boxOf(t) || "").length > 2000 ? "#ff4d5e" : "var(--muted)" }}>
                {(boxOf(t) || "").length}/2000
                {t.hasEmail ? " · they get an email copy" : " · no email on file"}
                {t.waiting && (
                  <>
                    {" · "}
                    <button type="button" onClick={() => markRead(t)}
                      title="You answered another way, by phone or text. Clears the badge and sends nothing. If they write again it comes back."
                      style={{
                        background: "none", border: "none", padding: 0, color: "var(--muted)",
                        fontSize: 11, textDecoration: "underline", cursor: "pointer",
                      }}>
                      handled elsewhere
                    </button>
                  </>
                )}
              </span>
              <button
                type="button"
                className="console-btn"
                disabled={sending === t.bookingId || !String(boxOf(t) || "").trim()}
                onClick={() => send(t)}
              >
                {sending === t.bookingId ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
