import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";

export const metadata = {
  title: "Booking confirmed",
  // A per-booking confirmation screen has no search value and would be a soft
  // duplicate of itself for every customer. Kept out of the index explicitly,
  // in addition to the robots.txt disallow.
  robots: { index: false, follow: false },
};

// The webhook (app/api/webhooks/stripe/route.js) is the source of truth for
// marking the booking paid — this page just shows a friendly confirmation
// once Stripe redirects the customer back. No need to re-verify payment
// client-side with the session id.
export default async function BookingSuccessPage({ searchParams }) {
  // searchParams is a promise as of Next 15.
  const params = await searchParams;
  const sessionId = params && params.session_id;

  return (
    <div>
      <NavBar />

      <div style={{ background: "var(--ink)", minHeight: "60vh", padding: "80px 24px", display: "flex", alignItems: "center" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            BOOKING CONFIRMED
          </div>
          <h1 className="display" style={{ fontSize: "clamp(32px, 6vw, 52px)", margin: 0, lineHeight: 1, fontWeight: 800, color: "var(--text)" }}>
            You're all set!
          </h1>
          <p style={{ fontSize: 16, color: "var(--text)", opacity: 0.85, lineHeight: 1.6, margin: "22px 0 8px" }}>
              Thanks for booking with The Nauti Yachti. We have your payment and your charter,
              and it is on our calendar. Keep the reference below until you hear from us — we
              will be in touch before your day on the water with the meeting point and timing.
          </p>
          {sessionId && (
            <p className="mono" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 18, wordBreak: "break-all" }}>
              Confirmation ref: {sessionId}
            </p>
          )}
          <a
            href="/"
            style={{
              display: "inline-block", marginTop: 28, background: "linear-gradient(135deg, var(--purple), var(--pink))",
              color: "#0A0612", fontWeight: 700, padding: "13px 28px", borderRadius: 6, textDecoration: "none", fontSize: 15,
            }}
          >
            Back to the site
          </a>
        </div>
      </div>

      <PageFooter />
    </div>
  );
}
