import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";

const APART = [
  {
    title: "Affordable Adventures",
    body: "Competitive, transparent pricing across every package, so guests know exactly what to expect before they book.",
  },
  {
    title: "More Than Just a Rental",
    body: "We build full experiences on the water, not just transportation from one dock to another.",
  },
  {
    title: "Powered by Fun",
    body: "Our male and female captains bring both professionalism and personality to every trip, keeping guests safe while making sure they have a great time.",
  },
];

const WHY_CHOOSE = [
  {
    title: "Expert Captains",
    body: "Experienced, skilled, and dedicated to guest safety and enjoyment on every charter.",
  },
  {
    title: "Exceptional Customer Service",
    body: "Attentive support from the moment you book through the end of your time on the water.",
  },
  {
    title: "Competitive Pricing",
    body: "Affordable rates that never come at the expense of quality or experience.",
  },
  {
    title: "Memorable Experiences",
    body: "Every charter is designed to create moments guests still talk about long after they've docked.",
  },
];

export default function AboutPage() {
  return (
    <div>
      <NavBar />

      <div style={{ background: "var(--ink)", padding: "60px 24px 20px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            ABOUT US
          </div>
          <h1 className="display" style={{ fontSize: "clamp(34px, 6vw, 56px)", margin: 0, lineHeight: 1, fontWeight: 800, color: "var(--text)" }}>
            The Nauti Yachti
          </h1>
          <p style={{ fontSize: 16.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.65, maxWidth: 640, margin: "22px auto 0" }}>
            The Nauti Yachti redefines the boat charter experience on Lake Conroe, helping guests create memorable
            moments on the water through personalized, private charters for any occasion. Our captains are known for
            creating a welcoming atmosphere, with female captains available to lead Lake Conroe excursions alongside
            our male crew.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "50px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2 className="display" style={{ fontSize: 28, color: "var(--text)", marginBottom: 14 }}>Our story</h2>
          <p style={{ fontSize: 15, color: "var(--text)", opacity: 0.85, lineHeight: 1.7 }}>
            The Nauti Yachti began with a passion for the open water and a belief that boating should be fun,
            accessible, and stress-free for everyone. What started as a love for Lake Conroe grew into a charter
            company built around a more personal, affordable, and enjoyable way to get out on the water — one where
            the customer always comes first.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--ink)", padding: "50px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h2 className="display" style={{ fontSize: 28, color: "var(--text)", marginBottom: 22 }}>What sets us apart</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 16 }}>
            {APART.map((item) => (
              <div key={item.title} style={{ background: "var(--card)", border: "1px solid rgba(203,108,230,0.18)", borderRadius: 10, padding: 18 }}>
                <div className="display" style={{ fontSize: 17, color: "var(--purple)", fontWeight: 700, marginBottom: 8 }}>{item.title}</div>
                <div style={{ fontSize: 14, color: "var(--text)", opacity: 0.85, lineHeight: 1.55 }}>{item.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "50px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <h2 className="display" style={{ fontSize: 28, color: "var(--text)", marginBottom: 14 }}>Our mission</h2>
          <p style={{ fontSize: 16, color: "var(--text)", opacity: 0.9, lineHeight: 1.7, fontStyle: "italic" }}>
            To provide a fun, safe, and affordable boat charter experience led by exceptional captains — leaving
            every guest with lasting memories of their time on Lake Conroe.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--ink)", padding: "50px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h2 className="display" style={{ fontSize: 28, color: "var(--text)", marginBottom: 22 }}>Why choose The Nauti Yachti</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 16 }}>
            {WHY_CHOOSE.map((item) => (
              <div key={item.title} style={{ background: "var(--card)", border: "1px solid rgba(203,108,230,0.18)", borderRadius: 10, padding: 18 }}>
                <div className="display" style={{ fontSize: 17, color: "var(--pink)", fontWeight: 700, marginBottom: 8 }}>{item.title}</div>
                <div style={{ fontSize: 14, color: "var(--text)", opacity: 0.85, lineHeight: 1.55 }}>{item.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "56px 24px 70px", textAlign: "center" }}>
        <h2 className="display" style={{ fontSize: 26, color: "var(--text)", marginBottom: 10 }}>Ready to set sail?</h2>
        <p style={{ fontSize: 14.5, color: "var(--muted)", marginBottom: 22 }}>
          Explore our fleet, check out our packages and pricing, and book your Nauti Yachti adventure today.
        </p>
        <a
          href="/#packages"
          style={{
            display: "inline-block", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", fontWeight: 700,
            padding: "13px 28px", borderRadius: 6, textDecoration: "none", fontSize: 15,
          }}
        >
          View packages
        </a>
      </div>

      <PageFooter />
    </div>
  );
}
