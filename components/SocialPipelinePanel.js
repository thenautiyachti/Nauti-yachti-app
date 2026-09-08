"use client";

import { Fragment, useEffect, useState } from "react";

import { REVIEW_REASONS, reviewReasonLabel } from "../lib/reviewReasons";

// One social pipeline: proposed -> approved -> scheduled -> posted.
//
// This replaces the old split between a "Media Queue" (agent proposals awaiting
// approval) and a "Campaign Queue" (pre-written copy awaiting a date). They were
// two halves of one job, and the seam between them was where work got stuck:
// approving a draft set a flag and stopped, so an approved video could sit for
// days with nothing carrying it to a date.
//
// Now approval has somewhere to go. The stage a row is in decides which actions
// it offers, and the whole thing is one list.

const STAGES = [
  { id: "proposed", label: "Proposed", color: "#ffb454", blurb: "Waiting on your call" },
  // The middle answer. Not every draft is a yes or a no — most are "nearly,
  // change this bit", and without somewhere to say that the only options were
  // to approve something you did not like or bin an idea that was fine.
  { id: "discussing", label: "Needs work", color: "#e86aa8", blurb: "Good idea, draft needs changes" },
  { id: "approved", label: "Approved", color: "#4ff3ff", blurb: "Needs a date" },
  { id: "scheduled", label: "Scheduled", color: "#00d9ff", blurb: "Ready to go out" },
  { id: "posted", label: "Posted", color: "#7FE0B8", blurb: "Done" },
  { id: "rejected", label: "Rejected", color: "#ff4d5e", blurb: "Not going out" },
  // Went out, then came down. Kept apart from "rejected" because a post that
  // ran and was pulled is a different piece of history from one that never ran.
  { id: "delisted", label: "Delisted", color: "#ffb454", blurb: "Was posted, since removed" },
];
const STAGE = Object.fromEntries(STAGES.map((s) => [s.id, s]));

