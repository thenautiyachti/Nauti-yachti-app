import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import TripSignIn from "../../components/TripSignIn";

// thenautiyachti.com/trip -- the way back to a trip page for a guest who has
// lost the link. Booking number and the phone number on the booking; the
// route answers with the link and the browser goes there. See lib/tripLink.js.
export const metadata = {
  title: "Your trip",
  robots: { index: false, follow: false },
};

export default function TripSignInPage() {
  return (
    <div>
      <NavBar />
      <div style={{ background: "var(--ink-soft)", minHeight: "60vh", padding: "48px 24px 64px" }}>
        <div style={{ maxWidth: 460, margin: "0 auto" }}>
          <h1 className="display" style={{ fontSize: 32, color: "var(--text)", margin: "0 0 10px" }}>
            Find your trip
          </h1>
          <p style={{ color: "var(--text)", opacity: 0.85, lineHeight: 1.65, fontSize: 15, margin: "0 0 22px" }}>
            Your trip page has the time, the meeting point and what to bring, and it is
            where you send us your photos afterwards. The link is in your booking
            confirmation. Lost it? Enter your booking number and the phone number you
            booked with.
          </p>
          <TripSignIn />
        </div>
      </div>
      <PageFooter />
    </div>
  );
}
