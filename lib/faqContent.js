// The FAQ, as one shared source of truth.
//
// This array feeds BOTH the visible page and the FAQPage JSON-LD. Google
// requires that FAQ structured data only contain question-and-answer text that
// is actually visible on the page, so these must never diverge — keep them
// coming from here.
//
// PROVENANCE: policy answers are lifted from app/terms/page.js; inclusions come
// from the Package.unit columns and lib/glowEvent.js; vessel facts come from the
// Vessel rows. The Texas boater-education answer states the statutory rule set
// by Texas Parks & Wildlife.
//
// Answers marked with an "SEO TODO" comment are deliberately written to be
// truthful-but-general because the business has never published a specific
// policy on that point. Replacing them with the owner's real policy is a
// direct conversion win — these are the exact questions that stop people
// booking, and competitors answer them.

const FAQ_ITEMS = [
  {
    q: "Do I need a boating license to rent a boat on Lake Conroe?",
    a: "For our captained charters, no — a licensed captain operates the boat and you are a passenger, so no boater education or licence is required from anyone in your group. It only matters for the Nauti Islander, which is our self-drive option. Under Texas law, anyone born on or after 1 September 1993 must complete a Texas Parks & Wildlife approved boater education course before operating a motorboat with more than 15 horsepower. If that applies to whoever is driving, they need to have completed the course and to carry both the proof of completion and a photo ID on board. The course can be taken online and is a one-time requirement that does not expire. If nobody in your group meets that requirement, book a captained charter instead — it is the simpler option and the captain does all the driving.",
  },
  {
    q: "What is included in the price of a charter?",
    a: "Fuel is included in every package, along with an ice chest already loaded with ice and water. Most packages also include the tube and the wakeboards, so there is no separate watersports equipment rental. Birthday charters include the balloon package, and bachelor or bachelorette charters include a bottle of champagne on ice — both at no extra cost. The night cruise includes a champagne toast and dinner, which can be prepared and cooked on board, plus lighting, party lights, glow sticks and music. On any other charter, balloons, champagne and the full decoration package can be added when you book. The price you are quoted is for the whole boat for the whole charter, not per person.",
  },
  {
    q: "Is fuel included, or do I pay for gas separately?",
    a: "Fuel is included. Every package price covers the fuel used during your charter, so there is no refuelling charge at the end and no fuel deposit to settle. This is worth checking when you compare quotes, because some operators quote a lower hourly rate and then bill fuel on top.",
  },
  {
    q: "What is your cancellation policy?",
    a: "If you cancel 24 hours or more before your charter, you receive a 100% refund of everything you paid. If you cancel on the day of the charter and you communicate with us, you receive a 60% refund. If you simply do not show up and there is no communication at all once the reserved charter time has passed, the booking is non-refundable. Weather cancellations that we initiate are handled separately and are not subject to these guest-cancellation terms.",
  },
  {
    q: "What happens if the weather is bad on the day of my charter?",
    a: "If we decide that conditions make the charter unsafe — thunderstorms, dangerously high wind, or a lake advisory — we may cancel or reschedule it. When we are the ones cancelling for weather, you choose between a full refund and rescheduling to another available date. The choice is yours, not ours. Because that decision is ours to make, a weather cancellation is never treated as a guest cancellation, so the 24-hour rule does not apply to it. Texas weather changes quickly, so a grey forecast several days out is not usually a reason to cancel in advance; we make the call close to the charter.",
  },
  {
    q: "Can I reschedule my booking?",
    a: "Yes. If you ask to move your charter to a different available date 2 or more days before the original date, we will generally accommodate it at no charge, subject to availability. Requests made closer to the charter date fall under the standard cancellation terms, so the earlier you tell us the better.",
  },
  {
    q: "Do you take a deposit, and when do I pay?",
    a: "It depends how you book. Through the website, checkout takes the charter total in full by card — no separate deposit, and nothing to settle on the dock. If you book by phone, or if you have chartered with us before, we can take a deposit of half up front with the balance due before you launch. Occasionally we agree to cash on arrival, paid before we leave the dock. If one of those suits you better, call or text (832) 948-2912 and we will arrange it.",
    // Owner-confirmed 2026-09-01: website checkout is full payment; phone and
    // repeat bookings may pay half up front with the balance before launch;
    // cash on arrival happens occasionally, always before leaving the dock.
  },
  {
    q: "Can we bring our own food and alcohol?",
    a: "Yes. Guests bring their own drinks, and we supply the cooler, the ice and the water. Anyone drinking needs to be 21 or over, the same as anywhere else in Texas. Your captain never drinks while operating the boat — on our Boatz & Glowz events we run sober captains on every vessel as standard, and the same rule applies on every charter. Food is welcome too; on the night cruise dinner is included and can be cooked on board, and on Party Cove charters we can arrange food and a loaded ice chest in advance so you are not shopping on the morning of the trip. Glass is best avoided on a boat.",
  },
  {
    q: "What should I bring on a Lake Conroe boat charter?",
    a: "Bring a swimsuit, a towel and a change of clothes, sunscreen, sunglasses, and whatever you want to drink — the cooler, the ice and the water are already on board. A hat and a waterproof phone pouch are both good ideas. If you are celebrating, bring the cake or anything specific to the occasion; balloons are already included on birthday packages and champagne on bachelor and bachelorette ones. You do not need to bring a tube, wakeboards or any watersports gear, because those come with the charter.",
  },
  {
    q: "How many people can come on the boat?",
    a: "It depends which boat you book. The Nauti Explorer is our flagship and takes up to 14 guests, and it is the one we recommend for tubing, wakeboarding and longer charters. The Nauti Yachti takes up to 12 and is built for Party Cove, bachelor and bachelorette parties and birthdays. The Nauti Islander takes up to 8, is the most economical of the three, and is the captainless self-drive option. These limits are the legal capacity of each vessel and cannot be exceeded. If your group is larger than 14, we can run more than one boat together — ask when you enquire.",
  },
  {
    q: "Are children allowed, and is there a minimum age?",
    a: "Children are welcome on captained charters, and family bookings — birthday parties, tubing afternoons, days on the water with kids — are a large part of what we do. Everyone on board is provided with the proper safety gear, and Texas law requires children under 13 to wear a life jacket while the boat is under way. For the self-drive Nauti Islander the rules are different, because whoever operates the boat has to meet the Texas boater education requirement described above.",
    // SEO TODO (owner): confirm whether you set your own minimum age for
    // unaccompanied guests, or any age rules specific to the bachelor and
    // bachelorette charters, and add them here.
  },
  {
    q: "What time should we arrive for our charter?",
    a: "Plan to arrive before your charter start time rather than at it, so that boarding and the safety briefing do not eat into your booked hours. For our Boatz & Glowz events, check-in is at 6:30 PM for a 7:00 PM departure from Scott's Ridge, which is a good guide to the kind of buffer that works. You will be given the meeting point and the arrival time when your booking is confirmed. If somebody in your group is running late, message the captain — it is much easier to work around when we know.",
    // SEO TODO (owner): there is no published standard arrival buffer for
    // regular charters (only the glow event's 6:30 PM check-in, from
    // lib/glowEvent.js). Set one — "arrive 15 minutes early" — and state it
    // here and in the booking confirmation.
  },
  {
    q: "Where do we meet you on Lake Conroe?",
    a: "Our boats are kept at a private gated dock off Pearl Bay in Conroe, 77304, on the west side of Lake Conroe. It is a residential dock rather than a public marina, so there is no sign to look for and no dock office — you are sent the exact address with your booking confirmation, and the gate code when you arrive. Parking is on site, next to the dock, so you can unload straight onto the boat rather than carrying coolers across a car park. Our Boatz & Glowz events are the exception: those run from the Scott's Ridge boat ramp, and we act as your taxi to Party Cove and back. If you want the location before booking so you can plan the drive, call or text (832) 948-2912.",
    // Deliberate decision (owner-confirmed 2026-09-01): the dock's nearest
    // civic address is a NEIGHBOURING PRIVATE HOUSE, and access is by a gate
    // code. Neither the street number nor the gate code appears here or in the
    // structured data — publishing them would send strangers to a private home
    // and hand out the code to anyone who reads the page. The neighbourhood,
    // city and ZIP give search engines the local signal without that cost, and
    // the guest gets the practical answer (private dock, parking on site, code
    // on arrival) that they actually came to the page for.
    // See lib/seo.js for the related Conroe-vs-Montgomery GBP conflict.
  },
  {
    q: "What happens if the boat breaks down during our charter?",
    a: "Our boats are maintained on a service schedule and carry the required safety equipment, and on a captained charter your captain handles any mechanical problem safely and gets the group back. Failures are rare, but you are not left out of pocket if one happens. Broadly: if we break down at the start of your charter, you get a full refund, or we reschedule you for another day if you would rather. If it happens partway through, we refund or rebook the part of the trip you lost. If it happens near the end, when you have had most of your time on the water, we put a discount toward your next trip. Every situation is a bit different, so we would rather talk it through than hide behind a policy — call or text (832) 948-2912 and we will make it right.",
    // Owner-confirmed 2026-09-01: full refund or reschedule at the start,
    // partial refund or partial rebook mid-charter, small discount near the
    // end. Deliberately phrased as "broadly" — the owner treats each case on
    // its merits and does not want a rigid tier published, but is willing to
    // reimburse and reschedule, which is the thing a prospective guest is
    // actually trying to find out before they book.
  },
  {
    q: "How far in advance should I book a Lake Conroe charter?",
    a: "As early as you can for weekends, holidays and anything in peak summer, because those dates fill first and there are only three boats. Live availability for every vessel is published on the website, so you can see which dates are already taken before you enquire. Midweek charters are much easier to get at short notice, and they are also cheaper — weekday rates are lower than weekend rates on every package.",
  },
  {
    q: "How much does it cost to rent a boat on Lake Conroe?",
    a: "Our rates start at $120 for an hour on the Nauti Islander with the Party Cove package, and $150 an hour for the other packages. An eight-hour weekday charter on the Nauti Islander is $800; the same day on the 14-guest Nauti Explorer is $1,400. Weekend rates are slightly higher than weekday rates. Because you are booking the whole boat rather than a seat, the cost per person drops sharply with the size of your group. Full price tables for all three boats, weekday and weekend, are published on each package page.",
  },
];

module.exports = { FAQ_ITEMS };
