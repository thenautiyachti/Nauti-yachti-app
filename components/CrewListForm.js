"use client";

import { useState } from "react";
import { GOOGLE_REVIEW_URL } from "../lib/reviews";

/**
 * Two-field mailing-list signup.
 *
 * Two jobs, one form:
 *  - Before the event: catches everyone who's interested but can't commit to
 *    a seat tonight, so they aren't lost.
 *  - After the event: this is the page the on-boat QR code points at, so the
 *    ~30 people who actually came become contacts the business can invite
 *    back. Pass `source` (e.g. "Aboard Sept 19") to tag where they came from.
 *
 * `showReviewPrompt` adds the Google review hand-off underneath, which is
 * what you want on the post-event version.
 */
export default function CrewListForm({
  source = "",
  heading = "Get first shout at the next one",
  blurb = "Boatz & Glowz only runs twice a year and seats go fast. Drop your name and we'll email you the moment the next date opens — no spam, just the dates.",
  showReviewPrompt = false,
}) {
  const [form, setForm] = useState({ name: "", email: "" });
  const [state, setState] = useState("idle"); // idle | sending | done | already | error
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/crew-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong — please try again.");
        setState("error");
        return;
      }
      setState(data.alreadyOnList ? "already" : "done");
    } catch {
      setError("Something went wrong — please try again.");
      setState("error");
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 6,
    border: "1px solid rgba(203,108,230,0.3)",
    fontSize: 14,
  };

  const done = state === "done" || state === "already";

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid rgba(203,108,230,0.25)",
        borderRadius: 12,
        padding: "22px 22px 24px",
        maxWidth: 560,
        margin: "0 auto",
        textAlign: "left",
      }}
    >
      <div className="display" style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
        {heading}
      </div>
      <p style={{ fontSize: 14, color: "var(--text)", opacity: 0.85, lineHeight: 1.6, margin: "0 0 16px" }}>
        {blurb}
      </p>

      {done ? (
        <div
          style={{
            background: "rgba(203,108,230,0.1)",
            border: "1px solid var(--purple)",
            borderRadius: 8,
            padding: "14px 16px",
            fontSize: 14,
            color: "var(--text)",
            lineHeight: 1.6,
          }}
        >
          {state === "already"
            ? "You're already on the list — we've got you. ⚓"
            : "You're on the list. We'll email you the moment the next date is set. ⚓"}
          <div style={{ marginTop: 10, fontSize: 13.5, color: "var(--muted)" }}>
            Been aboard before? Use code{" "}
            <span className="mono" style={{ color: "var(--pink)", fontWeight: 700 }}>WELCOMEBACK10</span>{" "}
            for 10% off your next charter.
          </div>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>Name</div>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>Email</div>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              style={inputStyle}
            />
          </label>
          {state === "error" && (
            <div style={{ fontSize: 13, color: "var(--pink)" }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={state === "sending"}
            style={{
              background: "linear-gradient(135deg, var(--purple), var(--pink))",
              color: "#0A0612",
              border: "none",
              borderRadius: 6,
              padding: "12px",
              fontWeight: 700,
              fontSize: 15,
              opacity: state === "sending" ? 0.7 : 1,
            }}
          >
            {state === "sending" ? "Adding you…" : "Add me to the crew list"}
          </button>
          <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
            We only use this to tell you about upcoming dates. Unsubscribe any time —
            see our <a href="/privacy-policy" style={{ color: "var(--purple)" }}>privacy policy</a>.
          </div>
        </form>
      )}

      {showReviewPrompt && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(203,108,230,0.18)" }}>
          <div style={{ fontSize: 13.5, color: "var(--text)", opacity: 0.9, lineHeight: 1.6, marginBottom: 10 }}>
            Had a good night out there? A quick review genuinely helps a small
            operation like ours more than anything else.
          </div>
          <a
            href={GOOGLE_REVIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              border: "1px solid var(--purple)",
              color: "var(--purple)",
              borderRadius: 6,
              padding: "9px 16px",
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Leave a Google review ↗
          </a>
        </div>
      )}
    </div>
  );
}
