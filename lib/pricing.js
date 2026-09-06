const { addOnTotal } = require("./addOns");

function currency(n) {
  return `$${Number(n).toLocaleString("en-US")}`;
}

// tiers: [{ max: number|null, price: number }, ...] sorted ascending by max,
// with the last tier's max as null meaning "and above".
function tierPrice(tiers, guests) {
  for (const t of tiers) {
    if (t.max == null || guests <= t.max) return t.price;
  }
  return tiers[tiers.length - 1].price;
}

function dayTypeForDate(dateStr) {
  if (!dateStr) return "weekday";
  const day = new Date(dateStr + "T00:00:00").getDay();
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

// What a charter costs, before coupons and gift certificates.
//
// WHY THIS IS HERE RATHER THAN IN THE BOOKING FORM. Until 5 Sep 2026 this
// calculation existed only in the browser, and /api/checkout took the answer on
// trust: `priceQuoted` came out of the request body and went straight into
// Stripe's `unit_amount`. A crafted POST paid whatever it liked for an $850
// charter -- and that is the path a real card payment had just gone through.
//
// The coupon and gift-certificate code beside it had always been careful for
// exactly this reason: "the code is the only thing trusted from the client".
// The base price simply never got the same treatment.
//
// So it lives in one place and both sides call it. A server-side copy of the
// same arithmetic would have been the more obvious fix and the worse one: two
// copies drift, and the day they disagree every honest booking starts being
// rejected as tampering.
//
// Returns null when the package cannot be priced from what was given -- an
// unknown vessel, a duration that package does not offer. Null means "refuse",
// never "free".
function quotePackage(pkg, opts) {
  if (!pkg) return null;
  const o = opts || {};
  const dayType = o.dayType || dayTypeForDate(o.date);

  switch (pkg.pricingType) {
    case "hourly-by-vessel": {
      // Keys arrive from JSON, so they are strings whatever the caller passed.
      const byVessel = pkg.hourlyByVessel && pkg.hourlyByVessel[o.vesselId];
      const forDay = byVessel && byVessel[dayType];
      const price = forDay && forDay[String(o.hours)];
      return price == null ? null : Number(price);
    }
    case "per-guest": {
      const guests = Number(o.partySize || 0);
      if (!guests || pkg.pricePerGuest == null) return null;
      return guests * Number(pkg.pricePerGuest);
    }
    case "tiered-by-guests": {
      if (!Array.isArray(pkg.tiers) || !pkg.tiers.length) return null;
      return Number(tierPrice(pkg.tiers, Number(o.partySize || 1)));
    }
    default:
      return pkg.price == null ? null : Number(pkg.price);
  }
}

// The whole quote: the package plus whatever add-ons are actually chargeable
// with it. Rounded to cents, because a float artefact reaching Stripe is a
// payment that fails for a reason nobody can see.
//
function quoteTotal(pkg, addOns, opts) {
  const base = quotePackage(pkg, opts);
  if (base == null) return null;
  const extras = addOnTotal(addOns || [], pkg.id, (opts && opts.addOnIds) || []);
  return Math.round((base + extras) * 100) / 100;
}

// "YYYY-MM-DD" from a Date's LOCAL calendar day — never use toISOString() for
// this, it converts to UTC first and silently shifts the date near midnight.
function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A handful of source photos have their subject well off-center vertically,
// so a default object-fit:cover center-crop cuts them out of frame. Keyed by
// a substring of the image URL (the BrandCrowd asset id).
const IMAGE_FOCUS = {
  "e8a5c870-57a0-4892-b69d-a03d097eab57": "center 18%", // tall shot, wakeboarder near the top
  "b697da5c-f68d-4b74-9076-4cde2c0128b2": "center 25%", // group photo, faces in the upper portion
};
function imageFocus(url) {
  if (!url) return "center";
  const hit = Object.keys(IMAGE_FOCUS).find((id) => url.includes(id));
  return hit ? IMAGE_FOCUS[hit] : "center";
}

// The gallery used to force every photo into a portrait 3:4 tile, which cut
// people out of the 15 landscape shots -- the widest lost 58% of their width.
// Per-photo escape hatches (contain, then a zoom to eat the letterbox) were
// hand-maintained and went stale the moment a new photo was uploaded, so the
// gallery now lets each photo keep its own shape and they are gone.

module.exports = { currency, tierPrice, dayTypeForDate, quotePackage, quoteTotal, localDateKey, imageFocus };
