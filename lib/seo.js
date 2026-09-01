// Single source of truth for everything a search engine or AI crawler reads:
// the canonical origin, the business NAP, the package -> URL slug map, and the
// JSON-LD builders.
//
// RULE FOR THIS FILE: every value here must be traceable to a real, verified
// source (the database, lib/reviews.js, app/terms/page.js, or the owner). Any
// value the owner still has to supply is marked with an "SEO TODO" comment
// and deliberately left OUT of the emitted markup rather than guessed —
// structured data that contradicts the Google Business Profile is worse than
// structured data that is merely incomplete.

const SITE_URL = "https://www.thenautiyachti.com";
const SITE_NAME = "The Nauti Yachti";
const LEGAL_NAME = "The Nauti Yachti LLC";

// Verified: app/terms/page.js section 7, and lib/reviews.js.
const PHONE_DISPLAY = "(832) 948-2912";
const PHONE_E164 = "+18329482912";
const EMAIL = "TheNautiYachti@Gmail.com";

// Verified in lib/reviews.js: Place ID confirmed against Google Maps
// 2026-09-01, listing category "Boat rental service", Montgomery TX.
const GOOGLE_PLACE_ID = "ChIJ615Sj10p5UwR3geZTLGvvHc";
const GOOGLE_LISTING_URL = `https://www.google.com/maps/place/?q=place_id:${GOOGLE_PLACE_ID}`;

// SEO TODO (owner): no street address has ever been published — not on the
// site, not in the repo. `streetAddress` and `postalCode` are intentionally
// omitted below. Supply the dock/marina address that matches the Google
// Business Profile exactly and add it here; NAP consistency between the site
// and the GBP is one of the strongest local-ranking signals available.
const ADDRESS = {
  addressLocality: "Montgomery", // verified: GBP locality, lib/reviews.js
  addressRegion: "TX",
  addressCountry: "US",
};

// Service area rather than a premises pin. The business operates on the water
// across Lake Conroe, so a GeoCircle over the lake is the honest shape here.
// The centre is Lake Conroe itself (approximate, and only ever used to
// describe the SERVICE AREA — it is not presented as the business address).
const SERVICE_AREA_CENTER = { lat: 30.45, lng: -95.64 };
const SERVICE_AREA_RADIUS_M = 25000;

const DEFAULT_OG_IMAGE = "/hero-watermark.jpg";

// Verified owned profiles, copied from the SOCIALS list already rendered in
// components/SiteView.js. These are the identity links that let Google tie
// this domain to the Google Business Profile and the booking-platform
// listings. Only first-party profiles belong here — not the Yolo partner
// listing, which is a different business.
const SAME_AS = [
  "https://www.facebook.com/profile.php?id=61577960573366",
  "https://www.tiktok.com/@the.nauti.yachti",
  "https://www.instagram.com/thenautiyachtillc/",
  "https://www.getmyboat.com/trips/5Yr13eya/",
  "https://www.getmyboat.com/trips/2aM5DkWa/",
  "https://www.getmyboat.com/trips/RNRjo5AN/",
  "https://www.boatsetter.com/boats/nwfblfv",
];

// Keyword-led URL slugs. Keyed by the Package.id in the database so the owner
// can rename a package in the console without breaking a live, indexed URL.
// Anything not listed falls back to its raw id, so a package added later still
// gets a working page.
const PACKAGE_SLUGS = {
  tubing: "tubing-wakeboarding-charter",
  birthday: "birthday-party-boat",
  bachelor: "bachelor-bachelorette-party-boat",
  night: "night-cruise",
  partycove: "party-cove-charter",
  corporate: "corporate-outing",
  wakesurf: "wake-surfing-lessons",
  // NOTE: "glowz" is deliberately absent. It already has a richer, dated
  // landing page at /glow — giving it a second URL here would just be
  // duplicate content competing with itself.
};

// Packages that must NOT get a /packages/<slug> page.
const EXCLUDED_PACKAGE_IDS = new Set(["glowz"]);

function slugForPackage(id) {
  return PACKAGE_SLUGS[id] || id;
}

function packageIdForSlug(slug) {
  const hit = Object.keys(PACKAGE_SLUGS).find((id) => PACKAGE_SLUGS[id] === slug);
  return hit || slug;
}

function indexablePackages(packages) {
  return packages.filter((p) => !EXCLUDED_PACKAGE_IDS.has(p.id));
}

function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

/**
 * Build a Next 16 `metadata` object with the canonical + Open Graph + Twitter
 * boilerplate filled in consistently. Every page should go through this so no
 * route can quietly ship without a canonical again.
 */
