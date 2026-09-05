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

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
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

  // Engine hours. Thirteen maintenance items are configured against hour
  // intervals and not one has ever been judged, because no reading has ever
  // been taken -- which is how a breakdown reached the 4th of July unannounced.
  const [screen, setScreen] = useState("ask"); // "ask" | "hours" | "arriving"
  const [vessels, setVessels] = useState([]);
  const [logs, setLogs] = useState([]);
  const [hoursForm, setHoursForm] = useState({ vesselId: "", hours: "", note: "" });
  const [hoursSaved, setHoursSaved] = useState("");

  // Guests arriving today, and the gate code to send them.
  //
  // The code is deliberately NOT in the booking confirmation: an email is
  // forwarded and kept forever, so mailing it would leave every past guest with
  // working access to a private residence. It is texted on the morning instead
  // — and the risk with a manual step is forgetting it, which strands a party
  // of twelve at a gate. So it lives here, one tap from the booking.
  const [arriving, setArriving] = useState([]);
  const [dock, setDock] = useState(null);

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

  // Who is coming today or tomorrow, and still needs the gate code.
  const loadArriving = useCallback(async () => {
    try {
      const [bookings, info] = await Promise.all([
        api("/api/external-bookings"),
        api("/api/admin/dock-info"),
      ]);
      setDock(info);
      const today = todayKey();
      const t = new Date();
      const tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
      const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
      // Only charters that are actually happening — a lapsed enquiry must never
      // be handed a gate code.
      const list = (bookings || [])
        .filter((b) => (b.date === today || b.date === tomorrowKey) && b.status === "booked" && b.phone)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) ||
          String(a.startTime || "").localeCompare(String(b.startTime || "")));
      setArriving(list.map((b) => ({ ...b, when: b.date === today ? "today" : "tomorrow" })));
    } catch {
      setArriving([]);
    }
  }, []);

  const loadHours = useCallback(async () => {
    try {
      const [v, l] = await Promise.all([api("/api/vessels"), api("/api/engine-hours")]);
      setVessels(v);
      setLogs(l);
      setHoursForm((f) => ({ ...f, vesselId: f.vesselId || (v[0] && v[0].id) || "" }));
    } catch { /* the ask list still works without this */ }
  }, []);

  useEffect(() => { if (authed) { load(); loadHours(); loadArriving(); } }, [authed, load, loadHours, loadArriving]);

  // The last reading for a boat, so a new one can be sanity-checked against it.
  function lastFor(vesselId) {
    return logs.filter((l) => l.vesselId === vesselId).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  async function saveHours(e) {
    e.preventDefault();
    const hours = Number(hoursForm.hours);
    if (!hoursForm.vesselId || !Number.isFinite(hours) || hours <= 0) return;
    const last = lastFor(hoursForm.vesselId);
    // An hour meter only counts up. A lower number is a typo or the wrong boat,
    // and saving it would corrupt every interval calculated from it.
    if (last && hours < Number(last.hours)) {
      window.alert(
        "That is lower than the last reading for this boat (" + last.hours + " on " + last.date + ").\n\n" +
        "An hour meter only goes up, so this is probably a typo or the wrong boat."
      );
      return;
    }
    setBusy("hours");
    try {
      await api("/api/engine-hours", {
        method: "POST",
        body: JSON.stringify({ vesselId: hoursForm.vesselId, date: todayKey(), hours, note: hoursForm.note || null }),
      });
      const name = (vessels.find((v) => v.id === hoursForm.vesselId) || {}).name || "the boat";
      setHoursSaved(name + " logged at " + hours + " hours");
      setHoursForm((f) => ({ ...f, hours: "", note: "" }));
      loadHours();
      setTimeout(() => setHoursSaved(""), 4000);
    } catch {
      window.alert("Could not save that. Check signal and try again.");
    } finally {
      setBusy("");
    }
  }

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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ fontSize: 21, margin: 0 }}>On the dock</h1>
        <a href="/admin" style={{ color: "var(--purple, #CB6CE6)", fontSize: 14, textDecoration: "none" }}>Console →</a>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["arriving", arriving.length ? `Arriving (${arriving.length})` : "Arriving"],
          ["ask", "Reviews"], ["hours", "Engine hours"]].map(([id, label]) => (
          <button
            key={id} type="button" onClick={() => setScreen(id)}
            style={{
              flex: 1, padding: "12px 6px", borderRadius: 10, fontSize: 14.5, fontWeight: 700,
              border: "1px solid var(--purple, #CB6CE6)",
              background: screen === id ? "var(--purple, #CB6CE6)" : "transparent",
              color: screen === id ? "#0A0612" : "var(--text, #ECE7F5)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {screen === "arriving" && (
        <div>
          <p style={{ color: "var(--muted, #9A8FB4)", fontSize: 13.5, margin: "0 0 14px" }}>
            Guests coming today or tomorrow. The gate code is deliberately not in their
            confirmation email — an email gets forwarded and kept, and the code opens a
            private gate. Send it here on the morning instead.
          </p>

          {!dock?.gateCode && (
            <div style={{
              border: "1px solid #E8934A", borderRadius: 10, padding: "12px 14px",
              marginBottom: 14, fontSize: 13.5, color: "var(--text, #ECE7F5)", lineHeight: 1.55,
            }}>
              <strong style={{ color: "#E8934A" }}>No gate code is configured.</strong> Set
              <span className="mono"> DOCK_GATE_CODE</span> and
              <span className="mono"> DOCK_ADDRESS</span> in the Vercel environment and this
              writes the whole message for you.
            </div>
          )}

          {arriving.length === 0 && (
            <p style={{ color: "var(--muted, #9A8FB4)", fontSize: 14 }}>
              Nobody booked for today or tomorrow.
            </p>
          )}

          {arriving.map((b) => {
            const first = String(b.guestName || "").trim().split(/\s+/)[0] || "there";
            const start = b.startTime ? ` at ${b.startTime}` : "";
            const msg = [
              `Hi ${first}! Austin from The Nauti Yachti — looking forward to seeing you ${b.when}${start}.`,
              "",
              dock?.address ? `We're at ${dock.address}.` : null,
              dock?.gateCode ? `Gate code is ${dock.gateCode}.` : null,
              `Parking is on site right by the dock, so you can unload straight onto the boat.`,
              "",
              `Try to arrive about ${dock?.arriveMinutesEarly || 15} minutes early so boarding doesn't eat into your hours.`,
              "",
              `Any trouble finding us, just call or text.`,
            ].filter((l) => l !== null).join("\n");
            const href = smsHref(b.phone, msg);
            return (
              <div key={b.id} style={{
                border: "1px solid rgba(203,108,230,0.3)", borderRadius: 10,
                padding: "14px 16px", marginBottom: 12,
              }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text, #ECE7F5)" }}>
                  {b.guestName || "Guest"}
                </div>
                <div style={{ fontSize: 13.5, color: "var(--muted, #9A8FB4)", marginBottom: 10 }}>
                  {b.when} · {b.vesselName}{b.startTime ? ` · ${b.startTime}` : ""}
                  {b.hours ? ` · ${b.hours}h` : ""}{b.partySize ? ` · ${b.partySize} guests` : ""}
                </div>
                {href ? (
                  <a href={href} style={{
                    display: "block", textAlign: "center", background: "var(--purple, #CB6CE6)",
                    color: "#0A0612", borderRadius: 8, padding: "13px", fontSize: 15.5,
                    fontWeight: 700, textDecoration: "none",
                  }}>
                    Text {first} the gate code
                  </a>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--muted, #9A8FB4)" }}>
                    No usable phone number on this booking.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {screen === "hours" && (
        <div>
          <p style={{ color: "var(--muted, #9A8FB4)", fontSize: 13.5, margin: "0 0 14px" }}>
            One reading after each outing. Thirteen service items are already set up against hour
            intervals — they stay unjudgeable until this has numbers in it.
          </p>

          {hoursSaved && (
            <div style={{ ...S.card, borderColor: "#7FE0B8" }}>
              <strong style={{ color: "#7FE0B8" }}>{hoursSaved}</strong>
            </div>
          )}

          <form onSubmit={saveHours} style={{ ...S.card, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              {vessels.map((v) => {
                const last = lastFor(v.id);
                const on = hoursForm.vesselId === v.id;
                return (
                  <button
                    key={v.id} type="button" onClick={() => setHoursForm((f) => ({ ...f, vesselId: v.id }))}
                    style={{
                      textAlign: "left", padding: "13px 14px", borderRadius: 10, fontSize: 16, fontWeight: 700,
                      border: "1px solid " + (on ? "var(--purple, #CB6CE6)" : "rgba(203,108,230,0.3)"),
                      background: on ? "rgba(203,108,230,0.18)" : "transparent",
                      color: "var(--text, #ECE7F5)",
                    }}
                  >
                    {v.name}
                    <div style={{ fontSize: 12.5, fontWeight: 400, color: "var(--muted, #9A8FB4)", marginTop: 2 }}>
                      {last ? "last logged " + last.hours + " hrs on " + last.date : "never logged"}
                    </div>
                  </button>
                );
              })}
            </div>

            <input
              type="number" inputMode="decimal" step="0.1" min="0" required
              placeholder="Hour meter reading"
              value={hoursForm.hours}
              onChange={(e) => setHoursForm((f) => ({ ...f, hours: e.target.value }))}
              style={{ padding: "15px 13px", fontSize: 19, borderRadius: 10, border: "1px solid rgba(203,108,230,0.4)", background: "var(--card, #171029)", color: "inherit", fontVariantNumeric: "tabular-nums" }}
            />
            <input
              type="text" placeholder="Anything worth noting (optional)"
              value={hoursForm.note}
              onChange={(e) => setHoursForm((f) => ({ ...f, note: e.target.value }))}
              style={{ padding: "13px", fontSize: 15.5, borderRadius: 10, border: "1px solid rgba(203,108,230,0.3)", background: "var(--card, #171029)", color: "inherit" }}
            />
            <button
              type="submit" disabled={busy === "hours" || !hoursForm.vesselId}
              style={{ ...S.tap, background: "var(--pink, #E86AA8)", color: "#0A0612", opacity: hoursForm.vesselId ? 1 : 0.5 }}
            >
              {busy === "hours" ? "Saving…" : "Log it"}
            </button>
          </form>

          {logs.length > 0 && (
            <div style={S.card}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15 }}>Recent readings</div>
              {logs.slice(0, 8).map((l) => {
                const v = vessels.find((x) => x.id === l.vesselId);
                return (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(203,108,230,0.1)", fontSize: 14 }}>
                    <span>{(v && v.name) || l.vesselId}</span>
                    <span style={{ color: "var(--muted, #9A8FB4)", fontVariantNumeric: "tabular-nums" }}>{l.hours} hrs · {l.date}</span>
                  </div>
                );
              })}
            </div>
          )}
          {logs.length === 0 && (
            <div style={{ ...S.card, color: "var(--muted, #9A8FB4)", fontSize: 14 }}>
              Nothing logged yet. The first reading is the one that starts the clock.
            </div>
          )}
        </div>
      )}

      {screen === "ask" && (
      <>
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
      </>
      )}
    </div>
  );
}
