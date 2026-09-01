import { prisma } from "../../lib/db";
import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import MiniCalendar from "../../components/MiniCalendar";
import GlowCountdown from "../../components/GlowCountdown";
import { currency } from "../../lib/pricing";
import { pageMetadata } from "../../lib/seo";
import {
  GLOW_PACKAGE_ID,
  GLOW_EVENT_DATE,
  GLOW_START_TIME,
  GLOW_MEETING_POINT,
  formatGlowDate,
} from "../../lib/glowEvent";

// This page reads the event date from the database and decides server-side
// whether the featured block has expired, so it can't be frozen at build
// time — regenerate hourly, matching the home page's caching behaviour.
export const revalidate = 1800;

// The brand suffix comes from the root layout's title template, so it must
// NOT be repeated here or the tag reads "... | The Nauti Yachti | The Nauti
// Yachti". The explicit canonical matters too: without one this page inherits
// the parent's and declares itself a duplicate of the homepage.
export const metadata = pageMetadata({
  title: "Lake Conroe Events & Holidays Calendar",
  description:
    "Holidays and events worth planning a Lake Conroe boat charter around in 2026 — spring break, July 4th, Labor Day and our Boatz & Glowz glow party at Party Cove.",
  path: "/events",
});

const YEAR = 2026;

// month is 0-indexed (2 = March, 9 = October)
const MONTHS = [
  {
    month: 2,
    events: [
      { day: 2, name: "Texas Independence Day", special: false },
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
      { day: 5, name: "Cinco de Mayo", note: "A great excuse for a lake party.", special: false },
      { day: 10, name: "Mother's Day", note: "Special pricing for mothers.", special: true },
      { day: 16, name: "Boatz & Glowz — Party Cove Glow Party, 7 PM", note: "The first glow party of the season.", special: true },
      { day: 16, endDay: 22, name: "National Safe Boating Week", note: "Kicks off the summer boating season.", special: false },
      { day: 23, endDay: 25, name: "Memorial Day Weekend", special: false },
    ],
  },
  {
    month: 5,
    events: [
      { day: 19, name: "Juneteenth", special: false },
      { day: 21, name: "Father's Day", note: "Special pricing for fathers.", special: true },
      { day: 21, name: "First Day of Summer", note: "Summer solstice — the longest day of the year.", special: false },
    ],
  },
  {
    month: 6,
    events: [
      { day: 3, endDay: 5, name: "Independence Day Weekend — America's 250th!", note: "2026 marks 250 years since the Declaration of Independence.", special: true },
    ],
  },
  {
    month: 7,
    events: [
      { day: 27, name: "World Lake Day", note: "The UN-designated day to celebrate lakes worldwide.", special: true },
    ],
  },
  {
    month: 8,
    events: [
      { day: 5, endDay: 7, name: "Labor Day Weekend", special: false },
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

// The next dated, sellable event gets its own block at the top of this page.
// Previously September 19 was a single highlighted day inside a 20-entry
// calendar grid with no time, price, capacity or way to book it — a visitor
// who came here specifically to find out about the glow party could not
// actually buy a seat from this page.
async function FeaturedGlowEvent() {
  const pkgRow = await prisma.package.findUnique({ where: { id: GLOW_PACKAGE_ID } });
  const eventDate = pkgRow?.eventDate || GLOW_EVENT_DATE;

  // Retire the block automatically once the date is behind us rather than
  // leaving a dead event advertised at the top of the page.
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (eventDate < todayKey) return null;

  const perGuest = pkgRow?.pricePerGuest ?? null;
  const hours = pkgRow?.fixedHours ?? 4;

  const facts = [
    ["When", `${formatGlowDate(eventDate)} · ${GLOW_START_TIME}`],
    ["How long", `${hours} hours`],
    ["Price", perGuest != null ? `${currency(perGuest)} per guest` : "Ask us"],
    ["Seats", "30 across all 3 boats"],
    ["Departs", GLOW_MEETING_POINT],
  ];

  return (
    <div style={{ background: "var(--ink-soft)", padding: "34px 24px 40px" }}>
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          background: "var(--card)",
          border: "1px solid var(--purple)",
          borderRadius: 12,
          padding: "26px 26px 28px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <span className="mono" style={{ color: "var(--purple)", fontSize: 12, letterSpacing: "0.14em" }}>
            NEXT UP
          </span>
          <GlowCountdown eventDate={eventDate} />
        </div>

        <h2 className="display" style={{ fontSize: "clamp(28px, 4.5vw, 40px)", color: "var(--text)", margin: "0 0 8px", fontWeight: 800 }}>
          Boatz &amp; Glowz — Party Cove Glow Party
        </h2>
        <p style={{ fontSize: 15.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.65, margin: "0 0 20px", maxWidth: 660 }}>
          The entire fleet, out together and lit up, anchored in the middle of
          Party Cove after dark. Glow gear, sober captains and a round-trip ride
          from Scott&apos;s Ridge are all included — you just show up. This only
          happens twice a year.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))",
            gap: 12,
            marginBottom: 22,
          }}
        >
          {facts.map(([label, value]) => (
            <div key={label}>
              <div className="mono" style={{ fontSize: 11, color: "var(--purple)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>
                {label}
              </div>
              <div style={{ fontSize: 14.5, color: "var(--text)", fontWeight: 600, lineHeight: 1.4 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <a
            href={`/?package=${GLOW_PACKAGE_ID}#inquire`}
            style={{
              display: "inline-block",
              background: "linear-gradient(135deg, var(--purple), var(--pink))",
              color: "#0A0612",
              fontWeight: 700,
              padding: "13px 28px",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 15,
            }}
          >
            Reserve your seat
          </a>
          <a
            href="/glow"
            style={{
              display: "inline-block",
              border: "1px solid var(--purple)",
              color: "var(--purple)",
              fontWeight: 600,
              padding: "12px 24px",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14.5,
            }}
          >
            What&apos;s included &amp; what to bring
          </a>
        </div>
      </div>
    </div>
  );
}

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

      <FeaturedGlowEvent />

      <div style={{ background: "var(--ink)", padding: "10px 24px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2 className="display" style={{ fontSize: 24, color: "var(--text)", margin: "24px 0 0" }}>
            The rest of the season
          </h2>
        </div>
      </div>

      <div style={{ background: "var(--ink)", padding: "22px 24px 70px" }}>
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
