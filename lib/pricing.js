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

module.exports = { currency, tierPrice, dayTypeForDate, localDateKey };
