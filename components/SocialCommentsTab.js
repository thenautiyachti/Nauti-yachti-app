"use client";

// The queue of comments nobody has answered.
//
// Sits beside Media Drafts because it is the same shape of job: things waiting
// on a decision only the owner can make. On 6 Sep 2026 a Boatz & Glowz post
// drew four challenges — liability, life jackets, drink-driving, litter on the
// shoreline — and the first sat twenty-three hours before anyone saw it. The
// people reading a thread like that are the ones who never comment, and an
// unanswered accusation reads as conceded.
//
// NOTHING HERE SENDS ON ITS OWN. A reply is public, immediate and attributed to
// the business. Every other agent in this system proposes and the owner
// decides; a comment thread — composed fresh, in response to something hostile,
// with no chance to review — is the last place to break that pattern.
import { useState, useEffect, useCallback } from "react";
import { urgency, URGENCY_COLOUR, shortAge } from "../lib/socialComments";

const CARD = {
  background: "var(--card)",
  border: "1px solid rgba(203,108,230,0.2)",
  borderRadius: 10,
  padding: 14,
};

export default function SocialCommentsTab() {
  const [data, setData] = useState(null);
  const [showAnswered, setShowAnswered] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [sending, setSending] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/social-comments")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ threads: [], summary: { open: 0 }, error: "Could not reach the comment service." }));
  }, []);
  useEffect(() => { load(); }, [load]);

  // What is actually in the box. `drafts` only holds what the owner has TYPED,
  // so an untouched box falls back to Siren's suggestion — while a box he
  // deliberately emptied stays empty. That is why this checks for null rather
  // than falsiness: "" is a real edit and must not be overwritten by the
  // suggestion again.
  function draftOf(thread) {
    const typed = drafts[thread.comment.id];
    if (typed != null) return typed;
    // A suggestion written against different comment text does not pre-fill.
    // The owner can still put it in the box with "restore suggestion", having
    // been told why it is not there already.
    if (thread.suggestion && !thread.suggestionStale) return thread.suggestion;
    return "";
  }

  async function send(thread) {
    const text = String(draftOf(thread) || "").trim();
    if (!text) return;
    // Quote what is actually being answered. In a thread somebody came back to,
    // that is their follow-up, not the comment at the top — and the confirm
    // dialog is the last place to catch a reply aimed at the wrong sentence.
    const answering =
      (thread.suggestionFor && (thread.replies || []).find((r) => r.id === thread.suggestionFor)) ||
      thread.comment;
    const quoted = answering.text ? String(answering.text).slice(0, 70) : "this comment";
    if (!window.confirm(
      "Post this publicly as The Nauti Yachti?\n\n" + text +
      "\n\nIt replies to: " + quoted + "\non " + thread.platform + "."
    )) return;
    setSending(thread.comment.id);
    try {
      const res = await fetch("/api/admin/social-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: thread.postId,
          parentCommentId: thread.comment.id,
          text,
        }),
      });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error || "failed");
      setDrafts((d) => ({ ...d, [thread.comment.id]: "" }));
      // Retire the suggestion so it does not reappear in the box under a reply
      // that has already gone out.
      //
      // Retire it under the id it was FILED against. A suggestion written for a
      // follow-up lives under that reply's id, so patching the top-level id
      // updated nothing and the draft kept coming back after it had been sent.
      if (thread.suggestion) {
        fetch("/api/comment-suggestions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentId: thread.suggestionFor || thread.comment.id }),
        }).catch(() => {});
      }
      // It comes back "queued" and becomes "posted" a moment later, so re-read
      // rather than claim success from the response.
      setTimeout(load, 2500);
    } catch (e) {
      window.alert("Could not post that.\n\n" + (e.message || e));
    } finally {
      setSending("");
    }
  }

  if (!data) return <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Reading comments…</div>;

  const threads = data.threads || [];
  const open = threads.filter((t) => !t.answered);
  const answered = threads.filter((t) => t.answered);
  const shown = showAnswered ? answered : open;

  return (
    <div>
      {data.error && (
        <div style={{ ...CARD, borderColor: "#E8934A", marginBottom: 12 }}>
          <strong style={{ color: "#E8934A" }}>Comments could not be read.</strong>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5, lineHeight: 1.5 }}>
            {data.error}
            {/* An empty queue reads as "all answered", which is the one wrong
                impression this panel must never give. */}
            <div style={{ marginTop: 6 }}>
              An empty list below means nothing could be fetched — not that everything is answered.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[["open", "Waiting (" + open.length + ")"], ["answered", "Answered (" + answered.length + ")"]].map(([id, label]) => {
          const active = (id === "answered") === showAnswered;
          return (
            <button key={id} type="button" onClick={() => setShowAnswered(id === "answered")}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                border: "1px solid var(--purple)",
                background: active ? "var(--purple)" : "transparent",
                color: active ? "#0A0612" : "var(--text)",
              }}>{label}</button>
          );
        })}
        <button type="button" onClick={load}
          style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "1px solid rgba(203,108,230,0.3)", background: "transparent", color: "var(--muted)" }}>
          Refresh
        </button>
      </div>

      {/* TikTok is connected for publishing but its comments are not exposed by
          the API at all. Saying so is the difference between two channels
          covered and three channels believed to be covered. */}
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Facebook and Instagram. TikTok comments are not available through the publishing API,
        so those still need the TikTok app.
      </div>

      {shown.length === 0 && (
        <div style={{ color: "var(--muted)", fontSize: 13.5 }}>
          {showAnswered
            ? "Nothing answered yet."
            : data.error
              ? "—"
              : "Nothing waiting. Every comment has a reply under it."}
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {shown.map((t) => {
          const level = urgency(t);
          const colour = URGENCY_COLOUR[level];
          return (
            <div key={t.comment.id} style={{ ...CARD, borderLeft: "3px solid " + colour }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: colour }}>
                  {t.platform}{t.isFollowUp ? " · they came back" : ""}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{shortAge(t.ageHours)}</span>
              </div>

              <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {t.comment.text}
              </div>

              {t.replies.length > 0 && (
                <div style={{ marginTop: 9, paddingLeft: 11, borderLeft: "2px solid rgba(203,108,230,0.2)", display: "grid", gap: 7 }}>
                  {t.replies.map((r) => (
                    <div key={r.id} style={{ fontSize: 12.5, lineHeight: 1.45, color: r.isAuthor ? "var(--text)" : "var(--muted)", whiteSpace: "pre-wrap" }}>
                      <span style={{ fontWeight: 700, color: r.isAuthor ? "var(--purple)" : "var(--muted)" }}>
                        {r.isAuthor ? "Us" : "Them"}
                      </span>
                      {" · "}{r.text}
                      {r.status && r.status !== "posted" && (
                        <span style={{ color: r.status === "failed" ? "#E2685F" : "#E8934A", fontWeight: 700 }}> [{r.status}]</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!t.answered && (
                <div style={{ marginTop: 10 }}>
                  {t.suggestion && (
                    <div style={{
                      fontSize: 11.5, color: "var(--muted)", marginBottom: 5,
                      display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                    }}>
                      <span>
                        {t.suggestionStale
                          // The comment changed after the suggestion was
                          // written, so it may answer a question that is no
                          // longer being asked. Say it plainly; do not
                          // pre-fill it as if it were current.
                          ? "⚠ " + (t.suggestionAuthor || "Siren") + " drafted this before the comment was edited — read it before you send it"
                          : (t.suggestionAuthor || "Siren") + " suggested this. Type over it if you'd rather."}
                      </span>
                      {draftOf(t) !== t.suggestion && (
                        <button
                          type="button"
                          onClick={() => setDrafts((d) => ({ ...d, [t.comment.id]: t.suggestion }))}
                          style={{
                            padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                            border: "1px solid rgba(203,108,230,0.35)", background: "transparent",
                            color: "var(--purple)", cursor: "pointer",
                          }}
                        >
                          restore suggestion
                        </button>
                      )}
                    </div>
                  )}
                  <textarea
                    rows={3}
                    placeholder="Your reply — it posts publicly as The Nauti Yachti"
                    value={draftOf(t)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [t.comment.id]: e.target.value }))}
                    style={{
                      width: "100%", padding: "9px 10px", borderRadius: 7, fontSize: 13.5, lineHeight: 1.45,
                      border: "1px solid rgba(203,108,230,0.3)", background: "var(--card)", color: "var(--text)",
                      resize: "vertical", fontFamily: "inherit",
                    }}
                  />
                  <button
                    type="button"
                    disabled={sending === t.comment.id || !String(draftOf(t) || "").trim()}
                    onClick={() => send(t)}
                    style={{
                      marginTop: 7, padding: "9px 16px", borderRadius: 7, fontSize: 13, fontWeight: 700, border: "none",
                      background: String(draftOf(t) || "").trim() ? "var(--purple)" : "rgba(203,108,230,0.2)",
                      color: String(draftOf(t) || "").trim() ? "#0A0612" : "var(--muted)",
                    }}
                  >
                    {sending === t.comment.id ? "Posting…" : "Post reply"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
