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
  const [marking, setMarking] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/social-messages")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ threads: [], summary: {}, error: "Could not reach the message service." }));
  }, []);
  useEffect(() => { load(); }, [load]);

  // What is actually in the box. `drafts` holds only what the owner has TYPED,
  // so an untouched box falls back to the suggestion — while a box he has
  // deliberately emptied stays empty instead of refilling itself. Same rule the
  // comments tab follows, for the same reason.
  function draftOf(thread) {
    const typed = drafts[thread.id];
    if (typed !== undefined) return typed;
    // A suggestion written before they wrote again does not pre-fill. He can
    // still put it in the box with "restore suggestion", having been told.
    if (thread.suggestion && !thread.suggestionStale) return thread.suggestion;
    return "";
  }

  async function send(thread) {
    const text = String(draftOf(thread) || "").trim();
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
      // Retire the suggestion so it does not reappear in the box under the
      // reply he just sent.
      if (thread.suggestion) {
        fetch("/api/message-suggestions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: thread.id }),
        }).catch(() => {});
      }
      // It comes back queued and becomes delivered a moment later, so re-read
      // rather than claiming success from the response.
      setTimeout(load, 2500);
    } catch (e) {
      window.alert("Could not send that.\n\n" + (e.message || e));
    } finally {
      setSending("");
    }
  }

  // "I answered this one from my phone."
  //
  // Blotato only sees what Blotato sent, so a reply typed in the Facebook app
  // never comes back and the thread keeps its red flag. This is how the missing
  // half gets supplied. It sends nothing to anybody.
  async function markAnswered(thread, answered) {
    setMarking(thread.id);
    try {
      const lastIn = [...(thread.messages || [])].reverse().find((m) => m.direction !== "outgoing");
      const res = await fetch("/api/admin/social-messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: thread.id,
          platform: thread.platform,
          answeredMessageId: lastIn ? lastIn.id : null,
          answeredWhere: answered ? "outside the console" : null,
          answered,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "failed");
      load();
    } catch (e) {
      window.alert("Could not update that.\n\n" + (e.message || e));
    } finally {
      setMarking("");
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
                  {t.answeredElsewhere ? " · answered by you" : t.neverAnswered ? " · never answered" : t.waiting ? " · waiting" : ""}
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

              {/* A MACHINE ANSWERED SOMETHING IT SHOULD NOT HAVE.
                  The Blotato automation matches keywords and knows nothing
                  else, so "your prices are a scam, I want a refund" hits
                  `price` and gets the packages link. This is the one real
                  exposure in the whole arrangement, so it is the loudest thing
                  on the card. */}
              {t.autoAnsweredButShouldNotHaveBeen && (
                <div style={{
                  marginBottom: 8, padding: "7px 9px", borderRadius: 5, fontSize: 11.5, lineHeight: 1.45,
                  background: "rgba(226,104,95,0.12)", border: "1px solid rgba(226,104,95,0.45)", color: "#E2685F",
                }}>
                  <strong>Answered automatically, and should not have been</strong> — {t.triageReason}. Read what
                  went out above before you reply.
                </div>
              )}

              {/* Why this one is his to answer. Not a warning — most threads
                  are held, and the reason is the useful part. */}
              {t.triage === "hold" && !t.autoAnsweredButShouldNotHaveBeen && (
                <div style={{ marginBottom: 7, fontSize: 11, color: "var(--muted)" }}>
                  Yours to answer — {t.triageReason}.
                </div>
              )}

              {t.suggestion && (
                <div style={{ marginBottom: 6, fontSize: 11, color: t.suggestionStale ? "#E8934A" : "var(--muted)" }}>
                  {t.suggestionStale
                    ? "⚠ " + (t.suggestionAuthor || "Siren") + " drafted this before they wrote again — read it before you send it"
                    : (t.suggestionAuthor || "Siren") + " suggested this. Type over it if you'd rather."}
                  {draftOf(t) !== t.suggestion && (
                    <button
                      type="button"
                      onClick={() => setDrafts((d) => ({ ...d, [t.id]: t.suggestion }))}
                      style={{
                        marginLeft: 7, background: "none", border: "none", padding: 0,
                        color: "var(--purple)", fontSize: 11, textDecoration: "underline", cursor: "pointer",
                      }}
                    >
                      restore suggestion
                    </button>
                  )}
                </div>
              )}

              <textarea
                value={draftOf(t)}
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: (draftOf(t) || "").length > 1000 ? "#ff4d5e" : "var(--muted)" }}>
                  {(draftOf(t) || "").length}/1000
                  {/* Blotato cannot see a reply typed in the Facebook app, so
                      this is the only way a thread he handled on his phone
                      stops wearing a red flag. It sends nothing — and it does
                      not touch the auto-reply, which fires at the platform and
                      never reads our database. */}
                  {t.answeredElsewhere ? (
                    <>
                      {" · "}
                      <span style={{ color: "#7FE0B8" }}>you answered this elsewhere</span>
                      {" · "}
                      <button
                        type="button"
                        disabled={marking === t.id}
                        onClick={() => markAnswered(t, false)}
                        style={{
                          background: "none", border: "none", padding: 0, color: "var(--purple)",
                          fontSize: 11, textDecoration: "underline", cursor: "pointer",
                        }}
                      >
                        {marking === t.id ? "…" : "put it back"}
                      </button>
                    </>
                  ) : t.waiting ? (
                    <>
                      {" · "}
                      <button
                        type="button"
                        disabled={marking === t.id}
                        onClick={() => markAnswered(t, true)}
                        title="You replied from your phone. Blotato cannot see those, so tell the console yourself. If they write again, this re-opens on its own."
                        style={{
                          background: "none", border: "none", padding: 0, color: "var(--muted)",
                          fontSize: 11, textDecoration: "underline", cursor: "pointer",
                        }}
                      >
                        {marking === t.id ? "…" : "I answered this elsewhere"}
                      </button>
                    </>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={sending === t.id || !(draftOf(t) || "").trim() || (draftOf(t) || "").length > 1000}
                  onClick={() => send(t)}
                  style={{
                    padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                    border: "none", background: "var(--purple)", color: "#0A0612",
                    opacity: sending === t.id || !(draftOf(t) || "").trim() ? 0.45 : 1,
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
