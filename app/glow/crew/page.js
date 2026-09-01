import NavBar from "../../../components/NavBar";
import PageFooter from "../../../components/PageFooter";
import CrewListForm from "../../../components/CrewListForm";
import { GLOW_EVENT_DATE } from "../../../lib/glowEvent";

// thenautiyachti.com/glow/crew
//
// This is the QR-code destination for the night itself — printed small and
// stuck by the cooler on each boat, and read out once by the captain before
// everyone gets off.
//
// It exists because the business currently captures no guest contact details
// at all: Boatsetter and GetMyBoat relay messages rather than expose an email
// address, and 53 charters have produced one Google review and zero rows in
// the site's own Inquiry table. The ~30 people aboard on glow night are the
// single best-qualified audience the business will have all year — they've
// already paid, already had a good time, and are standing still with a phone
// in their hand. Two fields, ten seconds, and they become someone the owner
// can invite back for free next season.
//
// Deliberately stripped down: no navigation into packages, no pricing, no
// second ask. One form, one optional review link.
export const metadata = {
  title: "Boatz & Glowz — Crew List",
  description: "Join the crew list and we'll email you when the next Boatz & Glowz date is set.",
  // No point in this page being indexed — it's a QR destination, not a
  // landing page, and it would dilute /glow in search results.
  robots: { index: false, follow: false },
};

export default function GlowCrewPage() {
  return (
    <div>
      <NavBar />

      <div style={{ background: "var(--ink)", padding: "56px 24px 20px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto", textAlign: "center" }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            THANKS FOR COMING OUT
          </div>
          <h1
            className="display"
            style={{ fontSize: "clamp(32px, 6vw, 52px)", margin: 0, lineHeight: 1, fontWeight: 800, color: "var(--text)" }}
          >
            You were on the boat
          </h1>
          <p style={{ fontSize: 16, color: "var(--text)", opacity: 0.86, lineHeight: 1.65, margin: "20px auto 0" }}>
            Hope Party Cove treated you right. Leave us your email and you'll be
            first to know when the next glow night — and anything else worth
            showing up for — gets a date.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "32px 24px 64px" }}>
        <CrewListForm
          source={`Aboard ${GLOW_EVENT_DATE}`}
          heading="Add me to the crew list"
          blurb="Two fields, ten seconds. We'll email you the next date before it goes public, and returning guests always get 10% off."
          showReviewPrompt
        />
      </div>

      <PageFooter />
    </div>
  );
}
