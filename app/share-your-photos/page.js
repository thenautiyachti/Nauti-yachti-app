import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import { pageMetadata } from "../../lib/seo";
import UploadForm from "../../components/UploadForm";

export const metadata = pageMetadata({
  title: "Share Your Photos & Video",
  description:
    "Were you out with us on Lake Conroe? Send us the photos and video from your phone — pick your trip, upload straight from the camera roll, and we'll do the rest.",
  path: "/share-your-photos",
});

// The page is deliberately quiet about what happens next.
//
// A guest sending in their night does not need the pipeline explained to them;
// they need to know it arrived, that a person will look at it, and that nothing
// goes out with their face on it without somebody deciding to put it there.
export default function ShareYourPhotosPage() {
  return (
    <>
      <NavBar />
      <main style={{ background: "var(--paper)", minHeight: "70vh" }}>
        <section style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px 24px" }}>
          <p
            style={{
              fontFamily: "ui-monospace, monospace", fontSize: 11.5, letterSpacing: "0.16em",
              textTransform: "uppercase", color: "var(--purple)", margin: "0 0 10px",
            }}
          >
            Lake Conroe
          </p>
          <h1 style={{ fontSize: "clamp(30px,6vw,46px)", lineHeight: 1.05, margin: "0 0 14px", textWrap: "balance" }}>
            Send us your photos and video
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--muted)", margin: "0 0 8px", maxWidth: "62ch" }}>
            The best shots from any trip are usually the ones our guests took, not
            us. If you were out with us, send them over — straight from your camera
            roll, as big as they come.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--muted)", margin: 0, maxWidth: "62ch" }}>
            A real person looks at everything before it goes anywhere, and we will
            never post something just because you sent it.
          </p>
        </section>

        <section style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 64px" }}>
          {/* Booked guests belong on their own trip page, where the upload is
              tied to their booking for certain (owner, 2 Oct 2026: that is
              "where their photo upload should be"). This page stays for a party
              member with no link of their own. */}
          <p style={{
            fontSize: 15, lineHeight: 1.55, color: "var(--text)", margin: "0 0 18px",
            padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(203,108,230,0.35)",
            background: "rgba(203,108,230,0.08)",
          }}>
            <strong>Booked with us?</strong> Use your{" "}
            <a href="/trip" style={{ color: "var(--purple)", fontWeight: 700 }}>Guest Login</a>{" "}
            instead. Your photos go straight onto your booking, and your group can add theirs.
          </p>
          <UploadForm />
        </section>
      </main>
      <PageFooter />
    </>
  );
}
