import { prisma } from "../lib/db";
import { parsePackage, groupBlockedDates, groupExternalBookingState } from "../lib/serialize";
import { getLakeConroeForecast } from "../lib/weather";
import SiteView from "../components/SiteView";
import { pageMetadata } from "../lib/seo";

// The home page targets the head term ("boat charter Lake Conroe") and the
// commercial variants people actually type. The root layout's title template
// is bypassed here with an explicit absolute title so the brand name is not
// appended twice.
export const metadata = {
  ...pageMetadata({
    title: "Boat Charters on Lake Conroe, TX | The Nauti Yachti",
    description:
      "Private boat charters and party boat rentals on Lake Conroe, TX. Tubing, birthday, bachelorette, Party Cove and corporate charters for up to 14 guests, plus a self-drive pontoon rental. Call (832) 948-2912.",
    path: "/",
  }),
  title: {
    absolute: "Boat Charters on Lake Conroe, TX | The Nauti Yachti",
  },
  keywords: [
    "boat charter Lake Conroe",
    "party boat rental Conroe TX",
    "pontoon rental Lake Conroe",
    "boat rental Montgomery TX",
    "Lake Conroe boat rental with captain",
  ],
};

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
    prisma.testimonial.findMany({
      where: { status: "approved" },
      orderBy: { submittedAt: "desc" },
      // Only what the public card renders. Selecting the whole row shipped the
      // guest's full surname to every visitor inside the page payload, where
      // "view source" reads it just fine -- abbreviating it at render time hid
      // it from the page but not from the browser.
      select: { id: true, name: true, rating: true, quote: true, charterDate: true },
    }),
    prisma.addOn.findMany({ where: { active: true, archived: false }, orderBy: { sortOrder: "asc" } }),
  ]);

  const packages = packageRows.map(parsePackage);
  const blocked = groupBlockedDates(blockedRows);
  const partialDates = groupExternalBookingState(externalBookingRows);

  // Surnames are cut to an initial here, before the data ever leaves the
  // server. Doing it in the component only changed what was drawn -- the full
  // name still travelled to the browser in the page payload.
  const publicTestimonials = testimonials.map((t) => {
    const parts = String(t.name || "").trim().split(/\s+/).filter(Boolean);
    const name = parts.length < 2 ? (parts[0] || "") : parts.slice(0, -1).join(" ") + " " + parts[parts.length - 1][0].toUpperCase() + ".";
    return { ...t, name };
  });

  return (
    <SiteView
      initialPackages={packages}
      initialVessels={vessels}
      initialGallery={gallery}
      initialBlocked={blocked}
      initialPartialDates={partialDates}
      forecast={forecast}
      initialTestimonials={publicTestimonials}
      initialAddOns={addOns}
    />
  );
}
