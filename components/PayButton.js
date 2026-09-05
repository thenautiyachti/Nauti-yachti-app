"use client";

import { useState } from "react";

/**
 * Hands the guest from our payment page to Stripe.
 *
 * The session is created when they click, not when the page loads. Stripe
 * checkout sessions expire after 24 hours, so minting one at page load would
 * mean a link opened on Friday and paid on Saturday hits a dead session — and
 * the guest would see Stripe's own expiry page rather than anything of ours.
 */
export default function PayButton({ bookingId, amount }) {
  const [state, setState] = useState("idle"); // idle | going | error
  const [error, setError] = useState("");

  async function go() {
    setState("going");
    setError("");
    try {
      const res = await fetch("/api/pay/" + bookingId, { method: "POST" });
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
        {state === "going" ? "Taking you to checkout…" : `Pay $${amount} securely`}
      </button>
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
