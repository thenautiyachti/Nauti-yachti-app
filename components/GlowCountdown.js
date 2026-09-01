"use client";

import { useState, useEffect } from "react";
import { daysUntilGlow } from "../lib/glowEvent";

/**
 * "18 days out" style countdown.
 *
 * Rendered client-side only (after mount) on purpose: "today" has to come
 * from the visitor's own clock, and computing it during SSR causes a
 * hydration mismatch whenever the server's timezone differs from theirs —
 * the same reason AvailabilityCalendar defers its month calculation.
 *
 * Returns null before mount and once the event is in the past, so callers
 * can drop this in without guarding.
 */
export default function GlowCountdown({ eventDate, style }) {
  const [days, setDays] = useState(null);

  useEffect(() => {
    setDays(daysUntilGlow(eventDate));
  }, [eventDate]);

  if (days == null || days < 0) return null;

  const label =
    days === 0 ? "Tonight" : days === 1 ? "Tomorrow night" : `${days} days out`;

  return (
    <span
      className="mono"
      style={{
        display: "inline-block",
        background: "rgba(240,85,156,0.15)",
        border: "1px solid var(--pink)",
        color: "var(--pink)",
        borderRadius: 20,
        padding: "4px 12px",
        fontSize: 12.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {label}
    </span>
  );
}
