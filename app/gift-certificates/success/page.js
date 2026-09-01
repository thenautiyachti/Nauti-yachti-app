import NavBar from "../../../components/NavBar";
import PageFooter from "../../../components/PageFooter";
import GiftCertificateReveal from "../../../components/GiftCertificateReveal";
import { pageMetadata, PHONE_DISPLAY, PHONE_E164 } from "../../../lib/seo";

export const metadata = {
  ...pageMetadata({
    title: "Your gift certificate — The Nauti Yachti",
    description: "Your Nauti Yachti gift certificate code.",
    path: "/gift-certificates/success",
  }),
  // A one-off confirmation page tied to a single purchase has nothing to offer
  // a search engine and should never be indexed.
  robots: { index: false, follow: false },
};

export default function GiftCertificateSuccessPage() {
  return (
    <div>
      <NavBar />
      <div style={{ background: "var(--ink)", minHeight: "60vh", padding: "72px 24px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            PAYMENT RECEIVED
          </div>
          <h1 className="display" style={{ fontSize: "clamp(28px, 5vw, 42px)", margin: "0 0 20px", fontWeight: 800, color: "var(--text)" }}>
            Thank you — here is the certificate
          </h1>
          {/* The code is revealed here rather than relying on email. The
              sending domain is not yet verified with Resend, so mail to a
              customer may not arrive; this page is the dependable delivery
              path, and the buyer can screenshot, print or forward it. */}
          <GiftCertificateReveal />
          <p style={{ fontSize: 15, color: "var(--text)", opacity: 0.8, lineHeight: 1.7, marginTop: 26 }}>
            Keep this code safe — it is the certificate. To redeem it, enter it at checkout on any
            charter, or mention it when booking by phone on{" "}
            <a href={`tel:${PHONE_E164}`} style={{ color: "var(--purple)" }}>{PHONE_DISPLAY}</a>.
            It never expires and can be spent across more than one trip.
          </p>
        </div>
      </div>
      <PageFooter />
    </div>
  );
}