function pageMetadata({ title, description, path = "/", image = DEFAULT_OG_IMAGE, type = "website" }) {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
      locale: "en_US",
      type,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

// --- Price helpers ----------------------------------------------------------

// Number(null) is 0 and Number("") is 0, and both pass Number.isFinite — so a
// null price column would otherwise be published to Google as a genuine $0
// offer. Every price has to clear this gate first.
function realPrice(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Every bookable price for a package, flattened, so we can quote a real range. */
function priceRange(pkg) {
  const prices = [];
  const push = (v) => {
    const n = realPrice(v);
    if (n !== null) prices.push(n);
  };

  if (pkg.hourlyByVessel) {
    for (const vesselId of Object.keys(pkg.hourlyByVessel)) {
      const byDay = pkg.hourlyByVessel[vesselId];
      for (const dayType of Object.keys(byDay || {})) {
        for (const hours of Object.keys(byDay[dayType] || {})) {
          push(byDay[dayType][hours]);
        }
      }
    }
  }
  if (Array.isArray(pkg.tiers)) for (const t of pkg.tiers) push(t.price);
  push(pkg.price);
  push(pkg.pricePerGuest);

  if (!prices.length) return null;
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

// --- JSON-LD builders -------------------------------------------------------

// Stable @id so Product/FAQ nodes can point back at one canonical business
// entity instead of re-declaring it on every page.
const BUSINESS_ID = `${SITE_URL}/#business`;

/**
 * LocalBusiness for the whole site.
 *
 * Deliberately NOT emitted: aggregateRating. The Google Business Profile holds
 * exactly one review (see lib/reviews.js). Google requires review data to be
 * genuine and representative, and a single review is not eligible for a rating
 * rich result — emitting one would risk a manual action.
 */
function localBusinessJsonLd({ vessels = [] } = {}) {
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "TouristAttraction"],
    "@id": BUSINESS_ID,
    name: SITE_NAME,
    legalName: LEGAL_NAME,
    description:
      "Private boat charters and pontoon rentals on Lake Conroe, Texas. Captained party-boat, tubing, birthday, bachelorette and corporate charters, plus a self-drive rental option.",
    url: SITE_URL,
    telephone: PHONE_E164,
    email: EMAIL,
    image: absoluteUrl(DEFAULT_OG_IMAGE),
    logo: absoluteUrl("/logo.jpg"),
    priceRange: "$$",
    // SEO TODO (owner): add `streetAddress` and `postalCode` here once the
    // dock address is published, and make sure it matches the GBP exactly.
    address: { "@type": "PostalAddress", ...ADDRESS },
    areaServed: [
      {
        "@type": "GeoCircle",
        geoMidpoint: {
          "@type": "GeoCoordinates",
          latitude: SERVICE_AREA_CENTER.lat,
          longitude: SERVICE_AREA_CENTER.lng,
        },
        geoRadius: String(SERVICE_AREA_RADIUS_M),
      },
      { "@type": "Place", name: "Lake Conroe" },
      { "@type": "City", name: "Conroe", address: { "@type": "PostalAddress", addressRegion: "TX", addressCountry: "US" } },
      { "@type": "City", name: "Montgomery", address: { "@type": "PostalAddress", addressRegion: "TX", addressCountry: "US" } },
      { "@type": "City", name: "Willis", address: { "@type": "PostalAddress", addressRegion: "TX", addressCountry: "US" } },
      { "@type": "City", name: "The Woodlands", address: { "@type": "PostalAddress", addressRegion: "TX", addressCountry: "US" } },
      { "@type": "AdministrativeArea", name: "Montgomery County, Texas" },
    ],
    sameAs: [GOOGLE_LISTING_URL, ...SAME_AS],
    // SEO TODO (owner): `openingHoursSpecification` is omitted because no
    // operating hours have ever been published. Supply real hours to add them.
    knowsAbout: [
      "Lake Conroe boat charters",
      "party boat rental",
      "pontoon rental",
      "tubing and wakeboarding",
      "bachelorette boat parties",
    ],
    ...(vessels.length
      ? {
          makesOffer: vessels.map((v) => ({
            "@type": "Offer",
            itemOffered: {
              "@type": "BoatTrip",
              name: v.name,
              description: v.note,
            },
          })),
        }
      : {}),
  };
}

function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    publisher: { "@id": BUSINESS_ID },
  };
}

function breadcrumbJsonLd(crumbs) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

/**
 * Product + AggregateOffer for one charter package, priced from the live
 * database rows. No rating is attached, for the same reason as above.
 */
function packageJsonLd(pkg, { vessels = [] } = {}) {
  const range = priceRange(pkg);
  const path = `/packages/${slugForPackage(pkg.id)}`;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": absoluteUrl(path) + "#product",
    name: `${pkg.name} — Lake Conroe Boat Charter`,
    description: pkg.blurb,
    url: absoluteUrl(path),
    ...(pkg.image ? { image: pkg.image.startsWith("http") ? pkg.image : absoluteUrl(pkg.image) } : {}),
    brand: { "@type": "Brand", name: SITE_NAME },
    category: "Boat charter",
    ...(vessels.length ? { isRelatedTo: vessels.map((v) => ({ "@type": "Product", name: v.name })) } : {}),
    ...(range
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "USD",
            lowPrice: range.low,
            highPrice: range.high,
            offerCount: 1,
            availability: "https://schema.org/InStock",
            url: absoluteUrl(path),
            seller: { "@id": BUSINESS_ID },
          },
        }
      : {}),
  };
}

function faqJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

module.exports = {
  SITE_URL,
  SITE_NAME,
  LEGAL_NAME,
  PHONE_DISPLAY,
  PHONE_E164,
  EMAIL,
  GOOGLE_PLACE_ID,
  GOOGLE_LISTING_URL,
  SAME_AS,
  DEFAULT_OG_IMAGE,
  PACKAGE_SLUGS,
  EXCLUDED_PACKAGE_IDS,
  slugForPackage,
  packageIdForSlug,
  indexablePackages,
  absoluteUrl,
  pageMetadata,
  priceRange,
  localBusinessJsonLd,
  websiteJsonLd,
  breadcrumbJsonLd,
  packageJsonLd,
  faqJsonLd,
};
