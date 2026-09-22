// Set the partnership split.
//
//   node scripts/seed-agency-partners.js
//
// Austin 45%, David 55%. David originated the idea and runs operations, which
// is what the extra ten points are for; Austin brings creators and builds the
// technical side.
//
// WRITTEN DOWN BEFORE ANYBODY RECRUITS ANYONE. A split agreed verbally is a
// split that gets remembered differently the first month there is real money in
// it. This is not the legal agreement — that still needs writing — but it is a
// dated record of what was agreed, and the figure every partner draw is
// computed from.
//
// Basis points, not percentages: 4500 = 45.00%. The pair must total 10000, and
// lib/agency/split.js warns loudly if they ever stop doing so.

const fs = require("fs");
try {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

if (!process.env.DATABASE_URL) {
  console.error("\n  DATABASE_URL is not set.\n");
  process.exit(1);
}

const { prisma } = require("../lib/db");

const PARTNERS = [
  { key: "austin", name: "Austin", shareBp: 4500 },
  { key: "david", name: "David Rodgers", shareBp: 5500 },
];

async function main() {
  const total = PARTNERS.reduce((sum, p) => sum + p.shareBp, 0);
  if (total !== 10000) {
    console.error(`\n  Shares total ${total / 100}%, not 100%. Refusing.\n`);
    process.exit(1);
  }

  for (const partner of PARTNERS) {
    await prisma.agencyPartner.upsert({
      where: { key: partner.key },
      create: { ...partner, active: true },
      update: { name: partner.name, shareBp: partner.shareBp, active: true },
    });
    console.log(`  ${partner.name.padEnd(16)} ${partner.shareBp / 100}%`);
  }

  // The royalty settings row exists whether or not a royalty is ever owed. With
  // the InnerWifi deal declined there is nothing to pay, so the rate is zero —
  // and the row stays, because a rate of zero that is recorded is different
  // from a rate nobody ever set.
  await prisma.agencySettings.upsert({
    where: { id: "default" },
    create: { id: "default", royaltyBasis: "net_profit", royaltyRateBp: 0 },
    update: {},
  });

  console.log("\n  Split recorded. Partner draws will be computed from it.\n");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n  Failed:", e.message, "\n");
  await prisma.$disconnect();
  process.exit(1);
});