const PLATFORM_COLOR = {
  Facebook: "#4a9eff", facebook: "#4a9eff",
  Instagram: "#e86aa8", instagram: "#e86aa8",
  TikTok: "#4ff3ff", tiktok: "#4ff3ff",
  Action: "#ffb454",
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prettyDate(key) {
  if (!key) return "No date yet";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function SocialPipelinePanel() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState("");
  const [view, setView] = useState("active"); // "active" | "all"
  // WHAT THE PREVIEW BUTTON BECAME.
  //
  // "The preview button really just displays again what is already displayed"
  // — and it did: opening a card already shows the media and the caption, and
  // the preview panel underneath showed the same media and the same caption a
  // second time. It cost a click to learn nothing.
  //
  // The space it occupied now holds the thing there was no room for: saying
  // what is wrong. { id, mode: "revise" | "kill", reason, note }
  const [feedback, setFeedback] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await fetch("/api/media-drafts");
      if (!res.ok) throw new Error();
      setRows(await res.json());
    } catch {
      setError(true);
    }
  }

  async function move(row, status, extra = {}) {
    setBusy(row.id);
    // Optimistic, then reconcile from the server response so a rejected write
    // cannot leave the panel showing a stage the database does not have.
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status, ...extra } : r)));
    try {
      const res = await fetch(`/api/media-drafts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      if (res.ok) {
        const saved = await res.json();
        setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      }
    } catch {
      // leave the optimistic state; a reload re-reads the truth
    } finally {
      setBusy("");
    }
  }

  // Open the feedback form. "revise" keeps the post and asks for a change;
  // "kill" stops it. Both need a reason — that is the whole point.
  function openFeedback(row, mode) {
    setFeedback({
      id: row.id,
      mode,
      reason: row.reviewReason || "",
      note: row.reviewNote || "",
    });
  }

  // Saving is the same write either way; only the stage differs. A reason is
  // required and the note is not: picking "wrong photo or clip" already says
  // enough to act on, while forcing a sentence on every rejection is how a
  // required field turns into people typing "n/a".
  function submitFeedback(row, mode) {
    if (!feedback || !feedback.reason) return;
    const note = (feedback.note || "").trim();
    setFeedback(null);
    move(row, mode === "kill" ? "rejected" : "discussing", {
      reviewReason: feedback.reason,
      reviewNote: note || null,
    });
  }

  function schedule(row) {
    // Approved but undated is the state the old design stranded things in, so
    // the panel asks for the one missing fact rather than offering a dead end.
    const suggested = row.scheduledDate || todayKey();
    const date = window.prompt("Date to post it (YYYY-MM-DD):", suggested);
    if (!date) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      window.alert("Please use YYYY-MM-DD, e.g. 2026-09-14.");
      return;
    }
    move(row, "scheduled", { scheduledDate: date.trim() });
  }

  async function attachMedia(row) {
    const url = window.prompt(
      "Paste the image or video URL for this post.\n\nIt has to be a direct link to the file — the kind ending .jpg, .png or .mp4. Leave blank and press OK to remove the current one.",
      row.mediaUrl || ""
    );
    if (url === null) return; // cancelled, as opposed to cleared
    const value = url.trim();
    setBusy(row.id);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, mediaUrl: value || null } : r)));
    try {
      const res = await fetch(`/api/media-drafts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaUrl: value || null }),
      });
      if (res.ok) {
        const saved = await res.json();
        setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      }
    } catch {
      // optimistic state stands; a reload re-reads the truth
    } finally {
      setBusy("");
    }
  }

  function copy(row) {
    navigator.clipboard?.writeText(row.caption).then(() => {
      setCopied(row.id);
      setTimeout(() => setCopied(""), 1800);
    }).catch(() => {});
  }

  if (error) return <div style={{ color: "#ff4d5e", fontSize: 12.5 }}>Unable to load the pipeline.</div>;
  if (!rows) return <div style={{ color: "#1c7a86", fontSize: 12.5 }}>Loading…</div>;
  if (!rows.length) return <div style={{ color: "#1c7a86", fontSize: 12.5, fontStyle: "italic" }}>Nothing in the pipeline.</div>;

  const today = todayKey();
  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;

  // "Active" hides the terminal stages, because the useful question most of the
  // time is what still needs doing.
  const shown = view === "active"
    ? rows.filter((r) => !["posted", "rejected", "delisted"].includes(r.status))
    : rows;

  // Anything with a date sorts by it; undated work floats to the top, since a
  // proposal awaiting judgement is the most urgent thing in the list.
  const ordered = [...shown].sort((a, b) => {
    if (!a.scheduledDate && b.scheduledDate) return -1;
    if (a.scheduledDate && !b.scheduledDate) return 1;
    if (a.scheduledDate && b.scheduledDate && a.scheduledDate !== b.scheduledDate) {
      return a.scheduledDate < b.scheduledDate ? -1 : 1;
    }
    return (a.postNumber || 0) - (b.postNumber || 0);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10, flexShrink: 0 }}>
        {STAGES.map((s) => (
          counts[s.id] ? (
            <span key={s.id} title={s.blurb}
              style={{ fontSize: 10.5, color: s.color, border: `1px solid ${s.color}`, borderRadius: 10, padding: "1px 8px", whiteSpace: "nowrap" }}>
              {counts[s.id]} {s.label.toLowerCase()}
            </span>
          ) : null
        ))}
        <button type="button" onClick={() => setView(view === "active" ? "all" : "active")}
          style={{ marginLeft: "auto", background: "transparent", color: "#4ff3ff", border: "1px solid rgba(0,217,255,0.35)", borderRadius: 5, padding: "3px 9px", fontSize: 11 }}>
          {view === "active" ? "Show all" : "Active only"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 6, flex: 1, minHeight: 160, overflowY: "auto", alignContent: "start" }}>
        {ordered.map((r, i) => {
          const open = expanded === r.id;
          // A date heading above the first row of each day. Three posts going
          // out on the same day is one job, not three, and without the heading
          // the list reads as an undifferentiated run of rows.
          const prev = i > 0 ? ordered[i - 1] : null;
          const newDay = !prev || prev.scheduledDate !== r.scheduledDate;
          const dayOverdue = r.scheduledDate && r.scheduledDate < today;
          const dayIsToday = r.scheduledDate === today;
          const heading = newDay ? (
            <div key={`h-${r.scheduledDate || "none"}-${r.id}`}
              style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em",
                color: dayOverdue ? "#ff4d5e" : dayIsToday ? "#ffb454" : "#4ff3ff",
                marginTop: i === 0 ? 0 : 8, paddingBottom: 3,
                borderBottom: "1px solid rgba(0,217,255,0.18)",
              }}>
              {(r.scheduledDate ? prettyDate(r.scheduledDate) : "No date yet").toUpperCase()}
              {dayOverdue ? " · OVERDUE" : dayIsToday ? " · TODAY" : ""}
            </div>
          ) : null;
          const stage = STAGE[r.status] || STAGE.proposed;
          const overdue = r.status === "scheduled" && r.scheduledDate && r.scheduledDate < today;
          const isToday = r.scheduledDate === today;
          return (
            <Fragment key={r.id}>
            {heading}
            <div style={{ border: `1px solid ${overdue ? "rgba(255,77,94,0.5)" : "rgba(0,217,255,0.18)"}`, borderRadius: 4, overflow: "hidden" }}>
              <div role="button" tabIndex={0}
                onClick={() => setExpanded(open ? null : r.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(open ? null : r.id); }}
                style={{ padding: "7px 10px", cursor: "pointer", display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "#dffcff" }}>
                <span style={{ color: stage.color, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", border: `1px solid ${stage.color}`, borderRadius: 3, padding: "0 5px", whiteSpace: "nowrap" }}>
                  {stage.label.toUpperCase()}
                </span>
                {r.platform && (
                  <span style={{ color: PLATFORM_COLOR[r.platform] || "#4ff3ff", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {r.platform}
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: r.status === "posted" || r.status === "rejected" ? 0.55 : 1 }}>
                  {(r.caption || "").split("\n")[0]}
                </span>
                {/* A scheduled post with nothing to post is the failure worth
                    seeing early — it will not go out on the day, and the day is
                    too late to find that out. */}
                {r.status === "scheduled" && !r.mediaUrl && (
                  <span title="This cannot be published without a photo or clip"
                    style={{ fontSize: 9.5, fontWeight: 700, color: "#ffb454", border: "1px solid #ffb454", borderRadius: 3, padding: "0 4px", whiteSpace: "nowrap" }}>
                    NO MEDIA
                  </span>
                )}
                {r.scheduledDate && (
                  <span style={{ fontSize: 10, whiteSpace: "nowrap", color: overdue ? "#ff4d5e" : isToday ? "#ffb454" : "#1c7a86" }}>
                    {overdue ? "OVERDUE " : isToday ? "TODAY " : ""}{prettyDate(r.scheduledDate)}
                  </span>
                )}
                <span style={{ color: "#4ff3ff", fontSize: 10 }}>{open ? "✕" : "▼"}</span>
              </div>

              {open && (
                <div style={{ padding: "0 10px 12px" }}>
                  {r.mediaUrl && (
                    r.mediaType === "video"
                      ? <video src={r.mediaUrl} controls style={{ width: "100%", maxHeight: 220, borderRadius: 4, background: "#000", marginBottom: 8 }} />
                      : <img src={r.mediaUrl} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 4, background: "rgba(0,0,0,0.35)", marginBottom: 8 }} />
                  )}
                  {r.photoHint && <div style={{ fontSize: 11.5, color: "#ffb454", marginBottom: 6 }}>📷 {r.photoHint}</div>}
                  {r.deliveryNote && <div style={{ fontSize: 11.5, color: "#4ff3ff", opacity: 0.8, marginBottom: 6 }}>{r.deliveryNote}</div>}
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, color: "#dffcff", lineHeight: 1.5, margin: "0 0 8px", background: "rgba(0,0,0,0.3)", padding: 10, borderRadius: 4 }}>
                    {r.caption}
                  </pre>
                  {/* The reason shows even with no note against it, which is
                      the common case — "wrong photo or clip" is a complete
                      answer on its own and should not need a sentence to be
                      visible. */}
                  {(r.reviewNote || r.reviewReason) && (
                    <div style={{
                      fontSize: 12, lineHeight: 1.5, marginBottom: 8, padding: "8px 10px", borderRadius: 4,
                      color: r.status === "discussing" ? "#dffcff" : "#1c7a86",
                      background: r.status === "discussing" ? "rgba(232,106,168,0.12)" : "transparent",
                      border: r.status === "discussing" ? "1px solid rgba(232,106,168,0.4)" : "none",
                    }}>
                      {r.status === "discussing" && <strong style={{ color: "#e86aa8" }}>Change requested: </strong>}
                      {r.status === "rejected" && r.reviewReason && <strong style={{ color: "#ff4d5e" }}>Not posted — </strong>}
                      {r.reviewReason && (
                        <strong>{reviewReasonLabel(r.reviewReason)}{r.reviewNote ? ". " : ""}</strong>
                      )}
                      {r.reviewNote}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {/* DISCUSS, on every stage. A post can be wrong at any
                        point, including after it is scheduled — that is exactly
                        when "not that clip" tends to get noticed. */}
                    <button type="button"
                      onClick={() => (feedback && feedback.id === r.id ? setFeedback(null) : openFeedback(r, "revise"))}
                      style={btn("#e86aa8", true)}>
                      {feedback && feedback.id === r.id ? "CLOSE" : "DISCUSS"}
                    </button>
                    {/* Copying moved up here from the old preview panel: the
                        caption still has to reach the app by hand. */}
                    <button type="button" onClick={() => copy(r)} style={btn("#00d9ff")}>
                      {copied === r.id ? "COPIED ✓" : "COPY CAPTION"}
                    </button>
                    <button type="button" disabled={busy === r.id} onClick={() => attachMedia(r)}
                      style={btn(r.mediaUrl ? "#1c7a86" : "#ffb454", !r.mediaUrl)}>
                      {r.mediaUrl ? "REPLACE MEDIA" : "ATTACH MEDIA"}
                    </button>
                    {(r.status === "proposed" || r.status === "discussing") && (
                      <>
                        <button type="button" disabled={busy === r.id} onClick={() => move(r, "approved")} style={btn("#4ff3ff")}>
                          APPROVE
                        </button>
                        {/* Goes to the form rather than straight to rejected.
                            A killed post used to leave no trace of what was
                            wrong with it, so the same idea could come back the
                            following week and nothing could count how often
                            that happened. */}
                        <button type="button" disabled={busy === r.id} onClick={() => openFeedback(r, "kill")} style={btn("#ff4d5e")}>
                          DENY
                        </button>
                      </>
                    )}

                    {r.status === "approved" && (
                      <button type="button" disabled={busy === r.id} onClick={() => schedule(r)} style={btn("#00d9ff", true)}>
                        SCHEDULE…
                      </button>
                    )}

                    {r.status === "scheduled" && (
                      <>
                        <button type="button" disabled={busy === r.id} onClick={() => move(r, "posted")} style={btn("#7FE0B8")}>
                          MARK POSTED
                        </button>
                        <button type="button" disabled={busy === r.id} onClick={() => schedule(r)} style={btn("#4ff3ff")}>
                          RESCHEDULE
                        </button>
                        {/* Killing a scheduled post was impossible before: reject
                            only existed at the proposal stage, so changing your
                            mind after scheduling left no way out but posting it
                            or pushing the date back forever. */}
                        <button type="button" disabled={busy === r.id} onClick={() => openFeedback(r, "kill")} style={btn("#ff4d5e")}>
                          DON&apos;T POST
                        </button>
                      </>
                    )}

                    {r.status === "approved" && (
                      <button type="button" disabled={busy === r.id} onClick={() => move(r, "rejected")} style={btn("#ff4d5e")}>
                        DON&apos;T POST
                      </button>
                    )}

                    {/* A posted item has nowhere sensible to be "undone" to.
                        The real action is pulling it down, which is recorded as
                        delisted so it stays distinct from never having run. */}
                    {r.status === "posted" && (
                      <button type="button" disabled={busy === r.id}
                        onClick={() => { if (window.confirm("Recall this post?\n\nRemove it from the social account first — this only records that it came down. It moves to Delisted and can be re-approved later.")) move(r, "delisted"); }}
                        style={btn("#ffb454")}>
                        RECALL POST
                      </button>
                    )}

                    {(r.status === "rejected" || r.status === "delisted") && (
                      <button type="button" disabled={busy === r.id}
                        onClick={() => move(r, "proposed")}
                        style={btn("#1c7a86")}>
                        BACK TO REVIEW
                      </button>
                    )}
                  </div>

                  {/* WHAT IS WRONG WITH IT — the panel that replaced the
                      duplicate preview.
                      Two decisions in one place, because they are the same
                      thought: pick what is wrong, then say whether the post
                      survives it. "Wrong photo or clip" is the case that had
                      nowhere to go before — the caption was fine and the only
                      options were to accept a post he did not want or kill one
                      he did. */}
                  {feedback && feedback.id === r.id && (
                    <div style={{ marginTop: 12, border: "1px solid rgba(232,106,168,0.45)", borderRadius: 6, background: "rgba(232,106,168,0.06)", padding: "11px 12px" }}>
                      <div style={{ fontSize: 10.5, letterSpacing: "0.08em", color: "#e86aa8", fontWeight: 700, marginBottom: 9 }}>
                        WHAT&apos;S WRONG WITH IT?
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                        {REVIEW_REASONS.map((reason) => {
                          const picked = feedback.reason === reason.id;
                          return (
                            <button key={reason.id} type="button"
                              onClick={() => setFeedback((f) => ({ ...f, reason: reason.id }))}
                              style={{
                                background: picked ? "#e86aa8" : "transparent",
                                color: picked ? "#04070a" : "#dffcff",
                                border: `1px solid ${picked ? "#e86aa8" : "rgba(223,252,255,0.25)"}`,
                                borderRadius: 4, padding: "5px 10px", fontSize: 11.5,
                                fontWeight: picked ? 700 : 500, cursor: "pointer",
                              }}>
                              {reason.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* The hint for the picked reason, so the list can stay
                          short labels without losing what each one means. */}
                      <div style={{ fontSize: 11.5, color: "#dffcff", opacity: 0.7, minHeight: 17, margin: "6px 0 8px" }}>
                        {(REVIEW_REASONS.find((x) => x.id === feedback.reason) || {}).hint || "Pick one — it is what makes the queue learn."}
                      </div>

                      <textarea
                        value={feedback.note}
                        onChange={(e) => setFeedback((f) => ({ ...f, note: e.target.value }))}
                        placeholder="Anything else worth saying (optional)"
                        rows={2}
                        style={{
                          width: "100%", boxSizing: "border-box", resize: "vertical",
                          background: "rgba(0,0,0,0.35)", color: "#dffcff",
                          border: "1px solid rgba(223,252,255,0.2)", borderRadius: 4,
                          padding: "7px 9px", fontSize: 12.5, fontFamily: "inherit", lineHeight: 1.5,
                          marginBottom: 9,
                        }}
                      />

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {/* Keeping the post is the FIRST button, because it is
                            the answer most of these have. */}
                        <button type="button" disabled={!feedback.reason || busy === r.id}
                          onClick={() => submitFeedback(r, "revise")}
                          style={{ ...btn("#e86aa8", true), opacity: feedback.reason ? 1 : 0.4, cursor: feedback.reason ? "pointer" : "not-allowed" }}>
                          KEEP IT — SEND BACK FOR CHANGES
                        </button>
                        <button type="button" disabled={!feedback.reason || busy === r.id}
                          onClick={() => submitFeedback(r, "kill")}
                          style={{ ...btn("#ff4d5e"), opacity: feedback.reason ? 1 : 0.4, cursor: feedback.reason ? "pointer" : "not-allowed" }}>
                          DON&apos;T POST IT AT ALL
                        </button>
                        {/* When the only problem is the clip, the fix is right
                            here rather than two screens away. */}
                        {feedback.reason === "wrong-media" && (
                          <button type="button" disabled={busy === r.id}
                            onClick={() => { setFeedback(null); attachMedia(r); }}
                            style={btn("#ffb454")}>
                            SWAP THE MEDIA NOW
                          </button>
                        )}
                      </div>

                      {!feedback.reason && (
                        <div style={{ fontSize: 11, color: "#ffb454", marginTop: 8 }}>
                          Choose a reason first — it is what lets us count why posts get pulled.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function btn(color, filled) {
  return {
    background: filled ? color : "transparent",
    color: filled ? "#04070a" : color,
    border: filled ? "none" : `1px solid ${color}`,
    borderRadius: 4, padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer",
  };
}
