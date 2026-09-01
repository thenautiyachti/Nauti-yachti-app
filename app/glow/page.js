import { prisma } from "../../lib/db";
import { parsePackage } from "../../lib/serialize";
import { currency } from "../../lib/pricing";
import {
  GLOW_PACKAGE_ID,
  GLOW_EVENT_DATE,
  GLOW_START_TIME,
  GLOW_CHECK_IN_TIME,
  GLOW_MEETING_POINT,
  GLOW_INCLUDED,
  GLOW_BRING,
  formatGlowDate,
} from "../../lib/glowEvent";
import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import GlowCountdown from "../../components/GlowCountdown";
import CrewListForm from "../../components/CrewListForm";

// A short, memorable URL for the campaign: thenautiyachti.com/glow.
// This is the one link that goes in every Instagram/TikTok bio and every
// Facebook post for the run-up to the event, so it has to answer every
// practical question and then hand the visitor straight to a booking form
// with the package already chosen.
// Price, date and photos all come from the live database — don't let a build
// freeze them. Same cadence as the home page.
export const revalidate = 1800;

export const metadata = {
  title: "Boatz & Glowz — Party Cove Glow Party | The Nauti Yachti",
  description:
    "The entire Nauti Yachti fleet lights up Party Cove on Lake Conroe. Glow gear, sober captains, and a ride to and from Scott's Ridge included. 30 seats only.",
  openGraph: {
    title: "Boatz & Glowz — Party Cove Glow Party",
    description:
      "The entire fleet, lit up at Party Cove on Lake Conroe. Glow gear, sober captains, round-trip ride included. 30 seats only.",
    type: "website",
  },
};

// Booking deep link: preselects the Boatz & Glowz package on the home page's
// inquiry form and scrolls straight to it, so a visitor arriving from a
// social post is one tap from booking rather than hunting through 8 package
// cards. Handled by SiteView's ?package= reader.
const BOOK_HREF = `/?package=${GLOW_PACKAGE_ID}#inquire`;

