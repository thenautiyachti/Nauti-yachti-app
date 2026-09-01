import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import JsonLd from "../../components/JsonLd";
import GiftCertificateForm from "../../components/GiftCertificateForm";
import { pageMetadata, breadcrumbJsonLd, PHONE_DISPLAY, PHONE_E164 } from "../../lib/seo";

export const metadata = pageMetadata({
  title: "Gift Certificates — Lake Conroe Boat Charters",
  description:
    "Give a day on Lake Conroe. Nauti Yachti gift certificates never expire, can be spent across more than one trip, and the code arrives the moment you buy. Any amount from $25.",
  path: "/gift-certificates",
});

const SECTION = { maxWidth: 1100, margin: "0 auto" };

export default function GiftCertificatesPage() {
  const crumbs = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Gift Certificates", path: "/gift-certificates" },
  ]);

  return (
    <div>
      <NavBar />
      <JsonLd data={[crumbs]} />

      <div style={{ background: "var(--ink)", padding: "56px 24px 26px" }}>
        <div style={{ ...SECTION, maxWidth: 820 }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            GIFT CERTIFICATES
          </div>
          <h1 className="display" style={{ fontSize: "clamp(30px, 5.5vw, 50px)", margin: 0, lineHeight: 1.05, fontWeight: 800, color: "var(--text)" }}>
            Give a day on Lake Conroe
          </h1>
          <p style={{ fontSize: 16.5, color: "var(--text)", opacity: 0.88, lineHeight: 1.7, marginTop: 20 }}>
            Harder to wrap than a jumper, better to open. A Nauti Yachti gift certificate covers any
            of our charters — tubing and wakeboarding, a birthday out on the water, a sunset cruise,
            or a day at Party Cove — on whichever boat suits the group.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "40px 24px 56px" }}>
        <div style={{ ...SECTION, display: "grid", gap: 36, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <div>
            <h2 className="display" style={{ fontSize: 22, color: "var(--text)", marginTop: 0, marginBottom: 14 }}>
              How it works
            </h2>
            <ul style={{ fontSize: 15.5, color: "var(--text)", opacity: 0.88, lineHeight: 1.75, paddingLeft: 18, margin: 0 }}>
              <li><strong>It never expires.</strong> There is no clock on it and no fee for sitting unused.</li>
              <li><strong>It does not have to be spent at once.</strong> The balance carries over, so a $500 certificate can cover a short trip now and more later.</li>
              <li><strong>Any charter, any boat.</strong> Redeem it against any package on any of our three vessels.</li>
              <li><strong>Redeem online or by phone.</strong> Enter the code at checkout, or mention it when you call.</li>
              <li><strong>It arrives immediately.</strong> The code shows the moment payment clears, so a last-minute present still works.</li>
            </ul>
            <p style={{ fontSize: 15, color: "var(--text)", opacity: 0.8, lineHeight: 1.7, marginTop: 18 }}>
              Buying for a big group, or want it presented a particular way? Call or text{" "}
              <a href={`tel:${PHONE_E164}`} style={{ color: "var(--purple)" }}>{PHONE_DISPLAY}</a> and
              we will sort it out.
            </p>
          </div>

          <div style={{ background: "var(--ink)", borderRadius: 12, padding: 24, border: "1px solid rgba(203,108,230,0.25)" }}>
            <GiftCertificateForm />
          </div>
        </div>
      </div>

      <PageFooter />
    </div>
  );
}
