"use client";

import { localDateKey } from "../lib/pricing";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATE_COLOR = {
  open: "var(--purple)",
  partial: "repeating-linear-gradient(45deg, #E8934A, #E8934A 5px, #C97633 5px, #C97633 10px)",
  full: "#3A2E40",
};
const STATE_TEXT_COLOR = {
  open: "#0A0612",
  partial: "#0A0612",
  full: "var(--muted)",
};

// A single month's calendar grid, shared by the public availability
// calendar and the admin console's toggle view. getState(dateKey) returns
// "open" | "partial" | "full"; pass onDayClick to make days clickable
// (admin only — the public calendar is read-only).
export default function AvailabilityMonthGrid({ year, month, getState, onDayClick, size = "normal" }) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = localDateKey(new Date());

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const cellPad = size === "compact" ? "6px 2px" : "10px 4px";

  return (
    <div>
      <div className="display" style={{ fontSize: 18, color: "var(--text)", fontWeight: 700, marginBottom: 8 }}>
        {MONTH_NAMES[month]} {year}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 4 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="mono" style={{ fontSize: 10, color: "var(--muted)", textAlign: "center" }}>{w}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dateObj = new Date(year, month, d);
          const key = localDateKey(dateObj);
          const isPast = key < todayKey;
          const state = isPast ? null : getState(key);
          const clickable = !!onDayClick && !isPast;
          const Tag = clickable ? "button" : "div";
          return (
            <Tag
              key={key}
              onClick={clickable ? () => onDayClick(key) : undefined}
              className={clickable ? "day-cell" : undefined}
              style={{
                border: "none", borderRadius: 8, padding: cellPad, textAlign: "center",
                background: isPast ? "transparent" : STATE_COLOR[state],
                color: isPast ? "var(--muted)" : STATE_TEXT_COLOR[state],
                opacity: isPast ? 0.35 : 1,
                cursor: clickable ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >
              <div className="mono" style={{ fontSize: size === "compact" ? 12 : 14, fontWeight: 700 }}>{d}</div>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
