import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import TripSignIn from "../../components/TripSignIn";

// thenautiyachti.com/trip -- the way back to a trip page for a guest who has
// lost the link. Booking number and the phone number on the booking; the
// route answers with the link and the browser goes there. See lib/tripLink.js.
export const metadata = {
  title: "Guest login",
  robots: { index: false, follow: false },
};

export default function TripSignInPage() {
  return (
    <div>
      <NavBar />
      <div style={{ background: "var(--ink-soft)", minHeight: "60vh", padding: "48px 24px 64px" }}>
        <div style={{ maxWidth: 460, margin: "0 auto" }}>
          <h1 className="display" style={{ fontSize: 32, color: "var(--text)", margin: "0 0 10px" }}>
            Guest login
          </h1>
          <p style={{ color: "var(--text)", opacity: 0.85, lineHeight: 1.65, fontSize: 15, margin: "0 0 12px" }}>
            Your own page for your charter: the time, the meeting point and what to bring,
            what you have paid, a place to send us your photos and video, and messages
            with the captain.
          </p>
          <p style={{ color: "var(--text)", opacity: 0.85, lineHeight: 1.65, fontSize: 15, margin: "0 0 22px" }}>
            The quickest way in is the link in your booking confirmation. Or sign in here
            with your booking number and the phone number you booked with.
          </p>
          <TripSignIn />
          {/* A party member who was not the one who booked has no link and no
              number on file. The public share page still takes their photos. */}
          <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: 13.5, margin: "22px 0 0" }}>
            Were you a guest on somebody else&rsquo;s booking? Ask them to forward their trip
            link, or{" "}
            <a href="/share-your-photos" style={{ color: "var(--purple)" }}>send us your photos here</a>.
          </p>
        </div>
      </div>
      <PageFooter />
    </div>
  );
}
