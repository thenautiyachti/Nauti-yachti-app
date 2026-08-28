const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// events: [{ day, endDay?, name, note, special }] — day/endDay are 1-indexed day-of-month
export default function MiniCalendar({ year, month, events }) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const eventsByDay = {};
  for (const e of events) {
    const start = e.day;
    const end = e.endDay || e.day;
    for (let d = start; d <= end; d++) {
      eventsByDay[d] = eventsByDay[d] || [];
      eventsByDay[d].push(e);
    }
  }

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{ background: "var(--card)", border: "1px solid rgba(203,108,230,0.18)", borderRadius: 10, padding: 16 }}>
      <div className="display" style={{ fontSize: 18, color: "var(--text)", fontWeight: 700, marginBottom: 10 }}>
        {MONTH_NAMES[month]} {year}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="mono" style={{ fontSize: 10.5, color: "var(--muted)", textAlign: "center" }}>{w}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          const dayEvents = d ? eventsByDay[d] : null;
          const hasEvent = dayEvents && dayEvents.length > 0;
          const isSpecial = hasEvent && dayEvents.some((e) => e.special);
          return (
            <div
              key={i}
              title={hasEvent ? dayEvents.map((e) => e.name).join(", ") : undefined}
              style={{
                aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 6, fontSize: 12,
                background: hasEvent ? (isSpecial ? "var(--pink)" : "var(--purple)") : "transparent",
                color: hasEvent ? "#0A0612" : d ? "var(--text)" : "transparent",
                fontWeight: hasEvent ? 700 : 400,
              }}
            >
              {d || ""}
            </div>
          );
        })}
      </div>
      {events.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 4 }}>
          {events.map((e, i) => (
            <div key={i} style={{ fontSize: 11.5, color: "var(--muted)", display: "flex", gap: 6 }}>
              <span style={{ color: e.special ? "var(--pink)" : "var(--purple)", fontWeight: 700 }}>
                {e.day}{e.endDay ? `–${e.endDay}` : ""}
              </span>
              <span>{e.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
