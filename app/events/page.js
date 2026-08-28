import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import MiniCalendar from "../../components/MiniCalendar";

const YEAR = 2026;

// month is 0-indexed (2 = March, 9 = October)
const MONTHS = [
  {
    month: 2,
    events: [
      { day: 9, endDay: 13, name: "Spring Break", note: "The unofficial start of the season on Lake Conroe.", special: false },
    ],
  },
  {
    month: 3,
    events: [
      { day: 3, name: "Good Friday", special: false },
      { day: 5, name: "Easter", note: "We're planning an egg hunt on the island.", special: true },
    ],
  },
  {
    month: 4,
    events: [
      { day: 10, name: "Mother's Day", note: "Special pricing for mothers.", special: true },
      { day: 16, name: "Boatz & Glowz — Party Cove Glow Party, 7 PM", note: "The first glow party of the season.", special: true },
      { day: 25, name: "Memorial Day", special: false },
    ],
  },
  {
    month: 5,
    events: [
      { day: 19, name: "Juneteenth", special: false },
      { day: 21, name: "Father's Day", note: "Special pricing for fathers.", special: true },
    ],
  },
  {
    month: 6,
    events: [
      { day: 4, name: "Independence Day", special: true },
    ],
  },
  { month: 7, events: [] },
  {
    month: 8,
    events: [
      { day: 7, name: "Labor Day", special: false },
      { day: 19, name: "Boatz & Glowz — Party Cove Glow Party, 7 PM", note: "The second glow party of the season.", special: true },
    ],
  },
  {
    month: 9,
    events: [
      { day: 31, name: "Halloween", special: false },
    ],
  },
];

export default function EventsPage() {
  return (
    <div>
      <NavBar />

      <div style={{ background: "var(--ink)", padding: "60px 24px 20px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", textAlign: "center" }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            THE SEASON AHEAD
          </div>
          <h1 className="display" style={{ fontSize: "clamp(34px, 6vw, 56px)", margin: 0, lineHeight: 1, fontWeight: 800, color: "var(--text)" }}>
            Lake Conroe Events & Holidays
          </h1>
          <p style={{ fontSize: 16, color: "var(--text)", opacity: 0.85, lineHeight: 1.65, maxWidth: 620, margin: "22px auto 0" }}>
            Throughout the boating season, Lake Conroe comes alive with holidays and events worth planning your
            charter around — including our can't-miss Boatz &amp; Glowz parties. Days highlighted in{" "}
            <span style={{ color: "var(--pink)", fontWeight: 700 }}>pink</span> reflect special event pricing;{" "}
            <span style={{ color: "var(--purple)", fontWeight: 700 }}>purple</span> marks other notable dates.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "40px 24px 70px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 20 }}>
          {MONTHS.map((m) => (
            <MiniCalendar key={m.month} year={YEAR} month={m.month} events={m.events} />
          ))}
        </div>
      </div>

      <div style={{ background: "var(--ink)", padding: "50px 24px 70px", textAlign: "center" }}>
        <h2 className="display" style={{ fontSize: 24, color: "var(--text)", marginBottom: 10 }}>Planning around one of these dates?</h2>
        <p style={{ fontSize: 14.5, color: "var(--muted)", marginBottom: 22 }}>
          Popular dates fill up fast — check availability and lock in your charter early.
        </p>
        <a
          href="/#availability"
          style={{
            display: "inline-block", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", fontWeight: 700,
            padding: "13px 28px", borderRadius: 6, textDecoration: "none", fontSize: 15,
          }}
        >
          Check availability
        </a>
      </div>

      <PageFooter />
    </div>
  );
}
