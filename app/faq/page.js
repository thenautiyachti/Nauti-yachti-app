import Link from "next/link";
import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import JsonLd from "../../components/JsonLd";
import { FAQ_ITEMS } from "../../lib/faqContent";
import { pageMetadata, faqJsonLd, breadcrumbJsonLd, PHONE_DISPLAY, PHONE_E164 } from "../../lib/seo";

export const metadata = pageMetadata({
  title: "Lake Conroe Boat Charter FAQ — Booking, Weather & Licence Rules",
  description:
    "Answers to the common questions about renting a boat on Lake Conroe: whether you need a boating licence in Texas, what is included, deposits, the weather and cancellation policy, alcohol, age limits and what to bring.",
  path: "/faq",
});

export default function FaqPage() {
  const jsonLd = [
    faqJsonLd(FAQ_ITEMS),
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "FAQ", path: "/faq" },
    ]),
  ];

  return (
    <div>
      <NavBar />
      <JsonLd data={jsonLd} />

      <div style={{ background: "var(--ink)", padding: "56px 24px 26px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            FREQUENTLY ASKED QUESTIONS
          </div>
          <h1 className="display" style={{ fontSize: "clamp(30px, 5.5vw, 50px)", margin: 0, lineHeight: 1.05, fontWeight: 800, color: "var(--text)" }}>
            Lake Conroe boat charter questions, answered
          </h1>
          <p style={{ fontSize: 16.5, color: "var(--text)", opacity: 0.88, lineHeight: 1.7, marginTop: 20 }}>
            Everything people ask us before they book — the Texas boating licence rule, what is
            included, how weather and cancellations work, and what to bring. If your question is not
            here, call or text{" "}
            <a href={`tel:${PHONE_E164}`} style={{ color: "var(--purple)" }}>{PHONE_DISPLAY}</a>.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "40px 24px 56px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              style={{
                borderBottom: "1px solid rgba(203,108,230,0.18)",
                padding: "22px 0",
              }}
            >
              <h2 style={{ fontSize: 19, color: "var(--purple)", margin: "0 0 12px", lineHeight: 1.35 }}>
                {item.q}
              </h2>
              <p style={{ fontSize: 16, color: "var(--text)", opacity: 0.88, lineHeight: 1.7, margin: 0 }}>
                {item.a}
              </p>
            </div>
          ))}

          <div style={{ marginTop: 34 }}>
            <h2 className="display" style={{ fontSize: 24, color: "var(--text)", marginBottom: 12 }}>
              Still deciding?
            </h2>
            <p style={{ fontSize: 16, color: "var(--text)", opacity: 0.88, lineHeight: 1.7 }}>
              Full price tables for every boat are on the{" "}
              <Link href="/packages" style={{ color: "var(--purple)" }}>packages page</Link>, the
              detailed refund rules are in our{" "}
              <Link href="/terms" style={{ color: "var(--purple)" }}>terms and cancellation policy</Link>,
              and live availability for all three vessels is on the{" "}
              <Link href="/#availability" style={{ color: "var(--purple)" }}>home page</Link>.
            </p>
            <Link
              href="/#inquire"
              style={{
                display: "inline-block", marginTop: 10,
                background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612",
                fontWeight: 700, padding: "13px 26px", borderRadius: 6, textDecoration: "none", fontSize: 15,
              }}
            >
              Check availability &amp; book
            </Link>
          </div>
        </div>
      </div>

      <PageFooter />
    </div>
  );
}
