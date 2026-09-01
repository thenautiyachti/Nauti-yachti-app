"use client";

import { useState, useEffect } from "react";
import { daysUntilGlow, formatGlowDateShort, GLOW_START_TIME } from "../lib/glowEvent";

/**
 * A slim promo bar for the next Boatz & Glowz date, shown under the home page
 * hero. The glow package is card #6 of 8 and well below the fold, so a dated
 * event that only runs twice a year was effectively invisible to anyone who
 * landed on the home page.
 *
 * Renders nothing once the date has passed, so it retires itself the morning
 * after the event with no code change needed. Mount-gated for the same reason
 * as GlowCountdown: "is it past?" depends on the visitor's clock, and
 * answering it during SSR causes a hydration mismatch.
 */
export default function GlowStrip({ eventDate, href = "/glow" }) {
  const [days, setDays] = useState(null);

  useEffect(() => {
    setDays(daysUntilGlow(eventDate));
  }, [eventDate]);

  if (days == null || days < 0) return null;

  const urgency =
    days === 0
      ? "Tonight"
      : days === 1
      ? "Tomorrow"
      : days <= 7
      ? `${days} days away`
      : `${days} days out`;

  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        flexWrap: "wrap",
        textDecoration: "none",
        background: "linear-gradient(90deg, rgba(203,108,230,0.18), rgba(240,85,156,0.18))",
        borderTop: "1px solid rgba(203,108,230,0.35)",
        borderBottom: "1px solid rgba(203,108,230,0.35)",
        padding: "13px 24px",
        color: "var(--text)",
        textAlign: "center",
      }}
    >
      <span className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "var(--pink)", fontWeight: 700 }}>
        {urgency.toUpperCase()}
      </span>
      <span style={{ fontSize: 15, fontWeight: 700 }}>
        Boatz &amp; Glowz — {formatGlowDateShort(eventDate)}, {GLOW_START_TIME}
      </span>
      <span style={{ fontSize: 14, color: "var(--muted)" }}>
        Party Cove after dark · 30 seats only
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--purple)", whiteSpace: "nowrap" }}>
        See the details →
      </span>
    </a>
  );
}
