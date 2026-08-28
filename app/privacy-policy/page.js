import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";

const SECTIONS = [
  {
    title: "1. Introduction",
    body: [
      `Welcome to The Nauti Yachti LLC ("The Nauti Yachti," "we," "us," or "our"). We are committed to protecting your privacy and handling your personal information responsibly. This Privacy Policy describes how we collect, use, and share information through our website, booking process, and related services (collectively, the "Services").`,
    ],
  },
  {
    title: "2. Information We Collect",
    body: [
      "We may collect the following types of information when you interact with our Services:",
    ],
    bullets: [
      "Personal Information — name, email address, phone number, mailing address, date of birth, and payment information.",
      "Booking Information — details related to charter reservations, including the type of charter, dates, number of guests, preferences, and any additional services requested.",
      "Communication Data — records of interactions, such as emails, phone calls, and other forms of communication.",
      "Website Usage Data — information about your use of our website, such as IP address, browser type, operating system, and browsing activity.",
      "Other Information — any other information you provide to us voluntarily.",
    ],
  },
  {
    title: "3. How Information Is Collected",
    body: ["We collect information through the following methods:"],
    bullets: [
      "Directly from you — when you provide information during the booking process, through online forms, or when communicating with us.",
      "Automatically — through cookies and other tracking technologies when you use our website.",
      "From third parties — information we may receive from business partners or service providers who assist with our operations.",
    ],
  },
  {
    title: "4. How Information Is Used",
    body: ["We use the information we collect for the following purposes:"],
    bullets: [
      "Providing and managing charter reservations — processing bookings, communicating about your charter, and facilitating your experience.",
      "Improving our Services — analyzing usage data and feedback to enhance our website, services, and customer experience.",
      "Marketing and promotional purposes — sending newsletters, special offers, and information about our services, with your consent.",
      "Customer support — responding to inquiries, providing assistance, and resolving issues.",
      "Legal and compliance purposes — complying with legal obligations, enforcing our policies, and protecting our rights.",
    ],
  },
  {
    title: "5. Sharing Information",
    body: ["We may share your information with third parties in the following circumstances:"],
    bullets: [
      "Service Providers — third parties who assist with our operations, such as payment processors, marketing platforms, and website hosting providers.",
      "Business Partners — partners who offer complementary services, such as yacht owners or transport organizers.",
      "Legal and Regulatory Authorities — when required by law, court order, or to comply with legal and regulatory obligations.",
      "Business Transfers — if we are involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction.",
    ],
  },
  {
    title: "6. Data Security",
    body: [
      "We implement reasonable security measures to protect your personal information from unauthorized access, use, or disclosure. However, no data transmission over the internet or method of electronic storage is 100% secure.",
    ],
  },
  {
    title: "7. Data Retention",
    body: [
      "We retain personal information only as long as necessary for the purposes outlined in this Privacy Policy, or as required by law.",
    ],
  },
  {
    title: "8. Your Rights",
    body: ["Depending on your location and applicable privacy laws, you may have certain rights regarding your personal information, including the right to:"],
    bullets: [
      "Access, rectify, or delete your information.",
      "Restrict or object to the processing of your information.",
      "Receive a copy of your data for portability.",
      "Withdraw consent to processing for specific purposes.",
    ],
  },
  {
    title: "9. Children's Privacy",
    body: [
      "Our Services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children without parental consent.",
    ],
  },
  {
    title: "10. Third-Party Links",
    body: [
      "Our website may contain links to third-party websites with different privacy policies. The Nauti Yachti LLC is not responsible for the privacy practices of those websites.",
    ],
  },
  {
    title: "11. Changes to This Privacy Policy",
    body: [
      "This Privacy Policy may be updated from time to time. Any revised policy will be posted on our website, and the effective date will be updated accordingly.",
    ],
  },
  {
    title: "12. Contact Information",
    body: [
      "For questions or concerns about this Privacy Policy or our data practices, please contact us:",
      "The Nauti Yachti LLC — TheNautiYachti@Gmail.com — 832-948-2912",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div>
      <NavBar />

      <div style={{ background: "var(--ink)", padding: "60px 24px 40px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            LEGAL
          </div>
          <h1 className="display" style={{ fontSize: "clamp(32px, 5vw, 48px)", margin: 0, lineHeight: 1, fontWeight: 800, color: "var(--text)" }}>
            Privacy Policy
          </h1>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 12 }}>Effective Date: June 20, 2025</div>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "10px 24px 60px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", display: "grid", gap: 26 }}>
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="display" style={{ fontSize: 19, color: "var(--purple)", marginBottom: 8, fontWeight: 700 }}>{s.title}</h2>
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
