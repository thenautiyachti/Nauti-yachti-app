import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata({
  title: "Terms & Cancellation Policy",
  description:
    "The Nauti Yachti's booking terms for Lake Conroe charters: cancellation and refund windows, the weather-cancellation policy, and rescheduling rules.",
  path: "/terms",
});

const SECTIONS = [
  {
    title: "1. Overview",
    body: [
      `These Terms & Cancellation Policy ("Terms") govern charter bookings made with The Nauti Yachti LLC ("The Nauti Yachti," "we," "us," or "our") on Lake Conroe, TX. By submitting a booking or inquiry, you agree to these Terms, including the cancellation policy and liability waiver below.`,
    ],
  },
  {
    title: "2. Cancellation & Refund Policy",
    body: [
      "This policy is subject to the weather exception in Section 3 below — weather-related cancellations initiated by The Nauti Yachti are not subject to these guest-cancellation terms.",
    ],
    bullets: [
      "24 hours or more before your charter date/time: 100% refund of amounts paid.",
      "Less than 24 hours before your charter (day-of cancellation), with communication from the guest: 60% refund of amounts paid.",
      "No-show — no communication at all once the reserved charter time has passed: 0% refund, non-refundable.",
    ],
  },
  {
    title: "3. Weather-Related Cancellations & Rescheduling",
    body: [
      "If The Nauti Yachti determines, in its sole discretion, that weather conditions (including thunderstorms, dangerously high wind, or a lake advisory) make a scheduled charter unsafe, we may cancel or reschedule the charter. When The Nauti Yachti initiates a cancellation for weather, guests will be offered either a full refund or the option to reschedule to another available date, at the guest's choice. The Nauti Yachti is not liable for charter disruptions caused by weather.",
    ],
  },
  {
    title: "4. Rescheduling by Guest",
    body: [
      "Guests may request to reschedule an upcoming charter to a different available date. Requests made 2 or more days before the original charter date will generally be accommodated at no charge, subject to availability. Requests made closer to the charter date are subject to the cancellation terms above.",
    ],
  },
  {
    title: "5. Liability Waiver",
    draftWarning: true,
    body: [
      "This section will contain the liability waiver and assumption-of-risk language that guests agree to when booking a charter (e.g., acknowledgment of the inherent risks of boating and water activities, release of claims, and related terms). That language has not yet been written and will be added once it has been drafted and reviewed by a licensed attorney.",
    ],
  },
  {
    title: "6. Changes to These Terms",
    body: [
      "These Terms may be updated from time to time. The current version in effect is the one posted on this page at the time of your booking.",
    ],
  },
  {
    title: "7. Contact",
    body: [
      "Questions about these Terms or your booking:",
      "The Nauti Yachti LLC — TheNautiYachti@Gmail.com — 832-948-2912",
    ],
  },
];

export default function TermsPage() {
  return (
    <div>
      <NavBar />

      <div style={{ background: "var(--ink)", padding: "60px 24px 40px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            LEGAL
          </div>
          <h1 className="display" style={{ fontSize: "clamp(32px, 5vw, 48px)", margin: 0, lineHeight: 1, fontWeight: 800, color: "var(--text)" }}>
            Terms & Cancellation Policy
          </h1>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 12 }}>Status: Cancellation & rescheduling policy confirmed — liability waiver still pending attorney review</div>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "10px 24px 60px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", display: "grid", gap: 26 }}>

          <div style={{ border: "1px solid #F0555C", background: "rgba(240,85,92,0.1)", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", color: "#FF7A80", marginBottom: 6 }}>
              ⚠ LIABILITY WAIVER STILL PENDING
            </div>
            <p style={{ fontSize: 14, color: "var(--text)", opacity: 0.9, lineHeight: 1.6, margin: 0 }}>
              The cancellation and rescheduling policy below has been confirmed by the owner. The liability waiver section (Section 5) is still a placeholder and must be drafted and reviewed by a licensed attorney before this page can be relied on as a complete, binding policy.
            </p>
          </div>

          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="display" style={{ fontSize: 19, color: "var(--purple)", marginBottom: 8, fontWeight: 700 }}>{s.title}</h2>

              {s.draftWarning && (
                <div style={{ border: "1px solid #F0555C", background: "rgba(240,85,92,0.1)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: "#FF7A80", margin: 0, lineHeight: 1.5 }}>
                    DRAFT — this section has not been reviewed by an attorney and must not be relied on as a binding legal waiver until it has been.
                  </p>
                </div>
              )}

              {s.example && (
                <div style={{ display: "inline-block", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: "#FFB454", border: "1px solid rgba(255,180,84,0.5)", background: "rgba(255,180,84,0.08)", borderRadius: 4, padding: "2px 8px", marginBottom: 8 }}>
                  EXAMPLE — NOT YET CONFIRMED
                </div>
              )}

              {s.body.map((p, i) => (
                <p key={i} style={{ fontSize: 14.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.65, margin: "0 0 8px" }}>{p}</p>
              ))}
              {s.bullets && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 6 }}>
                  {s.bullets.map((b, i) => (
                    <li key={i} style={{ fontSize: 14.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.55 }}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <PageFooter />
    </div>
  );
}
