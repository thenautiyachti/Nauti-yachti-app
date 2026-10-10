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
export default function PayButton({ bookingId, amount, initialGiftCode = "", initialCouponCode = "" }) {
  const [state, setState] = useState("idle"); // idle | going | error
  const [error, setError] = useState("");
  // A GIFT CERTIFICATE. Checked here only to show the guest what it covers;
  // the server reads the balance again and is the only thing that spends it.
  const [giftOpen, setGiftOpen] = useState(!!initialGiftCode);
  const [giftCode, setGiftCode] = useState(initialGiftCode);
  const [gift, setGift] = useState(null); // { code, applied } once checked
  const [giftMsg, setGiftMsg] = useState("");
  // A COUPON CODE (owner, 10 Oct 2026: "all payment links need to have a place
  // to input our coupon code, as our website front page does"). Checked here
  // only to show the new total; the server works the discount out again.
  // Applied before any gift certificate, the same order as the booking form.
  const [couponOpen, setCouponOpen] = useState(!!initialCouponCode);
  const [couponCode, setCouponCode] = useState(initialCouponCode);
  const [coupon, setCoupon] = useState(null); // { code, type, value } once checked
  const [couponMsg, setCouponMsg] = useState("");
  const total = Number(amount) || 0;
  const round = (n) => Math.round(n * 100) / 100;
  const afterCoupon = coupon
    ? round(Math.max(0, coupon.type === "percent" ? total * (1 - coupon.value / 100) : total - coupon.value))
    : total;
  const giftApplied = gift ? Math.min(gift.balance, afterCoupon) : 0;
  const due = round(Math.max(0, afterCoupon - giftApplied));

  async function checkCoupon() {
    setCouponMsg("");
    setCoupon(null);
    const code = couponCode.trim();
    if (!code) return;
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.valid) {
        setCouponMsg(data.reason || "That code was not recognised.");
        return;
      }
      setCoupon({ code: code.toUpperCase(), type: data.discountType, value: Number(data.discountValue) || 0 });
    } catch {
      setCouponMsg("We could not check that code. Please try again.");
    }
  }

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
      setGift({ code: data.code, balance: Number(data.balance) || 0 });
    } catch {
      setGiftMsg("We could not check that code. Please try again.");
    }
  }

  // Checked once on arrival when the booking already names a certificate.
  useEffect(() => {
    if (initialGiftCode) checkGift();
    if (initialCouponCode) checkCoupon();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    setState("going");
    setError("");
    try {
      const res = await fetch("/api/pay/" + bookingId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(coupon ? { couponCode: coupon.code } : {}),
          ...(gift ? { giftCertificateCode: gift.code } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.couponInvalid) {
        setCoupon(null);
        setCouponMsg(data.error || "That code cannot be used.");
        setState("idle");
        return;
      }
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
          : (due > 0 ? `Pay $${Number.isInteger(due) ? due : due.toFixed(2)} securely` : "Confirm, paid by gift certificate")}
      </button>

      <div style={{ marginTop: 12, textAlign: "center", fontSize: 13.5 }}>
        {!couponOpen ? (
          <button
            type="button"
            onClick={() => setCouponOpen(true)}
            style={{ background: "none", border: "none", color: "var(--purple)", textDecoration: "underline", cursor: "pointer", fontSize: 13.5 }}
          >
            Have a coupon code?
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
            <label htmlFor="coupon-code" style={{ position: "absolute", left: -9999 }}>Coupon code</label>
            <input
              id="coupon-code"
              type="text"
              value={couponCode}
              placeholder="Coupon code"
              onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCoupon(null); setCouponMsg(""); }}
              style={{ padding: "9px 11px", borderRadius: 6, border: "1px solid rgba(203,108,230,0.3)", fontSize: 14, minWidth: 0, flex: "1 1 160px", maxWidth: 220 }}
            />
            <button
              type="button"
              onClick={checkCoupon}
              style={{ background: "transparent", border: "1px solid var(--purple)", color: "var(--purple)", borderRadius: 6, padding: "9px 14px", fontWeight: 600, fontSize: 13.5 }}
            >
              Apply
            </button>
          </div>
        )}
        {coupon && (
          <div style={{ color: "var(--text)", marginTop: 8 }}>
            Coupon {coupon.code}: <strong>−${round(total - afterCoupon).toFixed(2)}</strong>
          </div>
        )}
        {couponMsg && <div style={{ color: "var(--pink)", marginTop: 8 }}>{couponMsg}</div>}
      </div>

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
            Gift certificate {gift.code}: <strong>−${giftApplied.toFixed(2)}</strong>
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
