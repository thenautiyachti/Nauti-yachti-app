"use client";

import { useState, useEffect } from "react";

/**
 * Hands the guest from our payment page to Stripe.
 *
 * The session is created when they click, not when the page loads. Stripe
 * checkout sessions expire after 24 hours, so minting one at page load would
 * mean a link opened on Friday and paid on Saturday hits a dead session — and
 * the guest would see Stripe's own expiry page rather than anything of ours.
 */
export default function PayButton({ bookingId, amount, initialGiftCode = "" }) {
  const [state, setState] = useState("idle"); // idle | going | error
  const [error, setError] = useState("");
  // A GIFT CERTIFICATE. Checked here only to show the guest what it covers;
  // the server reads the balance again and is the only thing that spends it.
  const [giftOpen, setGiftOpen] = useState(!!initialGiftCode);
  const [giftCode, setGiftCode] = useState(initialGiftCode);
  const [gift, setGift] = useState(null); // { code, applied } once checked
  const [giftMsg, setGiftMsg] = useState("");
  const total = Number(amount) || 0;
  const due = gift ? Math.max(0, Math.round((total - gift.applied) * 100) / 100) : total;

  async function checkGift() {
    setGiftMsg("");
    setGift(null);
    const code = giftCode.trim();
    if (!code) return;
    try {
      const res = await fetch("/api/gift-certificates/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.valid) {
        setGiftMsg(data.reason || "That code was not recognised.");
        return;
      }
      setGift({ code: data.code, applied: Math.min(Number(data.balance) || 0, total) });
    } catch {
      setGiftMsg("We could not check that code. Please try again.");
    }
  }

  // Checked once on arrival when the booking already names a certificate.
  useEffect(() => {
    if (initialGiftCode) checkGift();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    setState("going");
    setError("");
    try {
      const res = await fetch("/api/pay/" + bookingId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gift ? { giftCertificateCode: gift.code } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || "We could not start checkout. Please try again.");
        setState("error");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("We could not start checkout. Please try again.");
      setState("error");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={state === "going"}
        style={{
          width: "100%", background: "linear-gradient(135deg, var(--purple), var(--pink))",
          color: "#0A0612", border: "none", borderRadius: 8, padding: "16px",
          fontWeight: 700, fontSize: 17, opacity: state === "going" ? 0.7 : 1,
        }}
      >
        {state === "going"
          ? (due > 0 ? "Taking you to checkout…" : "Confirming…")
          : (due > 0 ? `Pay $${due} securely` : "Confirm, paid by gift certificate")}
      </button>

      <div style={{ marginTop: 12, textAlign: "center", fontSize: 13.5 }}>
        {!giftOpen ? (
          <button
            type="button"
            onClick={() => setGiftOpen(true)}
            style={{ background: "none", border: "none", color: "var(--purple)", textDecoration: "underline", cursor: "pointer", fontSize: 13.5 }}
          >
            Have a gift certificate?
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
            <label htmlFor="gift-code" style={{ position: "absolute", left: -9999 }}>Gift certificate code</label>
            <input
              id="gift-code"
              type="text"
              value={giftCode}
              placeholder="NY-GIFT-…"
              onChange={(e) => { setGiftCode(e.target.value.toUpperCase()); setGift(null); setGiftMsg(""); }}
              style={{ padding: "9px 11px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14, minWidth: 0, flex: "1 1 160px", maxWidth: 220 }}
            />
            <button
              type="button"
              onClick={checkGift}
              style={{ background: "transparent", border: "1px solid var(--purple)", color: "var(--purple)", borderRadius: 6, padding: "9px 14px", fontWeight: 600, fontSize: 13.5 }}
            >
              Apply
            </button>
          </div>
        )}
        {gift && (
          <div style={{ color: "var(--text)", marginTop: 8 }}>
            Gift certificate {gift.code}: <strong>−${gift.applied.toFixed(2)}</strong>
            {due > 0 ? ` · $${due.toFixed(2)} left to pay` : " · nothing left to pay"}
          </div>
        )}
        {giftMsg && <div style={{ color: "var(--pink)", marginTop: 8 }}>{giftMsg}</div>}
      </div>
      {state === "error" && (
        <div style={{ fontSize: 13.5, color: "var(--pink)", marginTop: 10, textAlign: "center" }}>
          {error}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, textAlign: "center", lineHeight: 1.55 }}>
        Payment is handled by Stripe. Your card details go straight to them and
        never touch our systems.
      </div>
    </div>
  );
}
