import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import PhotoRequestForm from "../../components/PhotoRequestForm";
import { GOOGLE_REVIEW_URL, FACEBOOK_REVIEW_URL } from "../../lib/reviews";

// thenautiyachti.com/thanks
//
// The QR code on the boat. One code, every charter -- unlike /glow/crew, which
// is tied to a single night.
//
// WHAT THIS PAGE IS FOR. The business cannot reach its own past guests: 17 of
// 39 charters carry no phone number and no email address, because Boatsetter
// and GetMyBoat relay messages rather than pass on a way to contact anybody.
// Once the guests step off the dock they are gone, and 53 charters have
// produced one Google review.
//
// WHY IT LEADS WITH PHOTOS. "Join our mailing list" is a request. "Here are
// the photos of you from this afternoon" is an offer, and it is the only thing
// on this page a guest actually wants at the moment they scan it. The contact
// detail arrives as a by-product. That only works while the promise is real,
// which is why the request lands in the owner console unfulfilled until
// somebody has genuinely sent that guest their pictures.
//
// WHY THE REVIEW ASK IS A SEPARATE SECTION, ALWAYS VISIBLE. It sits outside
// the form and is shown whether or not the guest fills anything in, and the
// photos never depend on it. Google's policy prohibits both incentivised
// reviews and review gating -- filtering who gets asked by how happy they seem
// -- with penalties running to $51,744 a violation as of 2026. "Leave a review
// and we'll send your photos" would be exactly that. So the ask is made to
// everyone, plainly, and the answer changes nothing.
export const metadata = {
  title: "Thanks for coming out",
  description: "Get your photos from today's charter on Lake Conroe.",
  // A QR destination, not a landing page. Indexing it would put a bare form in
  // front of strangers searching for charters and dilute the pages that sell.
  robots: { index: false, follow: false },
};

// Today on Lake Conroe, as YYYY-MM-DD.
//
// Central time explicitly, never the server's clock: Vercel runs UTC, so from
// 7pm onward a boat that came in this evening would prefill tomorrow's date --
// and the sunset cruises are exactly the trips that end after 7.
function todayInTexas() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default async function ThanksPage({ searchParams }) {
  // searchParams is a promise as of Next 15.
  const params = await searchParams;
  // ?d=2026-09-05 lets one printed code serve a specific day if the captain
  // ever wants that; without it, today is right for anyone scanning on board.
  const d = params && params.d;
  const defaultDate = /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? d : todayInTexas();

  return (
    <div>
      <NavBar />

      <div style={{ background: "var(--ink)", padding: "56px 24px 20px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto", textAlign: "center" }}>
          <div
            className="mono"
            style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}
          >
            THANKS FOR COMING OUT
          </div>
          <h1
            className="display"
            style={{
              fontSize: "clamp(32px, 6vw, 52px)",
              margin: 0,
              lineHeight: 1,
              fontWeight: 800,
              color: "var(--text)",
            }}
          >
            We got photos of you today
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "var(--text)",
              opacity: 0.86,
              lineHeight: 1.65,
              margin: "20px auto 0",
            }}
          >
            Somebody was filming most of the day — the tubing, the swimming, whatever
            you got up to out there. Tell us where to send it and we'll get the lot
            over to you, free.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "32px 24px 40px" }}>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid rgba(203,108,230,0.25)",
            borderRadius: 12,
            padding: "22px 22px 24px",
            maxWidth: 560,
            margin: "0 auto",
          }}
        >
          <div
            className="display"
            style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}
          >
            Send me my photos
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--text)",
              opacity: 0.85,
              lineHeight: 1.6,
              margin: "0 0 18px",
            }}
          >
            A number or an email — whichever you'd rather. Takes about fifteen seconds.
          </p>
          <PhotoRequestForm defaultDate={defaultDate} />
        </div>

        {/* Separate card, and deliberately below the fold of the form. The
            photos are settled by the time anybody reads this, so it cannot be
            mistaken for a condition of getting them. */}
        <div
          style={{
            maxWidth: 560,
            margin: "24px auto 0",
            border: "1px solid rgba(203,108,230,0.18)",
            borderRadius: 12,
            padding: "20px 22px 22px",
          }}
        >
          <div
            className="display"
            style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}
          >
            While you're here
          </div>
          <p
            style={{
              fontSize: 14.5,
              color: "var(--text)",
              opacity: 0.88,
              lineHeight: 1.65,
              margin: "0 0 16px",
            }}
          >
            We're a small family-run outfit on Lake Conroe — no fleet office, no
            marketing budget. Reviews are genuinely how new guests find us. If today
            was a good day, an honest word takes about thirty seconds. Your photos are
            on their way either way.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <a
              href={GOOGLE_REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: "1 1 200px",
                textAlign: "center",
                background: "linear-gradient(135deg, var(--purple), var(--pink))",
                color: "#0A0612",
                borderRadius: 6,
                padding: "13px 16px",
                fontSize: 15,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Review us on Google ↗
            </a>
            <a
              href={FACEBOOK_REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: "1 1 200px",
                textAlign: "center",
                border: "1px solid var(--purple)",
                color: "var(--purple)",
                borderRadius: 6,
                padding: "13px 16px",
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Recommend us on Facebook ↗
            </a>
          </div>
        </div>
      </div>

      <PageFooter />
    </div>
  );
}
