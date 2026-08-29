import { prisma } from "../lib/db";
import { parsePackage, groupBlockedDates, groupExternalBookingState } from "../lib/serialize";
import { getLakeConroeForecast } from "../lib/weather";
import SiteView from "../components/SiteView";

// Server component: loads everything the public page needs in one shot
// (no client-side loading spinner needed for first paint).
export default async function HomePage() {
  const [packageRows, vessels, gallery, blockedRows, externalBookingRows, forecast, testimonials, addOns] = await Promise.all([
    prisma.package.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.vessel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.galleryItem.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.blockedDate.findMany(),
    prisma.externalBooking.findMany({ where: { status: { not: "cancelled" } } }),
    getLakeConroeForecast(),
    prisma.testimonial.findMany({ where: { status: "approved" }, orderBy: { submittedAt: "desc" } }),
    prisma.addOn.findMany({ where: { active: true, archived: false }, orderBy: { sortOrder: "asc" } }),
  ]);

  const packages = packageRows.map(parsePackage);
  const blocked = groupBlockedDates(blockedRows);
  const partialDates = groupExternalBookingState(externalBookingRows);

  return (
    <SiteView
      initialPackages={packages}
      initialVessels={vessels}
      initialGallery={gallery}
      initialBlocked={blocked}
      initialPartialDates={partialDates}
      forecast={forecast}
      initialTestimonials={testimonials}
      initialAddOns={addOns}
    />
  );
}
