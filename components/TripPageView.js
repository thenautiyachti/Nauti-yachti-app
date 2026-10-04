import NavBar from "./NavBar";
import PageFooter from "./PageFooter";
import TripUploads from "./TripUploads";
import TripMessages from "./TripMessages";
import { TRIP_UPLOAD_CONSENT } from "../lib/uploadConsent";

// The guest's trip page, drawn from lib/tripInfo.js's tripView. Server
// component: the only interactive parts are the photo box and the message
// board, which are their own client components.
//
// ORDER IS BY WHAT THEY NEED NOW. Before the trip: when, where, what to bring.
// On the day: the same, with the photo box open. After: photos and the review
// first, because nobody needs directions to a trip they have already been on.

const CARD = {
  background: "var(--ink)", borderRadius: 14, padding: "18px 20px",
  border: "1px solid rgba(203,108,230,0.18)", margin: "0 0 16px",
};
const H2 = { fontSize: 17, color: "var(--text)", margin: "0 0 12px", fontWeight: 700 };
const P = { color: "var(--text)", opacity: 0.88, lineHeight: 1.65, fontSize: 14.5, margin: "0 0 10px" };
const SMALL = { color: "var(--muted)", fontSize: 13, lineHeight: 1.55, margin: "8px 0 0" };

function Line({ label, value, strong }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px solid rgba(203,108,230,0.12)" }}>
      <span style={{ color: "var(--muted)", fontSize: 13.5 }}>{label}</span>
      <span style={{ color: "var(--text)", fontSize: 13.5, fontWeight: strong ? 800 : 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function telHref(phone) {
  return "tel:+1" + String(phone || "").replace(/\D/g, "").slice(-10);
}

function Banner({ view }) {
  const first = view.firstName ? ", " + view.firstName : "";
  const copy = {
    upcoming: ["You're booked" + first, "Everything for the day is on this page. Bookmark it, or forward it to your group."],
    today: ["Today's the day" + first, "See you at the water. If anything's going sideways, call us."],
    past: ["Thanks for coming out" + first, "Send us your photos and video below. We'd love to see the day from your side."],
    cancelled: ["This booking was cancelled", "If that's news to you, call or text us and we'll sort it out."],
    unconfirmed: ["Not confirmed yet", "Your date isn't held until it's paid. Pay below, or message us if anything needs changing."],
  }[view.phase] || ["Your trip", ""];
  return (
    <div style={{ margin: "0 0 20px" }}>
      <h1 className="display" style={{ fontSize: 32, color: "var(--text)", margin: "0 0 8px" }}>{copy[0]}</h1>
      {copy[1] && <p style={{ ...P, margin: 0 }}>{copy[1]}</p>}
    </div>
  );
}

function Details({ view }) {
  return (
    <section style={CARD}>
      <h2 style={H2}>Your charter</h2>
      <Line label="Date" value={view.when || "To be confirmed"} />
      <Line label="Package" value={view.packageName} />
      <Line label="Boat" value={view.vesselName} />
      <Line label="Hours" value={view.hours ? String(view.hours) : null} />
      <Line label={view.seatsLabel} value={view.partySize} />
      <Line label="Booking number" value={view.ref} />
    </section>
  );
}

function GettingThere({ view }) {
  const d = view.directions;
  const where = d.glow ? d.meetingPoint : d.address;
  return (
    <section style={CARD}>
      <h2 style={H2}>Getting there</h2>
      {where ? (
        <>
          <Line label={d.glow ? "Meeting point" : "Address"} value={where} />
          <Line label={d.glow ? "Check in" : "Be there by"} value={d.arriveBy} />
          <Line label={d.glow ? "Lines off" : "Start time"} value={d.startTime} />
          <Line label="Back" value={d.backAt} />
          <p style={{ margin: "12px 0 0" }}>
            <a href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(where)}
              target="_blank" rel="noopener noreferrer" style={{ color: "var(--purple)", fontWeight: 600, fontSize: 14 }}>
              Open in Maps
            </a>
          </p>
        </>
      ) : (
        <>
          <Line label="Start time" value={d.startTime} />
          <p style={P}>We&rsquo;ll be in touch before your day with the meeting point.</p>
        </>
      )}
      {!d.glow && where && d.startTime && (
        <p style={SMALL}>Arriving early matters: boarding and the safety briefing otherwise come out of your booked hours.</p>
      )}
      {d.note && <p style={SMALL}>{d.note}</p>}
      {d.gateByText && <p style={SMALL}>It&rsquo;s a gated dock. We text you the gate code on the morning of your charter.</p>}
      <p style={SMALL}>
        Running late or lost? Call or text <a href={telHref(d.contactPhone)} style={{ color: "var(--purple)" }}>{d.contactPhone}</a>.
      </p>
    </section>
  );
}

function Money({ view }) {
  const m = view.money;
  if (m.platform) {
    return (
      <section style={CARD}>
        <h2 style={H2}>Payment</h2>
        <p style={{ ...P, margin: 0 }}>
          You booked and paid through {m.platform}, so your receipt and any changes to the payment are in your {m.platform} account.
        </p>
      </section>
    );
  }
  if (!m.lines.length && !m.balance) return null;
  return (
    <section style={CARD}>
      <h2 style={H2}>Payment</h2>
      {m.lines.map((l) => <Line key={l.label} label={l.label} value={l.value} strong={l.strong} />)}
      {m.balance && <Line label="Still to pay" value={m.balance} strong />}
      {m.payPath && (
        <a href={m.payPath} style={{
          display: "block", textAlign: "center", marginTop: 14, textDecoration: "none",
          background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612",
          borderRadius: 8, padding: "13px", fontWeight: 700, fontSize: 15.5,
        }}>
          Pay {m.balance} securely
        </a>
      )}
    </section>
  );
}

function Bring({ view }) {
  const hasBring = view.bring && (view.bring.text || (view.bring.list && view.bring.list.length));
  if (!hasBring && !view.included) return null;
  return (
    <section style={CARD}>
      {view.included && (
        <>
          <h2 style={H2}>What&rsquo;s included</h2>
          <ul style={{ ...P, paddingLeft: 20 }}>
            {view.included.map((x) => <li key={x} style={{ marginBottom: 4 }}>{x}</li>)}
          </ul>
        </>
      )}
      {hasBring && (
        <>
          <h2 style={{ ...H2, marginTop: view.included ? 16 : 0 }}>What to bring</h2>
          {view.bring.list
            ? <ul style={{ ...P, paddingLeft: 20 }}>{view.bring.list.map((x) => <li key={x} style={{ marginBottom: 4 }}>{x}</li>)}</ul>
            : <p style={{ ...P, margin: 0 }}>{view.bring.text}</p>}
        </>
      )}
    </section>
  );
}

function Review({ view }) {
  if (!view.review) return null;
  return (
    <section style={CARD}>
      <h2 style={H2}>How was it?</h2>
      <p style={P}>
        A review is the single biggest help to a small business like ours. It takes a minute, and
        whatever you thought, we want to hear it.
      </p>
      <a href={view.review.google} target="_blank" rel="noopener noreferrer" style={{
        display: "block", textAlign: "center", textDecoration: "none", margin: "12px 0 8px",
        background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612",
        borderRadius: 8, padding: "13px", fontWeight: 700, fontSize: 15.5,
      }}>
        Leave a Google review
      </a>
      <a href={view.review.facebook} target="_blank" rel="noopener noreferrer"
        style={{ display: "block", textAlign: "center", color: "var(--purple)", fontSize: 14, fontWeight: 600 }}>
        or recommend us on Facebook
      </a>
    </section>
  );
}

// Our photos of their trip: the ones the owner approved from what Coral picked.
// After the trip, an empty gallery says they are coming rather than vanishing,
// so a guest knows to look back.
function OurPhotos({ view, photos }) {
  const list = photos || [];
  if (!list.length && view.phase !== "past") return null;
  return (
    <section style={CARD}>
      <h2 style={H2}>Our photos from your trip</h2>
      {!list.length ? (
        <p style={{ ...P, margin: 0 }}>
          We&rsquo;re picking the best shots from your day. They&rsquo;ll appear here once they&rsquo;re ready.
        </p>
      ) : (
        <>
          <p style={{ ...P, margin: "0 0 12px" }}>Yours to keep. Tap one to see it full size, or download it.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {list.map((p, i) => (
              <div key={p.id}>
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", aspectRatio: "4 / 3", borderRadius: 8, overflow: "hidden", background: "var(--ink-soft)" }}>
                  <img src={p.url} alt={"Photo " + (i + 1) + " from your trip"} loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </a>
                <a href={p.download} style={{ display: "block", textAlign: "center", fontSize: 12.5, color: "var(--purple)", marginTop: 4 }}>
                  Download
                </a>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function GoodToKnow({ view }) {
  if (!view.goodToKnow.length) return null;
  return (
    <section style={CARD}>
      <h2 style={H2}>Good to know</h2>
      {view.goodToKnow.map((f) => (
        <details key={f.q} style={{ borderBottom: "1px solid rgba(203,108,230,0.12)", padding: "10px 0" }}>
          <summary style={{ cursor: "pointer", color: "var(--text)", fontSize: 14.5, fontWeight: 600 }}>{f.q}</summary>
          <p style={{ ...P, margin: "8px 0 0", fontSize: 14 }}>{f.a}</p>
        </details>
      ))}
    </section>
  );
}

export default function TripPageView({ view, tripRef, tripKey, demo = false, ourPhotos = [] }) {
  const after = view.phase === "past";
  const off = view.phase === "cancelled";
  const photos = (
    <TripUploads tripRef={tripRef} tripKey={tripKey} canUpload={view.canUpload} demo={demo}
      defaultName={view.firstName || ""} consentText={TRIP_UPLOAD_CONSENT} />
  );
  const messages = (
    <TripMessages tripRef={tripRef} tripKey={tripKey} demo={demo} defaultName={view.firstName || ""}
      contactPhone={view.directions.contactPhone} />
  );

  return (
    <div>
      <NavBar />
      <div style={{ background: "var(--ink-soft)", minHeight: "60vh", padding: "40px 18px 64px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {demo && (
            <p style={{ ...SMALL, margin: "0 0 14px", padding: "8px 12px", border: "1px dashed var(--muted)", borderRadius: 8 }}>
              Demo page with a made-up booking. Nothing on it is sent anywhere. Try ?phase=today, ?phase=past or ?glow=1.
            </p>
          )}
          <Banner view={view} />
          {after ? (
            <>
              <OurPhotos view={view} photos={ourPhotos} />
              {photos}
              <Review view={view} />
              <Details view={view} />
              <Money view={view} />
              {messages}
            </>
          ) : off ? (
            <>
              <Details view={view} />
              <Money view={view} />
              {messages}
            </>
          ) : (
            <>
              <Details view={view} />
              <GettingThere view={view} />
              <Money view={view} />
              <Bring view={view} />
              {photos}
              {messages}
              <GoodToKnow view={view} />
            </>
          )}
          {/* The same line on every trip page, whether or not this guest has
              other trips: a forwarded link must not reveal the booker's other
              bookings. Guest Login, with the phone, lists them (3 Oct 2026). */}
          <p style={{ ...SMALL, margin: "18px 0 0", textAlign: "center" }}>
            Been out with us more than once?{" "}
            <a href="/trip" style={{ color: "var(--purple)" }}>Guest Login</a> with the phone you booked with shows all your trips.
          </p>
        </div>
      </div>
      <PageFooter />
    </div>
  );
}
