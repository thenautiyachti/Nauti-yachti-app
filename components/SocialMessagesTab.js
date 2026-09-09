"use client";

import { useCallback, useEffect, useState } from "react";
import { urgency, URGENCY_COLOUR } from "../lib/socialMessages";

// The direct-message inbox.
//
// Nothing read these before. The console had a comments tab and no messages
// tab, and not one of the nine scheduled crew had a DM in their brief — so a
// message arrived, sat there, and there was no point at which anybody found
// out.
//
// The first look at the data found two unread messages from 7 September, from
// the man who had posted publicly about litter on the shoreline, offering two
// of his own boats to help clean up after the glow party. A day and a half old.
//
// Same shape as SocialCommentsTab on purpose: these answer the same question
// about different channels, and two panels that disagreed about what "waiting"
// means would be worse than one.

const PLATFORM_COLOUR = { facebook: "#4A9BE8", instagram: "#E1477E" };

function shortAge(hours) {
  if (hours < 1) return "just now";
  if (hours < 24) return hours + "h";
  const d = Math.round(hours / 24);
  return d + (d === 1 ? " day" : " days");
}

export default function SocialMessagesTab() {
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [sending, setSending] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/social-messages")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ threads: [], summary: {}, error: "Could not reach the message service." }));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function send(thread) {
    const text = String(drafts[thread.id] || "").trim();
    if (!text) return;
    if (!window.confirm(
      "Send this as The Nauti Yachti?\n\n" + text +
      "\n\nIt goes to this person on " + thread.platform + " as a private message."
    )) return;

    setSending(thread.id);
    try {
      const res = await fetch("/api/admin/social-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: thread.accountId,
          recipientId: thread.recipientId,
          text,
        }),
      });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error || "failed");
      setDrafts((d) => ({ ...d, [thread.id]: "" }));
      // It comes back queued and becomes delivered a moment later, so re-read
      // rather than claiming success from the response.
      setTimeout(load, 2500);
    } catch (e) {
      window.alert("Could not send that.\n\n" + (e.message || e));
    } finally {
      setSending("");
    }
  }

  if (!data) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading messages…</div>;

  const threads = data.threads || [];
  const s = data.summary || {};

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          {data.error ? (
            <span style={{ color: "#ff4d5e" }}>{data.error}</span>
          ) : threads.length === 0 ? (
            "No messages. Facebook and Instagram only — TikTok does not expose DMs."
          ) : (
            <>
              <strong style={{ color: s.waiting ? "#ffb454" : "var(--text)" }}>
                {s.waiting || 0} waiting on you
              </strong>
              {" · "}{threads.length} conversation{threads.length === 1 ? "" : "s"}
              {s.neverAnswered ? <> · <strong style={{ color: "#ff4d5e" }}>{s.neverAnswered} never answered</strong></> : null}
              {s.failed ? <> · <strong style={{ color: "#ff4d5e" }}>{s.failed} failed to send</strong></> : null}
              {" · Facebook and Instagram only"}
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: 11 }}>
        {threads.map((t) => {
          const level = urgency(t);
          const colour = URGENCY_COLOUR[level];
          return (
            <div key={t.id} style={{
              border: "1px solid rgba(203,108,230,0.22)", borderLeft: "3px solid " + colour,
              borderRadius: 8, padding: "11px 13px", background: "rgba(0,0,0,0.18)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                  color: PLATFORM_COLOUR[t.platform] || "var(--muted)",
                }}>
                  {t.platform}
                  {t.neverAnswered ? " · never answered" : t.waiting ? " · waiting" : ""}
                </span>
                <span style={{ fontSize: 11.5, color: t.waiting ? colour : "var(--muted)" }}>
                  {shortAge(t.ageHours)}
                </span>
              </div>

              <div style={{ display: "grid", gap: 7, marginBottom: 10 }}>
                {t.messages.map((m) => (
                  <div key={m.id} style={{
                    fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap",
                    color: m.direction === "outgoing" ? "var(--muted)" : "var(--text)",
                    paddingLeft: m.direction === "outgoing" ? 22 : 0,
                  }}>
                    <span style={{
                      fontWeight: 700, fontSize: 11.5,
                      color: m.direction === "outgoing" ? "var(--purple)" : colour,
                    }}>
                      {m.direction === "outgoing" ? "Us" : "Them"}
                    </span>
                    {" · "}{m.text}
                    {m.status === "failed" && (
                      <span style={{ color: "#ff4d5e", fontWeight: 700 }}> [failed to send]</span>
                    )}
                  </div>
                ))}
              </div>

              <textarea
                value={drafts[t.id] || ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                placeholder="Write a reply…"
                rows={2}
                style={{
                  width: "100%", boxSizing: "border-box", resize: "vertical",
                  background: "rgba(0,0,0,0.3)", color: "var(--text)",
                  border: "1px solid rgba(203,108,230,0.28)", borderRadius: 6,
                  padding: "8px 10px", fontSize: 13, fontFamily: "inherit", lineHeight: 1.5,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 7 }}>
                <span style={{ fontSize: 11, color: (drafts[t.id] || "").length > 1000 ? "#ff4d5e" : "var(--muted)" }}>
                  {(drafts[t.id] || "").length}/1000
                </span>
                <button
                  type="button"
                  disabled={sending === t.id || !(drafts[t.id] || "").trim() || (drafts[t.id] || "").length > 1000}
                  onClick={() => send(t)}
                  style={{
                    padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                    border: "none", background: "var(--purple)", color: "#0A0612",
                    opacity: sending === t.id || !(drafts[t.id] || "").trim() ? 0.45 : 1,
                  }}
                >
                  {sending === t.id ? "Sending…" : "Send reply"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
