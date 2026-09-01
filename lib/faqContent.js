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
    a: "Fuel is included in every package, along with an ice chest already loaded with ice and water. Most packages also include the tube and the wakeboards, so there is no separate watersports equipment rental. Birthday and bachelor or bachelorette charters include decorations and party supplies. The night cruise includes a complimentary champagne toast and dinner, which can be prepared and cooked on board, plus lighting, party lights, glow sticks and music. The price you are quoted is for the whole boat for the whole charter, not per person.",
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
    a: "Booking through the website takes payment for the charter in full at checkout, by card — there is no separate deposit to pay later and no balance to settle on the dock. If you would rather arrange payment another way, call or text (832) 948-2912 and we will talk it through.",
    // SEO TODO (owner): the website charges the full charter total in one Stripe
    // payment (verified in app/api/checkout/route.js). If you take partial
    // deposits for phone or repeat bookings, or hold a damage deposit, say so
    // here — "how much deposit" is one of the most-searched booking questions.
  },
  {
    q: "Can we bring our own food and alcohol?",
    a: "Yes. Guests bring their own drinks, and we supply the cooler, the ice and the water. Anyone drinking needs to be 21 or over, the same as anywhere else in Texas. Your captain never drinks while operating the boat — on our Boatz & Glowz events we run sober captains on every vessel as standard, and the same rule applies on every charter. Food is welcome too; on the night cruise dinner is included and can be cooked on board, and on Party Cove charters we can arrange food and a loaded ice chest in advance so you are not shopping on the morning of the trip. Glass is best avoided on a boat.",
  },
  {
    q: "What should I bring on a Lake Conroe boat charter?",
    a: "Bring a swimsuit, a towel and a change of clothes, sunscreen, sunglasses, and whatever you want to drink — the cooler, the ice and the water are already on board. A hat and a waterproof phone pouch are both good ideas. If you are celebrating, bring the cake or anything specific to the occasion; decorations are already included on birthday and bachelorette packages. You do not need to bring a tube, wakeboards or any watersports gear, because those come with the charter.",
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
    a: "You are given the exact meeting point when your booking is confirmed. Our boats are kept in slips on Lake Conroe, and our Boatz & Glowz events run from the Scott's Ridge boat ramp. If you need the location before booking in order to plan travel, call or text (832) 948-2912 and we will tell you.",
    // SEO TODO (owner): THIS IS THE BIGGEST REMAINING GAP. No dock or marina
    // address is published anywhere — not on the site, not in this repo.
    // Publishing it here, in the LocalBusiness structured data in lib/seo.js,
    // and on the Google Business Profile (all three matching exactly) is
    // probably the single highest-value local-SEO fix left.
  },
  {
    q: "What happens if the boat breaks down during our charter?",
    a: "Our boats are maintained on a service schedule and carry the required safety equipment, and on a captained charter your captain is responsible for handling any mechanical problem safely and getting the group back. Mechanical failures are rare, but if one shortens or ends your charter, contact us and we will put it right — call or text (832) 948-2912.",
    // SEO TODO (owner): no written breakdown policy exists, so this answer is
    // deliberately non-specific about compensation. Decide what you actually
    // offer (pro-rata refund for unused time? a reschedule?) and state it
    // plainly — a concrete answer here removes a real booking objection.
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
