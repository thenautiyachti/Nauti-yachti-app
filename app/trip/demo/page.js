import { notFound } from "next/navigation";
import TripPageView from "../../../components/TripPageView";
import { tripView } from "../../../lib/tripInfo";
import { lakeTodayKey } from "../../../lib/eventSeats";
import { isAdminAuthenticated } from "../../../lib/auth-guard";

// thenautiyachti.com/trip/demo -- what a trip page looks like, with no booking
// behind it, so it can be looked at without opening a real guest's trip. The
// boat is real fleet; the booking is not, and the page says so.
//
// ON THE LIVE SITE, ONLY FOR THE OWNER. Owner, 2 Oct 2026, wanting to "see the
// customer's login console, example": the console links here, and a signed-in
// session sees it. Everyone else gets a plain not-found, so a made-up booking is
// never something a guest or a search engine can land on.
//
//   ?phase=today | past    the day itself, or afterwards (default: ten days out)
//   ?glow=1                a Boatz & Glowz seat instead of a private charter
//   ?paid=0                show the pay-the-balance state
export const metadata = { title: "Trip page demo", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function shiftDays(dateKey, days) {
  const d = new Date(dateKey + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function TripDemoPage({ searchParams }) {
  if (process.env.VERCEL_ENV === "production" && !(await isAdminAuthenticated())) notFound();
  const sp = (await searchParams) || {};
  const today = lakeTodayKey();
  const date = sp.phase === "today" ? today : sp.phase === "past" ? shiftDays(today, -3) : shiftDays(today, 10);
  const glow = sp.glow === "1";
  const paid = sp.paid !== "0";

  const trip = glow
    ? { ref: "NY-" + date.replace(/-/g, "") + "-01", status: "booked", paymentStatus: paid ? "paid" : "unpaid", platform: "Website",
        name: null, date, packageId: "glowz", packageName: "Boatz & Glowz", vesselId: "explorer", vesselName: "Nauti Explorer",
        partySize: 2, priceQuoted: 100, payId: paid ? null : "demo" }
    : { ref: "NY-" + date.replace(/-/g, "") + "-01", status: "booked", paymentStatus: paid ? "paid" : "unpaid", platform: "Direct",
        name: null, date, startTime: "10:00", hours: 4, packageId: "tubing", packageName: "Tubing", vesselId: "explorer",
        vesselName: "Nauti Explorer", partySize: 10, priceQuoted: 600, payId: paid ? null : "demo",
        packageBullets: [] };

  return <TripPageView view={tripView(trip)} tripRef={trip.ref} tripKey="demo" demo />;
}
