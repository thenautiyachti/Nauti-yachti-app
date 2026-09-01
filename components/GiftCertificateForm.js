"use client";

import { useState } from "react";

// Preset values chosen to map onto real charters rather than round numbers for
// their own sake: $150 covers a short hourly trip, $250 a decent chunk of one,
// $500 most of a half-day, and $570 is exactly the base package price — so a
// buyer can gift "a whole charter" without doing arithmetic.
const PRESETS = [150, 250, 500, 570];
const MIN_AMOUNT = 25;
const MAX_AMOUNT = 5000;

const INPUT = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 8,
  border: "1px solid rgba(203,108,230,0.3)",
  background: "var(--ink)",
  color: "var(--text)",
  fontSize: 15,
  marginBottom: 12,
};

export default function GiftCertificateForm() {
  const [amount, setAmount] = useState(250);
  const [custom, setCustom] = useState("");
  const [form, setForm] = useState({
    purchaserName: "",
    purchaserEmail: "",
    purchaserPhone: "",
    recipientName: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chosen = custom ? Number(custom) : amount;
  const validAmount = Number.isFinite(chosen) && chosen >= MIN_AMOUNT && chosen <= MAX_AMOUNT && chosen % 1 === 0;

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!validAmount) {
      setError(`Please choose a whole dollar amount between $${MIN_AMOUNT} and $${MAX_AMOUNT}.`);
      return;
    }
    if (!form.purchaserEmail) {
      setError("We need your email so we can send you the certificate.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/gift-certificates/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: chosen }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Something went wrong starting checkout. Please try again.");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not reach the payment page. Please check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>Amount</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {PRESETS.map((v) => {
          const active = !custom && amount === v;
          return (
            <button key={v} type="button"
              onClick={() => { setAmount(v); setCustom(""); }}
              style={{
                background: active ? "var(--purple)" : "transparent",
                color: active ? "#0A0612" : "var(--text)",
                border: "1px solid var(--purple)", borderRadius: 8,
                padding: "10px 18px", fontSize: 15, fontWeight: 700, cursor: "pointer",
              }}>
              ${v}
            </button>
          );
        })}
      </div>
      <input
        type="number" inputMode="numeric" min={MIN_AMOUNT} max={MAX_AMOUNT} step="1"
        placeholder={`Or another amount ($${MIN_AMOUNT}–$${MAX_AMOUNT})`}
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        style={INPUT}
      />

      <div style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0", fontWeight: 600 }}>Your details</div>
      <input type="text" placeholder="Your name" value={form.purchaserName}
        onChange={(e) => setForm({ ...form, purchaserName: e.target.value })} style={INPUT} />
      <input type="email" required placeholder="Your email — we send the certificate here"
        value={form.purchaserEmail}
        onChange={(e) => setForm({ ...form, purchaserEmail: e.target.value })} style={INPUT} />
      <input type="tel" placeholder="Your phone (optional)" value={form.purchaserPhone}
        onChange={(e) => setForm({ ...form, purchaserPhone: e.target.value })} style={INPUT} />

      <div style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0", fontWeight: 600 }}>Who it&rsquo;s for</div>
      <input type="text" placeholder="Recipient's name (optional)" value={form.recipientName}
        onChange={(e) => setForm({ ...form, recipientName: e.target.value })} style={INPUT} />
      <textarea rows={3} placeholder="A short message to print on it (optional)"
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
        style={{ ...INPUT, resize: "vertical" }} />

      {error && (
        <div style={{ color: "#ff8fa8", fontSize: 14, marginBottom: 12 }}>{error}</div>
      )}

      <button type="submit" disabled={busy || !validAmount}
        style={{
          width: "100%", background: validAmount ? "var(--pink)" : "rgba(232,106,168,0.4)",
          color: "#0A0612", border: "none", borderRadius: 8, padding: "14px 18px",
          fontSize: 16, fontWeight: 800, cursor: busy || !validAmount ? "default" : "pointer",
        }}>
        {busy ? "Taking you to checkout…" : validAmount ? `Buy a $${chosen} gift certificate` : "Choose an amount"}
      </button>
      <p style={{ fontSize: 13, color: "var(--text)", opacity: 0.7, lineHeight: 1.6, marginTop: 12 }}>
        Payment is handled by Stripe — we never see your card details. The certificate code appears
        as soon as payment goes through, so you can print it or forward it straight away.
      </p>
    </form>
  );
}
