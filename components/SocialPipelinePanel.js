"use client";

import { Fragment, useEffect, useState } from "react";

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
  { id: "approved", label: "Approved", color: "#4ff3ff", blurb: "Needs a date" },
  { id: "scheduled", label: "Scheduled", color: "#00d9ff", blurb: "Ready to go out" },
  { id: "posted", label: "Posted", color: "#7FE0B8", blurb: "Done" },
  { id: "rejected", label: "Rejected", color: "#ff4d5e", blurb: "Not going out" },
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
    ? rows.filter((r) => r.status !== "posted" && r.status !== "rejected")
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
                  {r.reviewNote && <div style={{ fontSize: 11.5, color: "#1c7a86", marginBottom: 8 }}>{r.reviewNote}</div>}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => copy(r)} className="jarvis-font"
                      style={btn("#00d9ff", true)}>
                      {copied === r.id ? "COPIED ✓" : "COPY"}
                    </button>

                    {r.status === "proposed" && (
                      <>
                        <button type="button" disabled={busy === r.id} onClick={() => move(r, "approved")} className="jarvis-font" style={btn("#4ff3ff")}>
                          APPROVE
                        </button>
                        <button type="button" disabled={busy === r.id} onClick={() => move(r, "rejected")} className="jarvis-font" style={btn("#ff4d5e")}>
                          REJECT
                        </button>
                      </>
                    )}

                    {r.status === "approved" && (
                      <button type="button" disabled={busy === r.id} onClick={() => schedule(r)} className="jarvis-font" style={btn("#00d9ff")}>
                        SCHEDULE…
                      </button>
                    )}

                    {r.status === "scheduled" && (
                      <>
                        <button type="button" disabled={busy === r.id} onClick={() => move(r, "posted")} className="jarvis-font" style={btn("#7FE0B8")}>
                          MARK POSTED
                        </button>
                        <button type="button" disabled={busy === r.id} onClick={() => schedule(r)} className="jarvis-font" style={btn("#4ff3ff")}>
                          RESCHEDULE
                        </button>
                        {/* Killing a scheduled post was impossible before: reject
                            only existed at the proposal stage, so changing your
                            mind after scheduling left no way out but posting it
                            or pushing the date back forever. */}
                        <button type="button" disabled={busy === r.id} onClick={() => move(r, "rejected")} className="jarvis-font" style={btn("#ff4d5e")}>
                          DON&apos;T POST
                        </button>
                      </>
                    )}

                    {r.status === "approved" && (
                      <button type="button" disabled={busy === r.id} onClick={() => move(r, "rejected")} className="jarvis-font" style={btn("#ff4d5e")}>
                        DON&apos;T POST
                      </button>
                    )}

                    {(r.status === "posted" || r.status === "rejected") && (
                      <button type="button" disabled={busy === r.id}
                        onClick={() => move(r, r.scheduledDate ? "scheduled" : "approved")}
                        className="jarvis-font" style={btn("#1c7a86")}>
                        UNDO
                      </button>
                    )}
                  </div>
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
