"use client";
// The Google Calendar link, on Bookings -> Availability (owner, 9 Oct 2026:
// "every time we have a reservation or a booking upcoming, can we have it added
// to our Google Calendar"). Collapsed by default: it is set up once, then only
// needed again if the link changes. See lib/calendarFeed.js.
import { useState } from "react";

export default function CalendarFeedCard() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !url && !error) {
      fetch("/api/admin/calendar-feed", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => (d.url ? setUrl(d.url) : setError(d.error || "Could not load the link.")))
        .catch(() => setError("Could not load the link."));
    }
  }
  function copy() {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ border: "1px solid rgba(79,243,255,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
      <button type="button" onClick={toggle}
        style={{ all: "unset", cursor: "pointer", fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>
        {open ? "▾" : "▸"} Bookings in Google Calendar
      </button>
      {open && (
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 8px" }}>
            A private link to every booking (from 30 days back). In Google Calendar on a computer:
            <strong style={{ color: "var(--text)" }}> Other calendars → + → From URL</strong>, paste the link, then
            <strong style={{ color: "var(--text)" }}> Add calendar</strong>. New bookings, changes and cancellations follow
            on their own; Google refreshes it every few hours.
          </p>
          {error && <p style={{ color: "#E2685F", margin: 0 }}>{error}</p>}
          {url && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code style={{ fontSize: 11.5, wordBreak: "break-all", color: "var(--text)", flex: "1 1 320px" }}>{url}</code>
              <button type="button" onClick={copy}
                style={{ background: "transparent", color: "#4ff3ff", border: "1px solid rgba(79,243,255,0.5)", borderRadius: 6, padding: "5px 10px", fontSize: 12 }}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
          <p style={{ margin: "8px 0 0", fontSize: 12 }}>
            Keep this link private: anyone with it can see your bookings (first names only, no phone numbers).
          </p>
        </div>
      )}
    </div>
  );
}
