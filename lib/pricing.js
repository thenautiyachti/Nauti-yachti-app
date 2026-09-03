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

module.exports = { currency, tierPrice, dayTypeForDate, localDateKey, imageFocus };