function Stat({ label, value, sub }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid rgba(203,108,230,0.22)",
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div className="mono" style={{ fontSize: 11.5, color: "var(--purple)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}

function BookButton({ children = "Reserve your seat", style }) {
  return (
    <a
      href={BOOK_HREF}
      style={{
        display: "inline-block",
        background: "linear-gradient(135deg, var(--purple), var(--pink))",
        color: "#0A0612",
        fontWeight: 700,
        padding: "14px 30px",
        borderRadius: 6,
        textDecoration: "none",
        fontSize: 16,
        ...style,
      }}
    >
      {children}
    </a>
  );
}

export default async function GlowPage() {
  const [pkgRow, gallery] = await Promise.all([
    prisma.package.findUnique({ where: { id: GLOW_PACKAGE_ID } }),
    prisma.galleryItem.findMany({
      where: { category: GLOW_PACKAGE_ID },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  // The package row is the source of truth for date/price/duration; fall back
  // to the constants only if the row has somehow been removed.
  const pkg = pkgRow ? parsePackage(pkgRow) : null;
  const eventDate = pkg?.eventDate || GLOW_EVENT_DATE;
  const perGuest = pkg?.pricePerGuest ?? null;
  const hours = pkg?.fixedHours ?? 4;

  return (
    <div>
      <NavBar />

      {/* HERO */}
      <div style={{ background: "var(--ink)", padding: "54px 24px 46px", position: "relative", overflow: "hidden" }}>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            // A real photo of the actual fleet lit up, dimmed behind the copy.
            backgroundImage: gallery[0]
              ? `linear-gradient(rgba(10,6,18,0.82), rgba(10,6,18,0.94)), url(${gallery[0].image})`
              : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            LAKE CONROE · PARTY COVE · AFTER DARK
          </div>
          <h1
            className="display"
            style={{ fontSize: "clamp(38px, 7vw, 68px)", margin: 0, lineHeight: 0.98, fontWeight: 800, color: "var(--text)" }}
          >
            Boatz &amp; Glowz
          </h1>
          <div
            style={{
              fontSize: "clamp(18px, 3.2vw, 26px)",
              fontWeight: 700,
              color: "var(--pink)",
              margin: "16px 0 12px",
            }}
          >
            {formatGlowDate(eventDate)} · {GLOW_START_TIME}
          </div>
          <GlowCountdown eventDate={eventDate} style={{ marginBottom: 20 }} />
          <p style={{ fontSize: 17, color: "var(--text)", opacity: 0.88, lineHeight: 1.65, maxWidth: 640, margin: "0 auto 26px" }}>
            Twice a year we take the <strong>entire fleet</strong> out together, lit up, and park it
            in the middle of Party Cove. Glow gear, sober captains, and a ride
            there and back — you just show up. Thirty seats across three boats,
            and that's the whole night.
          </p>
          <BookButton />
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 14 }}>
            {perGuest != null ? `${currency(perGuest)} per guest · ${hours} hours on the water` : `${hours} hours on the water`}
          </div>
        </div>
      </div>

      {/* THE FACTS */}
      <div style={{ background: "var(--ink-soft)", padding: "44px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px,1fr))", gap: 14 }}>
            <Stat label="When" value={formatGlowDate(eventDate)} sub={`Board at ${GLOW_CHECK_IN_TIME}, lines off at ${GLOW_START_TIME}`} />
            <Stat label="How long" value={`${hours} hours`} sub="Out and back, all in" />
            <Stat
              label="Price"
              value={perGuest != null ? `${currency(perGuest)} / guest` : "Ask us"}
              sub="Per seat — book one or book the whole boat"
            />
            <Stat label="Seats" value="30 total" sub="Split across all three vessels" />
            <Stat label="Where from" value={GLOW_MEETING_POINT} sub="We're your taxi both ways — leave the truck parked" />
            <Stat label="Where to" value="Party Cove" sub="Lake Conroe's party spot, after dark" />
          </div>
        </div>
      </div>

      {/* INCLUDED / BRING */}
      <div style={{ background: "var(--ink)", padding: "50px 24px" }}>
        <div
          style={{
            maxWidth: 1000,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))",
            gap: 30,
          }}
        >
          <div>
            <h2 className="display" style={{ fontSize: 26, color: "var(--text)", margin: "0 0 12px" }}>
              What's included
            </h2>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14.5, color: "var(--text)", opacity: 0.87, lineHeight: 1.75 }}>
              {GLOW_INCLUDED.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="display" style={{ fontSize: 26, color: "var(--text)", margin: "0 0 12px" }}>
              What to bring
            </h2>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14.5, color: "var(--text)", opacity: 0.87, lineHeight: 1.75 }}>
              {GLOW_BRING.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div
          style={{
            maxWidth: 1000,
            margin: "28px auto 0",
            background: "var(--card)",
            border: "1px solid rgba(203,108,230,0.22)",
            borderRadius: 10,
            padding: "16px 20px",
            fontSize: 13.5,
            color: "var(--text)",
            opacity: 0.9,
            lineHeight: 1.65,
          }}
        >
          <strong>Weather:</strong> if the lake isn't safe we'll call it and you choose —
          full refund or move your seat to the next date. Guest cancellations are
          fully refundable up to 24 hours before.{" "}
          <a href="/terms" style={{ color: "var(--purple)" }}>Full policy here.</a>
        </div>
      </div>

      {/* REAL PHOTOS FROM PREVIOUS GLOW NIGHTS */}
      {gallery.length > 0 && (
        <div style={{ background: "var(--ink-soft)", padding: "50px 24px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <h2 className="display" style={{ fontSize: 26, color: "var(--text)", margin: "0 0 6px" }}>
              From the last one
            </h2>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
              Real photos from previous Boatz &amp; Glowz nights on Lake Conroe.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 14 }}>
              {gallery.map((g) => (
                <div
                  key={g.id}
                  style={{
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "var(--card)",
                    border: "1px solid rgba(203,108,230,0.15)",
                  }}
                >
                  <div style={{ aspectRatio: "3 / 4", overflow: "hidden" }}>
                    <img
                      src={g.image}
                      alt={g.caption}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </div>
                  <div style={{ color: "var(--text)", fontSize: 12, fontWeight: 600, padding: "8px 10px" }}>
                    {g.caption}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CLOSING CTA */}
      <div style={{ background: "var(--ink)", padding: "54px 24px 30px", textAlign: "center" }}>
        <h2 className="display" style={{ fontSize: 30, color: "var(--text)", margin: "0 0 8px" }}>
          Thirty seats. Twice a year.
        </h2>
        <p style={{ fontSize: 15, color: "var(--muted)", margin: "0 auto 24px", maxWidth: 520, lineHeight: 1.6 }}>
          Book a single seat or take a whole boat for your group. Questions? Call
          or text 832-948-2912 — we answer.
        </p>
        <BookButton />
      </div>

      {/* CREW LIST — the after-the-event play, live before it too */}
      <div style={{ background: "var(--ink-soft)", padding: "20px 24px 60px" }}>
        <CrewListForm source={`Glow page — ${eventDate}`} />
      </div>

      <PageFooter />
    </div>
  );
}
