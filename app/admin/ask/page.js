"use client";

// The dock page: who to ask for a Google review, on a phone, right now.
//
// The console already drafts these asks, but it is a desktop tool and an sms:
// link needs a phone — so the ask kept ending up as an evening job at a desk,
// which is where it stops happening. Three same-day reviews arrived on
// 2 September from three asks, so the wording is not the problem; the distance
// between "I should ask" and "asked" is.
//
// One screen, one tap per guest, biggest thumb targets available.
import { useState, useEffect, useCallback } from "react";
import { smsHref, reviewMessage, daysSince, askWindow, ASK_WINDOWS, GOOGLE_REVIEW_URL } from "../../../lib/reviews";

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options && options.headers) },
  });
  if (!res.ok) throw new Error("Request failed: " + path);
  return res.json();
}

export default function AskPage() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [canText, setCanText] = useState(true);

  useEffect(() => {
    api("/api/admin/session").then((r) => setAuthed(r.authenticated)).catch(() => {}).finally(() => setChecking(false));
  }, []);

  // A desktop has nothing to hand an sms: link to. Checked after mount because
  // navigator does not exist on the server.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    setCanText(/iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (navigator.maxTouchPoints || 0) > 0);
  }, []);

  const load = useCallback(async () => {
    try {
      const bookings = await api("/api/external-bookings");
      const today = new Date();
      const list = bookings
        .filter((b) => b.status === "completed" && b.phone && !b.marketingOptOut)
        .map((b) => {
          const days = daysSince(b.date, today);
          return { ...b, days, window: askWindow(days) };
        })
        .filter((b) => b.days != null && b.days >= 0)
        // Warmest first: a charter three days ago converts far better than one
        // from March, so the top of the list is where the value is.
        .sort((a, b) => a.days - b.days);
      setRows(list);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  async function login(e) {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) { setLoginError("That passcode did not work."); return; }
      setAuthed(true);
    } catch { setLoginError("Could not reach the server."); }
  }

  async function mark(row, on) {
    setBusy(row.id);
    // Optimistic: the card moves as the thumb lifts, the write follows.
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, reviewRequestedAt: on ? new Date().toISOString() : null } : r)));
    try {
      await api("/api/external-bookings/" + row.id, {
        method: "PATCH",
        body: JSON.stringify({ reviewRequestedAt: on ? new Date().toISOString() : null }),
      });
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, reviewRequestedAt: on ? null : row.reviewRequestedAt } : r)));
    } finally {
      setBusy("");
    }
  }

  const S = {
    page: { minHeight: "100vh", background: "var(--ink, #0A0612)", color: "var(--text, #ECE7F5)", padding: "16px 14px 60px", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
    card: { background: "var(--card, #171029)", border: "1px solid rgba(203,108,230,0.2)", borderRadius: 12, padding: 14, marginBottom: 10 },
    tap: { display: "block", width: "100%", textAlign: "center", padding: "15px 12px", borderRadius: 10, fontSize: 17, fontWeight: 800, textDecoration: "none", border: "none" },
  };

  if (checking) return <div style={S.page}>Checking…</div>;

  if (!authed) {
    return (
      <div style={S.page}>
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Ask for reviews</h1>
        <form onSubmit={login} style={{ display: "grid", gap: 10, maxWidth: 340 }}>
          <input
            type="password" inputMode="text" autoComplete="current-password"
            placeholder="Passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)}
            style={{ padding: "14px 12px", fontSize: 17, borderRadius: 10, border: "1px solid rgba(203,108,230,0.4)", background: "var(--card, #171029)", color: "inherit" }}
          />
          <button type="submit" style={{ ...S.tap, background: "var(--purple, #CB6CE6)", color: "#0A0612" }}>Open</button>
          {loginError && <div style={{ color: "#E2685F", fontSize: 14 }}>{loginError}</div>}
        </form>
      </div>
    );
  }

  const todo = rows.filter((r) => !r.reviewRequestedAt);
  const done = rows.filter((r) => r.reviewRequestedAt);
  const shown = showDone ? done : todo;

  return (
    <div style={S.page}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 style={{ fontSize: 21, margin: 0 }}>Ask for reviews</h1>
        <a href="/admin" style={{ color: "var(--purple, #CB6CE6)", fontSize: 14, textDecoration: "none" }}>Console →</a>
      </div>
      <p style={{ color: "var(--muted, #9A8FB4)", fontSize: 13.5, margin: "0 0 14px" }}>
        Warmest first. Tapping opens your messages app with the wording already written — you still send it.
      </p>

      {!canText && (
        <div style={{ ...S.card, borderColor: "#E8934A" }}>
          <strong style={{ color: "#E8934A" }}>This is a phone page.</strong>
          <div style={{ color: "var(--muted, #9A8FB4)", fontSize: 14, marginTop: 4 }}>
            A desktop has nothing to hand a text link to. Open this on your phone, or use Copy below and send it another way.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["todo", "To ask", todo.length], ["done", "Asked", done.length]].map(([id, label, n]) => {
          const active = (id === "done") === showDone;
          return (
            <button
              key={id} type="button" onClick={() => setShowDone(id === "done")}
              style={{
                flex: 1, padding: "11px 8px", borderRadius: 9, fontSize: 15, fontWeight: 700,
                border: "1px solid var(--purple, #CB6CE6)",
                background: active ? "var(--purple, #CB6CE6)" : "transparent",
                color: active ? "#0A0612" : "var(--text, #ECE7F5)",
              }}
            >
              {label} ({n})
            </button>
          );
        })}
      </div>

      {shown.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: "var(--muted, #9A8FB4)" }}>
          {showDone ? "Nobody asked yet." : "Everyone with a phone number has been asked. "}
        </div>
      )}

      {shown.map((r) => {
        const msg = reviewMessage("sms", { name: r.guestName, date: r.date, vesselName: r.vessel }, new Date());
        const href = smsHref(r.phone, msg);
        const w = ASK_WINDOWS[r.window] || ASK_WINDOWS.cold;
        return (
          <div key={r.id} style={S.card}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 17 }}>{r.guestName || "Guest"}</strong>
              <span style={{ fontSize: 12.5, color: w.color, fontWeight: 700, whiteSpace: "nowrap" }}>{w.label}</span>
            </div>
            <div style={{ color: "var(--muted, #9A8FB4)", fontSize: 13.5, margin: "2px 0 12px" }}>
              {r.date} · {r.days === 0 ? "today" : r.days === 1 ? "yesterday" : r.days + " days ago"}
              {r.vessel && r.vessel !== "undefined" ? " · " + r.vessel : ""}
            </div>

            {!r.reviewRequestedAt ? (
              <div style={{ display: "grid", gap: 8 }}>
                {href && (
                  <a
                    href={href}
                    onClick={() => { if (canText) mark(r, true); }}
                    style={{ ...S.tap, background: canText ? "var(--pink, #E86AA8)" : "transparent", color: canText ? "#0A0612" : "var(--muted, #9A8FB4)", border: canText ? "none" : "1px solid rgba(203,108,230,0.3)" }}
                  >
                    {canText ? "Text " + (r.guestName || "them").split(" ")[0] : "Text it (phone only)"}
                  </a>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard && navigator.clipboard.writeText(msg)}
                    style={{ flex: 1, padding: "11px", borderRadius: 9, fontSize: 14.5, fontWeight: 700, background: "transparent", color: "var(--text, #ECE7F5)", border: "1px solid rgba(203,108,230,0.35)" }}
                  >
                    Copy wording
                  </button>
                  <button
                    type="button" disabled={busy === r.id}
                    onClick={() => mark(r, true)}
                    style={{ flex: 1, padding: "11px", borderRadius: 9, fontSize: 14.5, fontWeight: 700, background: "transparent", color: "var(--muted, #9A8FB4)", border: "1px solid rgba(203,108,230,0.25)" }}
                  >
                    Mark asked
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "#7FE0B8", fontSize: 14.5, fontWeight: 700 }}>
                  Asked {String(r.reviewRequestedAt).slice(0, 10)}
                </span>
                <button
                  type="button" disabled={busy === r.id} onClick={() => mark(r, false)}
                  style={{ padding: "9px 14px", borderRadius: 8, fontSize: 13.5, background: "transparent", color: "var(--muted, #9A8FB4)", border: "1px solid rgba(203,108,230,0.25)" }}
                >
                  Undo
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={{ fontSize: 13.5, color: "var(--muted, #9A8FB4)", marginBottom: 8 }}>
          Say it out loud at the dock instead — it converts better than any message:
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.55 }}>
          &ldquo;We&rsquo;re a small local outfit and Google reviews are how people find us. If you get a sec
          tonight, search <strong>The Nauti Yachti</strong> and leave an honest review. Means the world.&rdquo;
        </div>
        <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: 10, color: "var(--purple, #CB6CE6)", fontSize: 13.5 }}>
          Open the review link yourself →
        </a>
      </div>
    </div>
  );
}
