"use client";

import { useState } from "react";

// The form on /trip. Posts to /api/trip/sign-in and follows the link it returns.
const FIELD = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16,
  borderRadius: 10, border: "1px solid rgba(203,108,230,0.35)",
  background: "var(--ink)", color: "var(--text)",
};
const LABEL = { display: "block", fontSize: 13, color: "var(--muted)", margin: "0 0 6px" };

export default function TripSignIn() {
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A returning guest: every trip on the phone they signed in with (3 Oct 2026).
  const [trips, setTrips] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/trip/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, phone }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(body.trips) && body.trips.length > 1) {
        setTrips(body.trips);
        setBusy(false);
        return;
      }
      if (res.ok && body.path) {
        window.location.assign(body.path);
        return;
      }
      setError(body.error || "Something went wrong. Try again in a moment.");
    } catch {
      setError("We couldn't reach the site. Check your signal and try again.");
    }
    setBusy(false);
  }

  if (trips) {
    const today = new Date().toISOString().slice(0, 10);
    const pretty = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "Date to be set");
    return (
      <div style={{ background: "var(--ink)", borderRadius: 14, padding: 20, border: "1px solid rgba(203,108,230,0.18)" }}>
        <p style={{ color: "var(--text)", fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>
          Welcome back. You have {trips.length} trips with us.
        </p>
        <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.55, margin: "0 0 14px" }}>
          Each has its own page, with its own photos. Pick one; you can come back here for the others.
        </p>
        <div style={{ display: "grid", gap: 9 }}>
          {trips.map((t) => (
            <a key={t.ref} href={t.path || "#"}
              style={{
                display: "block", textDecoration: "none", color: "var(--text)",
                padding: "12px 14px", borderRadius: 10,
                border: "1px solid " + (t.asked ? "var(--purple)" : "rgba(203,108,230,0.3)"),
                background: t.asked ? "rgba(203,108,230,0.1)" : "transparent",
              }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>
                {pretty(t.date)}{t.date && t.date >= today ? " · upcoming" : ""}
              </span>
              <span style={{ display: "block", fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                {[t.packageName, t.vesselName].filter(Boolean).join(" · ") || t.ref}
                {t.asked ? " · the one you signed in with" : ""}
              </span>
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ background: "var(--ink)", borderRadius: 14, padding: 20, border: "1px solid rgba(203,108,230,0.18)" }}>
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="trip-ref" style={LABEL}>Booking number</label>
        <input id="trip-ref" value={ref} onChange={(e) => setRef(e.target.value)} required
          placeholder="NY-20261010-01" autoCapitalize="characters" autoComplete="off" style={FIELD} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <label htmlFor="trip-phone" style={LABEL}>Phone number on the booking</label>
        <input id="trip-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required
          type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 555-5555" style={FIELD} />
      </div>
      {error && <p role="alert" style={{ color: "var(--pink)", fontSize: 14, lineHeight: 1.5, margin: "0 0 14px" }}>{error}</p>}
      <button type="submit" disabled={busy}
        style={{
          width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))",
          color: "#0A0612", border: "none", borderRadius: 8, padding: "14px",
          fontWeight: 700, fontSize: 16, opacity: busy ? 0.7 : 1, cursor: busy ? "wait" : "pointer",
        }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
