// Seeds the database with the packages, vessels, and gallery captions
// agreed on so far. Run with: npm run db:seed
// Safe to re-run — it upserts everything by id.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const TUBING_HOURLY_BY_VESSEL = {
  explorer: {
    weekday: { 1: 200, 2: 400, 3: 570, 4: 760, 5: 900, 6: 1080, 7: 1225, 8: 1400 },
    weekend: { 1: 220, 2: 440, 3: 625, 4: 830, 5: 1000, 6: 1200, 7: 1350, 8: 1540 },
  },
  islander: {
    weekday: { 1: 150, 2: 300, 3: 450, 4: 540, 5: 675, 6: 810, 7: 875, 8: 1000 },
    weekend: { 1: 165, 2: 330, 3: 495, 4: 600, 5: 750, 6: 875, 7: 975, 8: 1100 },
  },
  yachti: {
    weekday: { 1: 300, 2: 600, 3: 855, 4: 1140, 5: 1375, 6: 1650, 7: 1855, 8: 2120 },
    weekend: { 1: 330, 2: 660, 3: 940, 4: 1250, 5: 1500, 6: 1800, 7: 2040, 8: 2325 },
  },
};

// Party Cove — suggested at ~20% below the tubing rate (lower fuel use),
// rounded to the nearest $5. Confirmed accurate by the owner.
const PARTY_COVE_HOURLY_BY_VESSEL = {
  explorer: {
    weekday: { 1: 160, 2: 320, 3: 455, 4: 610, 5: 720, 6: 865, 7: 980, 8: 1120 },
    weekend: { 1: 175, 2: 350, 3: 500, 4: 665, 5: 800, 6: 960, 7: 1080, 8: 1230 },
  },
  islander: {
    weekday: { 1: 120, 2: 240, 3: 360, 4: 430, 5: 540, 6: 650, 7: 700, 8: 800 },
    weekend: { 1: 130, 2: 265, 3: 395, 4: 480, 5: 600, 6: 700, 7: 780, 8: 880 },
  },
  yachti: {
    weekday: { 1: 240, 2: 480, 3: 685, 4: 910, 5: 1100, 6: 1320, 7: 1485, 8: 1695 },
    weekend: { 1: 265, 2: 530, 3: 750, 4: 1000, 5: 1200, 6: 1440, 7: 1630, 8: 1860 },
  },
};

const VESSELS = [
  { id: "explorer", slip: "SLIP 01", name: "Nauti Explorer", capacity: 14, note: "Our flagship — best for tubing, wakeboarding, and longer charters.", image: "https://bc-user-uploads.brandcrowd.com/public/media-Production/3009ad0c-217a-4298-b498-e0325b468130/95b1eee6-9aba-4adf-b307-6b692f6b61e0_2x", sortOrder: 1 },
  { id: "islander", slip: "SLIP 02", name: "Nauti Islander", capacity: 8, note: "Captainless option, great for small parties, general cruises, and economical.", sortOrder: 2 },
  { id: "yachti", slip: "SLIP 03", name: "Nauti Yachti", capacity: 12, note: "Our namesake boat — built for Party Cove, bachelor or bachelorette, and birthday parties.", image: "https://bc-user-uploads.brandcrowd.com/public/media-Production/3009ad0c-217a-4298-b498-e0325b468130/28fee57d-0cd2-4621-8f43-8147e3ea731e_2x", sortOrder: 3 },
];

const BC = "https://bc-user-uploads.brandcrowd.com/public/media-Production/3009ad0c-217a-4298-b498-e0325b468130";

