"use client";

import { useEffect, useState } from "react";

// The campaign schedule, in the console rather than buried in a markdown file.
//
// Grouped by date because that is how the work actually arrives: on the 8th you
// owe a Facebook post, an Instagram post and a TikTok, and you want all three in
// front of you at once. Status is per platform, because Blotato cannot push a
// still to the Instagram feed — so "done on Facebook, still owed on Instagram"
// is a real and common state.

const PLATFORM_COLOR = {
  Facebook: "#4a9eff",
  Instagram: "#e86aa8",
  TikTok: "#4ff3ff",
  Action: "#ffb454",
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prettyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function CampaignQueuePanel({ campaign = "boatz-and-glowz-2026-09" }) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [copied, setCopied] = useState("");
  const [filter, setFilter] = useState("todo"); // "todo" | "all"

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/campaign-posts?campaign=${encodeURIComponent(campaign)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!cancelled) setPosts(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [campaign]);

  async function setStatus(post, status) {
    // Optimistic — the row updates immediately, the write follows.
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, status, postedAt: status === "posted" ? new Date().toISOString() : null } : p)));
    try {
      await fetch(`/api/campaign-posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      // leave the optimistic state; a refresh will re-read the truth
    }
  }

  function copy(post) {
    navigator.clipboard?.writeText(post.body).then(() => {
      setCopied(post.id);
      setTimeout(() => setCopied(""), 1800);
    }).catch(() => {});
  }

  if (error) return <div style={{ color: "#ff4d5e", fontSize: 12.5 }}>Unable to load the campaign queue.</div>;
  if (!posts) return <div style={{ color: "#1c7a86", fontSize: 12.5 }}>Loading…</div>;
  if (!posts.length) return <div style={{ color: "#1c7a86", fontSize: 12.5, fontStyle: "italic" }}>No campaign scheduled.</div>;

  const today = todayKey();
  const shown = filter === "todo" ? posts.filter((p) => p.status === "pending") : posts;
  const done = posts.filter((p) => p.status === "posted").length;
  const overdue = posts.filter((p) => p.status === "pending" && p.scheduledDate < today).length;

  // Group by date, preserving the sorted order the API returned.
  const byDate = [];
  for (const p of shown) {
    const last = byDate[byDate.length - 1];
    if (last && last.date === p.scheduledDate) last.items.push(p);
    else byDate.push({ date: p.scheduledDate, items: [p] });
  }

  return (
    // Fills the panel: JarvisPanel is a flex column, so this stretches and the
    // list below takes whatever height is left rather than a fixed 420px.
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: "#4ff3ff" }}>
          {done} of {posts.length} posted
        </span>
        {overdue > 0 && (
          <span style={{ fontSize: 11, color: "#0A0612", background: "#ff4d5e", borderRadius: 10, padding: "1px 8px", fontWeight: 700 }}>
            {overdue} overdue
          </span>
        )}
        <button type="button" onClick={() => setFilter(filter === "todo" ? "all" : "todo")}
          style={{ marginLeft: "auto", background: "transparent", color: "#4ff3ff", border: "1px solid rgba(0,217,255,0.35)", borderRadius: 5, padding: "3px 9px", fontSize: 11 }}>
          {filter === "todo" ? "Show all" : "Show to-do only"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 12, flex: 1, minHeight: 160, overflowY: "auto", alignContent: "start" }}>
        {byDate.map((group) => {
          const isToday = group.date === today;
          const isPast = group.date < today;
          return (
            <div key={group.date}>
              <div style={{
                fontSize: 11.5, letterSpacing: "0.08em", marginBottom: 6,
                color: isToday ? "#ffb454" : isPast ? "#ff4d5e" : "#4ff3ff",
                fontWeight: 700,
              }}>
                {prettyDate(group.date).toUpperCase()}
                {isToday ? " · TODAY" : isPast ? " · OVERDUE" : ""}
                {group.items[0].scheduledTime ? ` · ${group.items[0].scheduledTime}` : ""}
                {group.items[0].title ? ` — ${group.items[0].title}` : ""}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {group.items.map((p) => {
                  const open = expanded === p.id;
                  return (
                    <div key={p.id} style={{ border: "1px solid rgba(0,217,255,0.18)", borderRadius: 4, overflow: "hidden" }}>
                      <div role="button" tabIndex={0}
                        onClick={() => setExpanded(open ? null : p.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(open ? null : p.id); }}
                        style={{ padding: "7px 10px", cursor: "pointer", display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "#dffcff" }}>
                        <span style={{ color: PLATFORM_COLOR[p.platform] || "#4ff3ff", fontWeight: 700, minWidth: 68 }}>
                          {p.platform}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: p.status === "posted" ? 0.5 : 1, textDecoration: p.status === "posted" ? "line-through" : "none" }}>
                          {p.body.split("\n")[0]}
                        </span>
                        {p.status === "posted" && <span style={{ fontSize: 10, color: "#7FE0B8" }}>POSTED</span>}
                        {p.status === "skipped" && <span style={{ fontSize: 10, color: "#1c7a86" }}>SKIPPED</span>}
                        <span style={{ color: "#4ff3ff", fontSize: 10 }}>{open ? "✕" : "▼"}</span>
                      </div>
                      {open && (
                        <div style={{ padding: "0 10px 10px" }}>
                          {p.photoHint && (
                            <div style={{ fontSize: 11.5, color: "#ffb454", marginBottom: 6 }}>📷 {p.photoHint}</div>
                          )}
                          {p.deliveryNote && (
                            <div style={{ fontSize: 11.5, color: "#4ff3ff", opacity: 0.8, marginBottom: 6 }}>{p.deliveryNote}</div>
                          )}
                          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, color: "#dffcff", lineHeight: 1.5, margin: "0 0 10px", background: "rgba(0,0,0,0.3)", padding: 10, borderRadius: 4 }}>
                            {p.body}
                          </pre>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button type="button" onClick={() => copy(p)}
                              className="jarvis-font"
                              style={{ background: "#00d9ff", color: "#04070a", border: "none", borderRadius: 4, padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
                              {copied === p.id ? "COPIED ✓" : "COPY"}
                            </button>
                            {p.status !== "posted" && (
                              <button type="button" onClick={() => setStatus(p, "posted")}
                                className="jarvis-font"
                                style={{ background: "transparent", color: "#7FE0B8", border: "1px solid #7FE0B8", borderRadius: 4, padding: "6px 12px", fontSize: 11, fontWeight: 700 }}>
                                MARK POSTED
                              </button>
                            )}
                            {p.status === "posted" && (
                              <button type="button" onClick={() => setStatus(p, "pending")}
                                className="jarvis-font"
                                style={{ background: "transparent", color: "#1c7a86", border: "1px solid rgba(0,217,255,0.3)", borderRadius: 4, padding: "6px 12px", fontSize: 11, fontWeight: 700 }}>
                                UNDO
                              </button>
                            )}
                            {p.status === "pending" && (
                              <button type="button" onClick={() => setStatus(p, "skipped")}
                                className="jarvis-font"
                                style={{ background: "transparent", color: "#1c7a86", border: "1px solid rgba(0,217,255,0.3)", borderRadius: 4, padding: "6px 12px", fontSize: 11, fontWeight: 700 }}>
                                SKIP
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
