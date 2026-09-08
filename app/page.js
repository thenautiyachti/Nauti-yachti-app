import { prisma } from "../lib/db";
import { HOLDS_THE_DAY } from "../lib/bookingStatus";
import { parsePackage, groupBlockedDates, groupExternalBookingState, groupBookedWindows } from "../lib/serialize";
import { occupyingRows } from "../lib/occupancy";
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
  const [packageRows, vessels, gallery, blockedRows, externalBookingRows, confirmedInquiries, forecast, testimonials, addOns] = await Promise.all([
    prisma.package.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.vessel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.galleryItem.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.blockedDate.findMany(),
    // Only what actually occupies the boat. "not cancelled" used to stand in for
    // this, which was fine while every non-booking happened to be labelled
    // cancelled -- and would have put 33 inquiries onto the public calendar as
    // booked days the moment they were labelled honestly.
    prisma.externalBooking.findMany({ where: { status: { in: HOLDS_THE_DAY } } }),
    // A booking confirmed by text lives only as an Inquiry -- nothing writes a
    // diary row for it, so its date stayed on sale and could be sold twice.
    // Only the fields occupancy needs: this reaches a PUBLIC page, where the
    // payload is readable with "view source".
    prisma.inquiry.findMany({
      where: { status: "booked" },
      select: { id: true, bookingId: true, vesselId: true, date: true, hours: true, status: true },
    }),
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
  // Both tables, deduped -- a card booking exists in each and counting its
  // hours twice would show a half-day as full. See lib/occupancy.js.
  const occupied = occupyingRows(externalBookingRows, confirmedInquiries);
  const partialDates = groupExternalBookingState(occupied);
  // WHEN a partly-booked day is taken, not just THAT it is. A guest could see
  // an orange square and had no way to find out which part of the day was gone.
  const bookedWindows = groupBookedWindows(occupied);

  // Full names are shown, on the owner's call: the site already publishes
  // guests' faces, so withholding a surname protected nothing.
  const publicTestimonials = testimonials;

  return (
    <SiteView
      initialPackages={packages}
      initialVessels={vessels}
      initialGallery={gallery}
      initialBlocked={blocked}
      initialPartialDates={partialDates}
      initialBookedWindows={bookedWindows}
      forecast={forecast}
      initialTestimonials={publicTestimonials}
      initialAddOns={addOns}
    />
  );
}
