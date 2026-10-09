// "Add time": extend a paid charter and charge only the difference.
//
// WHY (owner, 9 Oct 2026). Erika asked on the water for one more hour on a
// charter already paid in full. Her /pay link refused, correctly ("already
// paid" is what stops a guest being billed twice), so the extra hour was set
// up by hand as a separate $170 charge. He asked for a button that does the
// same thing.
//
// THE RULES
// - Price is the difference on the SAME price table the website charges:
//   (hours + extra) at the booking's day rate, minus (hours) at that rate.
//   Add-ons are per charter, so they do not change. Uses quotePackage(), the
//   one function the website and checkout already share -- never a copy.
// - Only website and direct bookings. A Boatsetter or GetMyBoat charter is
//   extended on that platform, which takes its own payment and fee.
// - The charge is its own Inquiry row (status "booked", unpaid), paid through
//   its own /pay/<id> link. Marked booked so the payment webhook does not run
//   the "is the boat still free?" test against the guest's own charter.
// - It belongs to the original reservation (owner, 9 Oct 2026: "it should all
//   stay with that one single reservation"). Its bookingId is the parent's plus
//   -X1, -X2 (lib/extensionRef.js). When paid, the webhook adds the hours and
//   the money to the parent, and Bookings lists it as a payment under the
//   parent, never as a line of its own.
const { quotePackage } = require("./pricing");

const PLATFORM_ONLY = new Set(["Boatsetter", "GetMyBoat", "GetmyBoat"]);
const MAX_HOURS = 8;

// Pure: what the extra hours cost, or why they cannot be priced here.
function extensionQuote(pkg, { vesselId, date, hours, extraHours, platform }) {
  const from = Number(hours);
  const extra = Number(extraHours);
  if (platform && PLATFORM_ONLY.has(platform)) {
    return { error: `This charter was booked on ${platform}. Extend it there, so ${platform} takes the payment.` };
  }
  if (!pkg) return { error: "This booking has no package, so there is no price table to work from." };
  if (pkg.pricingType !== "hourly-by-vessel") {
    return { error: `${pkg.name || "This package"} is not priced by the hour. Price the extra time by hand.` };
  }
  if (!(from > 0)) return { error: "This booking has no length recorded, so the difference cannot be worked out." };
  if (!(extra > 0) || !Number.isInteger(extra)) return { error: "Extra hours must be a whole number, 1 or more." };
  if (from + extra > MAX_HOURS) return { error: `That makes ${from + extra} hours; the most a charter runs is ${MAX_HOURS}.` };
  const before = quotePackage(pkg, { vesselId, date, hours: from });
  const after = quotePackage(pkg, { vesselId, date, hours: from + extra });
  if (before == null || after == null) {
    return { error: `The price table has no ${from}- or ${from + extra}-hour price for this boat.` };
  }
  const amount = Math.round((after - before) * 100) / 100;
  if (!(amount > 0)) return { error: "The price table gives no extra charge for that. Check the table." };
  return { amount, before, after, from, to: from + extra };
}

// "13:00" + 3h -> "4pm"; null when there is no start time.
function endLabel(startTime, totalHours) {
  const m = String(startTime || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const mins = (Number(m[1]) * 60 + Number(m[2]) + Number(totalHours) * 60) % (24 * 60);
  const h = Math.floor(mins / 60), mm = mins % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${mm ? ":" + String(mm).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
}

// The text the owner sends. Short, his register, no raw Stripe link.
function extensionText({ guestName, extra, amount, end, url }) {
  const first = String(guestName || "").trim().split(/\s+/)[0];
  const hrs = extra === 1 ? "another hour" : `another ${extra} hours`;
  const price = "$" + (Number.isInteger(amount) ? amount : amount.toFixed(2));
  return `Hi${first ? " " + first : ""}, absolutely, we can stay out ${hrs}! ` +
    `The extra time is ${price}${end ? `, so we'll head in at ${end}` : ""}. You can pay here: ${url}`;
}

module.exports = { extensionQuote, endLabel, extensionText, PLATFORM_ONLY, MAX_HOURS };
