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
