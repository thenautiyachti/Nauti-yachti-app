"use client";

import { useState } from "react";

/**
 * "Send me the photos from today."
 *
 * The form behind the QR code stuck on the boat. It exists to solve the
 * problem that 17 of 39 charters have no phone number and no email address
 * against them: Boatsetter and GetMyBoat both relay messages instead of
 * handing over a way to reach the guest, so once the trip ends the guest is
 * gone.
 *
 * The photos are why anybody scans. Asking a guest to "join our mailing list"
 * at the dock gets a polite nod and nothing typed; offering them the pictures
 * of themselves that were taken that afternoon gets a phone number. The
 * contact detail is a by-product of a promise that is actually kept.
 *
 * WHICH IS THE POINT: the captain has to actually send them. An unfulfilled
 * request is worse than never asking, so every row lands in the owner console
 * with `sentAt` empty until somebody has genuinely sent that guest their
 * photographs.
 *
 * Phone leads, email is the alternative. Guests hand over a number far more
 * readily, the photos arrive on the device already in their hand, and it is
 * the same reasoning lib/reviews.js uses to make SMS the default template.
 */
export default function PhotoRequestForm({ defaultDate = "" }) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    charterDate: defaultDate,
    note: "",
  });
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/photo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong — please try again.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("Something went wrong — please try again.");
      setState("error");
    }
  }

  // Sized for a thumb on a moving boat, not a mouse. 16px on the inputs is
  // load-bearing: iOS Safari zooms the whole page in on focus for anything
  // smaller, and the guest then has to pinch back out to reach the button.
  const inputStyle = {
    width: "100%",
    padding: "14px 12px",
    borderRadius: 6,
    border: "1px solid rgba(203,108,230,0.3)",
    fontSize: 16,
  };
  const labelStyle = { fontSize: 13, color: "var(--muted)", marginBottom: 5, fontWeight: 600 };

  if (state === "done") {
    return (
      <div
        style={{
          background: "rgba(203,108,230,0.1)",
          border: "1px solid var(--purple)",
          borderRadius: 8,
          padding: "18px 18px 20px",
          color: "var(--text)",
          lineHeight: 1.65,
        }}
      >
        <div className="display" style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          Got it — they're coming. ⚓
        </div>
        <p style={{ fontSize: 15, margin: 0, opacity: 0.9 }}>
          Austin goes through the day's photos and videos himself, so give it a
          couple of days. They'll land on the {form.phone ? "number" : "address"}{" "}
          you just gave us.
        </p>
        <div style={{ marginTop: 12, fontSize: 14, color: "var(--muted)" }}>
          Coming back out? Use{" "}
          <span className="mono" style={{ color: "var(--pink)", fontWeight: 700 }}>WELCOMEBACK10</span>{" "}
          for 10% off.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "block" }}>
        <div style={labelStyle}>Your name</div>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          autoComplete="name"
          style={inputStyle}
        />
      </label>

      <label style={{ display: "block" }}>
        <div style={labelStyle}>Mobile number</div>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          autoComplete="tel"
          placeholder="(936) 555-0142"
          style={inputStyle}
        />
      </label>

      <label style={{ display: "block" }}>
        <div style={labelStyle}>
          Email <span style={{ fontWeight: 400 }}>— if you'd rather have them there</span>
        </div>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          autoComplete="email"
          style={inputStyle}
        />
      </label>

      {/* Prefilled from the QR code's ?d= parameter, so on the boat this is
          already correct and nobody touches it. Left editable because the same
          page gets scanned days later from a screenshot, and a guest who
          remembers the date is more useful than a guess. */}
      <label style={{ display: "block" }}>
        <div style={labelStyle}>Which day were you out?</div>
        <input
          type="date"
          value={form.charterDate}
          onChange={(e) => setForm({ ...form, charterDate: e.target.value })}
          style={inputStyle}
        />
      </label>

      <label style={{ display: "block" }}>
        <div style={labelStyle}>
          Anything else? <span style={{ fontWeight: 400 }}>— optional</span>
        </div>
        <input
          type="text"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="e.g. the tubing ones, or Sarah's birthday"
          style={inputStyle}
        />
      </label>

      {state === "error" && <div style={{ fontSize: 14, color: "var(--pink)" }}>{error}</div>}

      <button
        type="submit"
        disabled={state === "sending"}
        style={{
          background: "linear-gradient(135deg, var(--purple), var(--pink))",
          color: "#0A0612",
          border: "none",
          borderRadius: 6,
          padding: "15px",
          fontWeight: 700,
          fontSize: 16,
          opacity: state === "sending" ? 0.7 : 1,
        }}
      >
        {state === "sending" ? "Sending…" : "Send me my photos"}
      </button>

      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
        We use this to send your photos and to let you know about upcoming dates.
        Nothing else, and never sold — see our{" "}
        <a href="/privacy-policy" style={{ color: "var(--purple)" }}>privacy policy</a>.
      </div>
    </form>
  );
}