const GALLERY = [
  // Tubing / Wakeboarding
  { id: "g-tubing-1", category: "tubing", image: `${BC}/243bcf68-219a-4676-ae5f-f4ebf71e10aa_2x`, caption: "Full speed with the tube up", sortOrder: 1 },
  { id: "g-tubing-2", category: "tubing", image: `${BC}/4aef37df-4231-4031-9999-8da0dff7233a_2x`, caption: "Watching the ride from the back deck", sortOrder: 2 },
  { id: "g-tubing-3", category: "tubing", image: `${BC}/b1461286-75dd-407d-ad57-8dc2c978b208_2x`, caption: "Hands up on the tube", sortOrder: 3 },
  { id: "g-tubing-4", category: "tubing", image: `${BC}/e591054f-71ba-44bc-9f25-91d4032d6210_2x`, caption: "Bouncing across the wake", sortOrder: 4 },
  { id: "g-tubing-5", category: "tubing", image: `${BC}/e8a5c870-57a0-4892-b69d-a03d097eab57_2x`, caption: "Cruising Lake Conroe", sortOrder: 5 },

  // Birthday Party
  { id: "g-birthday-1", category: "birthday", image: `${BC}/5fb07f44-df05-47ed-b223-a478b9cd2b48_2x`, caption: "Balloons on deck", sortOrder: 1 },
  { id: "g-birthday-2", category: "birthday", image: `${BC}/576c55ec-ae9c-4f26-b3e1-735dd779fbb6_2x`, caption: "Birthday girl on the water", sortOrder: 2 },
  { id: "g-birthday-3", category: "birthday", image: `${BC}/a7397cfc-512e-4b67-a42f-9d3880c005d3_2x`, caption: "Family celebration on the lake", sortOrder: 3 },
  { id: "g-birthday-4", category: "birthday", image: `${BC}/88b70a7b-26ae-4cc7-af99-3b6057a5c052_2x`, caption: "Sunny afternoon with the family", sortOrder: 4 },

  // Corporate Outing
  { id: "g-corporate-1", category: "corporate", image: `${BC}/e8a5c870-57a0-4892-b69d-a03d097eab57_2x`, caption: "A relaxed afternoon on the water", sortOrder: 1 },
  { id: "g-corporate-2", category: "corporate", image: `${BC}/7189a71b-9908-423e-b65a-4e62dd5c0369_2x`, caption: "Group outing on Lake Conroe", sortOrder: 2 },
  { id: "g-corporate-3", category: "corporate", image: `${BC}/b697da5c-f68d-4b74-9076-4cde2c0128b2_2x`, caption: "Team time on the water", sortOrder: 3 },

  // Bachelor / Bachelorette
  { id: "g-bachelor-1", category: "bachelor", image: `${BC}/eb06195d-be7b-45ba-8675-d55870eb0e3e_2x`, caption: "The crew, out on the lake", sortOrder: 1 },
  { id: "g-bachelor-2", category: "bachelor", image: `${BC}/2635bca1-29f8-48bc-9bba-c7939eac69d1_2x`, caption: "Captain hats and celebration", sortOrder: 2 },
  { id: "g-bachelor-3", category: "bachelor", image: `${BC}/759db5a8-4cbd-4d70-bf45-a75af3c90f36_2x`, caption: "Golden hour on the bow", sortOrder: 3 },
  { id: "g-bachelor-4", category: "bachelor", image: `${BC}/ca6f258b-8982-4389-9a63-bfc7a57a2cc0_2x`, caption: "Dockside send-off", sortOrder: 4 },
  { id: "g-bachelor-5", category: "bachelor", image: `${BC}/7ca3bd49-8eab-4163-bd60-719b88a51c9b_2x`, caption: "The whole crew on the bow", sortOrder: 5 },
  { id: "g-bachelor-6", category: "bachelor", image: `${BC}/35f17a13-71bb-4629-ad47-09c4a665f192_2x`, caption: "Making memories on the water", sortOrder: 6 },

  // Night Cruise
  { id: "g-night-1", category: "night", image: `${BC}/a6ab2689-14b2-4373-8b12-7f5730196f47_2x`, caption: "Champagne toast under the stars", sortOrder: 1 },
  { id: "g-night-2", category: "night", image: `${BC}/c557ea0d-59f4-4351-955e-48665a51b97f_2x`, caption: "Sparklers on the night cruise", sortOrder: 2 },
  { id: "g-night-3", category: "night", image: `${BC}/a5a6a781-58a4-4ee2-949a-ed36704aaeeb_2x`, caption: "Fireworks over Lake Conroe", sortOrder: 3 },

  // Party Cove Package
  { id: "g-partycove-1", category: "partycove", image: `${BC}/438eb309-786d-4e8f-a7b5-069a04233d48_2x`, caption: "Party Cove, in the thick of it", sortOrder: 1 },
  { id: "g-partycove-2", category: "partycove", image: `${BC}/19071536-ba65-4e85-9e1c-5f4b982c0212_2x`, caption: "The foam party in full swing", sortOrder: 2 },
  { id: "g-partycove-3", category: "partycove", image: `${BC}/e4033e0c-c7a5-4e3c-a802-619957df93b2_2x`, caption: "Floating with the crowd", sortOrder: 3 },
  { id: "g-partycove-4", category: "partycove", image: `${BC}/f3ee05c5-4369-439e-8de6-cfc9ca74330a_2x`, caption: "Good company, even in the rain", sortOrder: 4 },
  { id: "g-partycove-5", category: "partycove", image: `${BC}/9fafae96-914c-4e24-a8e7-f34826ac8571_2x`, caption: "Climbing back aboard", sortOrder: 5 },
  { id: "g-partycove-6", category: "partycove", image: `${BC}/0dd9265b-6efc-42b2-be58-668f7279e45c_2x`, caption: "Meeting new people at the Cove", sortOrder: 6 },
  { id: "g-partycove-7", category: "partycove", image: `${BC}/b9683286-3c7c-4404-b3d7-25e53ef74927_2x`, caption: "Another Party Cove Saturday", sortOrder: 7 },
  { id: "g-partycove-8", category: "partycove", image: `${BC}/2a4a235c-b937-4767-b72d-7740d68fc952_2x`, caption: "In the water at Party Cove", sortOrder: 8 },
  { id: "g-partycove-9", category: "partycove", image: `${BC}/5b941b40-49d5-459f-b8c6-0cde311df58c_2x`, caption: "The whole group, all smiles", sortOrder: 9 },

  // Boatz & Glowz Package
  { id: "g-glowz-1", category: "glowz", image: `${BC}/14fb6e6c-fc26-4402-b6cc-e591aad6921f_2x`, caption: "The fleet, lit up for Boatz & Glowz", sortOrder: 1 },
  { id: "g-glowz-2", category: "glowz", image: `${BC}/b87657be-8e78-4d4e-bda0-718094a8b58d_2x`, caption: "Glowing all night long", sortOrder: 2 },
  { id: "g-glowz-3", category: "glowz", image: `${BC}/b7656e18-bff1-4ba7-889c-ab33eb947c58_2x`, caption: "Glow sticks and good vibes", sortOrder: 3 },
  { id: "g-glowz-4", category: "glowz", image: `${BC}/fae40211-dfbd-4144-b6f6-abdf885bf3a6_2x`, caption: "Glow foam party at night", sortOrder: 4 },
  { id: "g-glowz-5", category: "glowz", image: `${BC}/4d90fa42-d236-448d-85d5-e3534e8773ab_2x`, caption: "Lighting up Party Cove after dark", sortOrder: 5 },
];

