import NavBar from "../../../../components/NavBar";
import PageFooter from "../../../../components/PageFooter";
import TripPageView from "../../../../components/TripPageView";
import { verifyTripKey, normalizeRef } from "../../../../lib/tripLink";
import { findTrip } from "../../../../lib/tripBooking";
import { tripView } from "../../../../lib/tripInfo";
import { prisma } from "../../../../lib/db";
import { signedReadUrls } from "../../../../lib/guestUploads";
import { refNeedle } from "../../../../lib/tripPhotos";

// Our approved photos of this trip (Coral proposes, the owner approves), with a
// one-hour link to view and one to download. A failure here never takes the trip
// page down: the gallery simply does not appear.
async function ourPhotosFor(ref) {
  try {
    const rows = await prisma.tripPhoto.findMany({
      where: { status: "approved", bookingRefs: { contains: refNeedle(ref) } },
      orderBy: { createdAt: "asc" },
      select: { id: true, storagePath: true },
    });
    const urls = await signedReadUrls(rows.map((r) => r.storagePath));
    return rows.filter((r) => urls[r.storagePath]).map((r, i) => ({
      id: r.id,
      url: urls[r.storagePath],
      download: urls[r.storagePath] + "&download=" + encodeURIComponent("nauti-yachti-" + ref + "-" + (i + 1) + ".jpg"),
    }));
  } catch {
    return [];
  }
}

// thenautiyachti.com/trip/NY-20260919-03/<key> -- a guest's own trip page.
//
// THE KEY IS CHECKED BEFORE THE BOOKING IS LOOKED UP, and a bad key gets the
// same page as a booking that does not exist. Otherwise the page itself would
// answer "is NY-20260919-03 a real booking?" for anyone who asked. See
// lib/tripLink.js for why the number alone is not enough.
export const metadata = {
  title: "Your trip",
  robots: { index: false, follow: false },
};

// Always the live row: a time the owner changed this morning must show now.
export const dynamic = "force-dynamic";

function NotFound() {
  return (
    <div>
      <NavBar />
      <div style={{ background: "var(--ink-soft)", minHeight: "60vh", padding: "48px 24px 64px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <h1 className="display" style={{ fontSize: 30, color: "var(--text)", margin: "0 0 10px" }}>
            We couldn&rsquo;t open that trip
          </h1>
          <p style={{ color: "var(--text)", opacity: 0.85, lineHeight: 1.65, fontSize: 15 }}>
            The link may have been copied incompletely. Try it again from your confirmation, or{" "}
            <a href="/trip" style={{ color: "var(--purple)" }}>find your trip</a> with your booking number and
            phone number. Still stuck? Call or text{" "}
            <a href="tel:+18329482912" style={{ color: "var(--purple)" }}>(832) 948-2912</a>.
          </p>
        </div>
      </div>
      <PageFooter />
    </div>
  );
}

export default async function TripPage({ params }) {
  const { ref: rawRef, k } = await params;
  // A mangled link ("%E0" from a bad copy) must get the not-found page, not a
  // crash: decodeURIComponent throws on a broken escape.
  let decoded = "";
  try { decoded = decodeURIComponent(rawRef || ""); } catch { decoded = ""; }
  const ref = normalizeRef(decoded);
  if (!ref || !verifyTripKey(ref, k)) return <NotFound />;

  const trip = await findTrip(ref);
  if (!trip) return <NotFound />;

  return <TripPageView view={tripView(trip)} tripRef={ref} tripKey={k} ourPhotos={await ourPhotosFor(ref)} />;
}
