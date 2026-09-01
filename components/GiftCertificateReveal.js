"use client";

import { useEffect, useState } from "react";

// Shows the certificate minted for this Stripe session.
//
// The certificate is created by the Stripe webhook, which usually lands within
// a second or two of the redirect but is not guaranteed to have arrived by the
// time this page renders. So this polls briefly rather than showing "not found"
// on a race it is expected to win a moment later.
const POLL_MS = 1500;
const MAX_ATTEMPTS = 20; // ~30 seconds before offering the fallback

export default function GiftCertificateReveal() {
  const [state, setState] = useState({ status: "loading", cert: null });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      setState({ status: "nosession", cert: null });
      return;
    }
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      attempts += 1;
      try {
        const res = await fetch(`/api/gift-certificates/by-session?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.ready && data.certificate) {
          setState({ status: "ready", cert: data.certificate });
          return;
        }
      } catch {
        // fall through to retry
      }
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) {
        setState({ status: "slow", cert: null });
        return;
      }
      setTimeout(poll, POLL_MS);
    }
    poll();
    return () => { cancelled = true; };
  }, []);

  if (state.status === "loading") {
    return <Box><span style={{ opacity: 0.75 }}>Confirming your payment…</span></Box>;
  }

  if (state.status === "nosession") {
    return (
      <Box>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          We could not tell which purchase this was. If you have just paid, check your email — and
          if nothing arrives, call or text us on (832) 948-2912 and we will look it up.
        </p>
      </Box>
    );
  }

  if (state.status === "slow") {
    return (
      <Box>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          <strong>Your payment went through.</strong> The certificate is taking a moment longer than
          usual to appear. Refresh this page shortly, or call or text (832) 948-2912 and we will
          read you the code — nothing is lost.
        </p>
      </Box>
    );
  }

  const c = state.cert;
  return (
    <Box>
      <div style={{ fontSize: 13, color: "var(--muted)", letterSpacing: "0.08em", marginBottom: 8 }}>
        GIFT CERTIFICATE CODE
      </div>
      <div className="mono" style={{ fontSize: "clamp(22px, 5vw, 34px)", fontWeight: 800, color: "var(--pink)", letterSpacing: "0.06em", wordBreak: "break-all" }}>
        {c.code}
      </div>
      <div style={{ fontSize: 17, color: "var(--text)", marginTop: 10, fontWeight: 700 }}>
        ${Number(c.initialAmount).toFixed(2)}
        {c.recipientName ? <span style={{ fontWeight: 400, opacity: 0.85 }}> — for {c.recipientName}</span> : null}
      </div>
      {c.message ? (
        <div style={{ fontSize: 15, color: "var(--text)", opacity: 0.85, marginTop: 10, fontStyle: "italic", lineHeight: 1.6 }}>
          “{c.message}”
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
        <button type="button"
          onClick={() => {
            navigator.clipboard?.writeText(c.code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }).catch(() => {});
          }}
          style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {copied ? "Copied ✓" : "Copy code"}
        </button>
        <button type="button" onClick={() => window.print()}
          style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--purple)", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Print
        </button>
      </div>
    </Box>
  );
}

function Box({ children }) {
  return (
    <div style={{
      background: "var(--ink-soft)", border: "1px solid rgba(203,108,230,0.3)",
      borderRadius: 12, padding: 24, color: "var(--text)", fontSize: 15,
    }}>
      {children}
    </div>
  );
}