const ALL_VESSEL_IDS = JSON.stringify(["explorer", "islander", "yachti"]);

const ADDONS = [
  { id: "balloon-package", name: "Balloon Package", price: 40, unit: "per charter", blurb: "A balloon arch or bundle set up on deck before you arrive — great for birthdays and celebrations.", sortOrder: 1 },
  { id: "champagne-bottle", name: "Complimentary Champagne", price: 25, unit: "per bottle", blurb: "A bottle of champagne on ice, ready for a toast.", sortOrder: 2 },
  { id: "decoration-package", name: "Full Decoration Package", price: 60, unit: "per charter", blurb: "Balloons, table setup, and themed decor for birthdays, bachelorette parties, and other celebrations.", sortOrder: 3 },
];

const PACKAGES = [
  {
    id: "tubing",
    name: "Tubing / Wakeboarding",
    image: "https://bc-user-uploads.brandcrowd.com/public/media-Production/3009ad0c-217a-4298-b498-e0325b468130/243bcf68-219a-4676-ae5f-f4ebf71e10aa_2x",
    pricingType: "hourly-by-vessel",
    hourlyJson: JSON.stringify(TUBING_HOURLY_BY_VESSEL),
    unit: "Includes fuel, tube, wakeboards, ice chest with water & ice.",
    blurb:
      "If you're just wanting to just cruise on the open water, seeking the thrill of tubing/wakeboarding, or having lunch on the lake with family or friends, this is your package! We will take you to some of the known hotspots on Lake Conroe such as: The Dam, The Island, Margaritaville, or even just tearing up the water and making some waves. The Nauti Yachti is available to lead Lake Conroe excursions for any type of fun planned on the water.",
    vesselsJson: ALL_VESSEL_IDS,
    sortOrder: 1,
  },
  {
    id: "birthday",
    name: "Birthday Party",
    image: "https://bc-user-uploads.brandcrowd.com/public/media-Production/3009ad0c-217a-4298-b498-e0325b468130/5b941b40-49d5-459f-b8c6-0cde311df58c_2x",
    pricingType: "hourly-by-vessel",
    hourlyJson: JSON.stringify(TUBING_HOURLY_BY_VESSEL),
    unit: "Includes decorations, fuel, tube, wakeboards, ice chest with water & ice.",
    blurb:
      "Celebrating a memorable moment for a birthday on the water? We have you setup with complementary party supplies & an amazing atmosphere that will have you wanting to turn up, no matter the age group! We will be happy to assist with any party setup /surprises necessary to make experience tailored to exactly what is needed. Let us go above and beyond for your birthday needs!",
    vesselsJson: ALL_VESSEL_IDS,
    sortOrder: 2,
  },
  {
    id: "corporate",
    name: "Corporate Outing",
    image: null,
    pricingType: "hourly-by-vessel",
    hourlyJson: JSON.stringify(TUBING_HOURLY_BY_VESSEL),
    unit: "Includes fuel, tube, wakeboards, ice chest with water & ice.",
    blurb:
      "Team building events are an amazing idea to help make strong & lasting connections! Let the boss step down while we take charge on creating a fun filled environment! Have a client you want to impress? We can help turn heads by charting the perfect route for the amazing views offered on Lake Conroe. Let us host any of your business needs, we are on standby.",
    vesselsJson: ALL_VESSEL_IDS,
    sortOrder: 7,
  },
  {
    id: "bachelor",
    name: "Bachelor / Bachelorette",
    image: "https://bc-user-uploads.brandcrowd.com/public/media-Production/3009ad0c-217a-4298-b498-e0325b468130/eb06195d-be7b-45ba-8675-d55870eb0e3e_2x",
    pricingType: "hourly-by-vessel",
    hourlyJson: JSON.stringify(TUBING_HOURLY_BY_VESSEL),
    unit: "Includes decorations, fuel, tube, wakeboards, ice chest with water & ice.",
    blurb:
      "If you're wanting to turn up and get a little wild you wont forget on the lake, this is your package. We will be able to assist with providing party supplies or any other necessary setups/surprise to make this a once in a lifetime experience. We will take you to the known hotspots for partying such as Party Cove & The Dam. The Nauti Yachti can provide a unique option of booking a charter with female captains for special occasions. These captains are known for their ability to create a welcoming atmosphere. Male captains are also available to lead Lake Conroe excursions.",
    vesselsJson: ALL_VESSEL_IDS,
    sortOrder: 3,
  },
  {
    id: "night",
    name: "Night Cruise",
    image: "https://bc-user-uploads.brandcrowd.com/public/media-Production/3009ad0c-217a-4298-b498-e0325b468130/a6ab2689-14b2-4373-8b12-7f5730196f47_2x",
    pricingType: "hourly-by-vessel",
    hourlyJson: JSON.stringify(TUBING_HOURLY_BY_VESSEL),
    unit: "Includes dinner, fuel, ice chest with water & ice.",
    blurb:
      "Do you want to experience a night out under the stars and party like you're in the club, or make an unforgettable date night, this is your package then. We have plenty of lighting, party lights, glow sticks, and music to last all night. Champagne toast provided & complimentary, dinner can also be prepared and cooked on the boat. We can pace across the lake and enjoy the night sky or anchor off at a known hotspot on Lake Conroe nights.",
    vesselsJson: ALL_VESSEL_IDS,
    sortOrder: 4,
  },
  {
    id: "partycove",
    name: "Party Cove Package",
    image: "https://bc-user-uploads.brandcrowd.com/public/media-Production/3009ad0c-217a-4298-b498-e0325b468130/438eb309-786d-4e8f-a7b5-069a04233d48_2x",
    pricingType: "hourly-by-vessel",
    hourlyJson: JSON.stringify(PARTY_COVE_HOURLY_BY_VESSEL),
    unit: "Includes fuel, tube, wakeboards, ice chest with water & ice.",
    blurb:
      "Experience Lake Conroe's party spot, Party Cove! Prepare for an epic party where many different groups come to party hard under the Lake Conroe sun. Great atmospheres for meeting new people! We can provide food, a loaded ice chest, and whatever else is needed to embark on this journey. Glow Party packages available too!",
    vesselsJson: ALL_VESSEL_IDS,
    sortOrder: 5,
  },
  {
    id: "glowz",
    name: "Boatz & Glowz Package",
    image: "https://bc-user-uploads.brandcrowd.com/public/media-Production/3009ad0c-217a-4298-b498-e0325b468130/4d90fa42-d236-448d-85d5-e3534e8773ab_2x",
    pricingType: "per-guest",
    pricePerGuest: 50,
    fixedHours: 4,
    eventDate: "2026-09-19",
    unit: "Includes fuel, glow, ice chest with water & ice.",
    blurb:
      "This unique event occurs at the start of boat season and once more near the end. Party at night at Lake Conroe's party cove and escape reality. Let us be your taxi to & from Scott's Ridge. We provide storage, ice & ice chest, festivities, sober captains & much more. We take the entire fleet & crew out for this event to be able to split the 30 available seats between 3x vessels.",
    vesselsJson: ALL_VESSEL_IDS,
    sortOrder: 6,
  },
  {
    id: "wakesurf",
    name: "Wake Surfing Lessons",
    pricingType: "tiered-by-guests",
    fixedHours: 3,
    tiersJson: JSON.stringify([
      { max: 8, price: 720 },
      { max: 11, price: 770 },
      { max: null, price: 820 }, // null = "and above" (Infinity, JSON-safe)
    ]),
    linkLabel: "YOLO LAKE CONROE.",
    linkUrl: "https://yololakeconroe.stellarims.com/details/5?departure=09/27/2025",
    unit: "3-hour private coaching session — partner experience",
    blurb:
      "Ready to learn wake surfing or take your skills to the next level? Join Yolo Lake Conroe for a private 3-hour coaching session featuring professional instruction, premium equipment, and one of the newest surf boats on Lake Conroe.\n\nWhether you're stepping onto a board for the first time or looking to improve your style, control, and tricks, we'll customize the session to match your skill level.",
    bulletsIntro: "What You’ll Get:",
    bulletsJson: JSON.stringify([
      "3 hours on the water with personalized coaching",
      "Premium surf boards for all ages and skill levels",
      "A world-class surf wake designed for progression",
      "Beginner-friendly instruction with proven teaching techniques",
    ]),
    closing:
      "Yolo Lake Conroe specializes in helping first-time riders get up and surf with confidence. For experienced surfers, we deliver the clean, powerful wave you need to push your limits and have an unforgettable session.\n\nYour perfect wave is waiting. Let's ride.",
    vesselsJson: JSON.stringify([]),
    sortOrder: 8,
  },
];

async function main() {
  for (const v of VESSELS) {
    await prisma.vessel.upsert({ where: { id: v.id }, update: v, create: v });
  }
  for (const g of GALLERY) {
    await prisma.galleryItem.upsert({ where: { id: g.id }, update: g, create: g });
  }
  for (const p of PACKAGES) {
    await prisma.package.upsert({ where: { id: p.id }, update: p, create: p });
  }
  for (const a of ADDONS) {
    await prisma.addOn.upsert({ where: { id: a.id }, update: a, create: a });
  }
  console.log(`Seeded ${VESSELS.length} vessels, ${GALLERY.length} gallery items, ${PACKAGES.length} packages, ${ADDONS.length} add-ons.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
