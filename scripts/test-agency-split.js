// Does the money actually come out where it is supposed to?
//
// Every figure in here is checked against arithmetic done by hand, because the
// whole point of the waterfall is that nobody can eyeball whether $27.30 is the
// right residual on a $100 subscription. Two of these cases — the gross/net
// basis inversion and the loss month — are the ones that produced wrong answers
// on the way to writing the module.

const { applyBp, allocate, formatCents, parseMoneyToCents } = require("../lib/agency/money");
const {
  splitEarning, settlePeriod, applyTiers, tiersFor, describeTiers,
  DEFAULT_TIERS, FOUNDING_TIERS,
} = require("../lib/agency/split");

let pass = 0, fail = 0;
function ok(what, got, want) {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log("   " + (good ? "ok  " : "FAIL") + "  " + what.padEnd(60) +
    (good ? "" : "\n         got " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
  good ? pass++ : fail++;
}

// --- cents and basis points --------------------------------------------------
console.log("\n  MONEY\n");
ok("2.5% of $1,000 is $25", applyBp(100000, 250), 2500);
ok("20% of $10 is $2", applyBp(1000, 2000), 200);
ok("a half-cent rounds away from zero, positive", applyBp(1, 5000), 1);
ok("a half-cent rounds away from zero, negative", applyBp(-1, 5000), -1);
ok("$1,234.56 formats", formatCents(123456), "$1,234.56");
ok("a negative formats as -$12.34, not $-12.34", formatCents(-1234), "-$12.34");
ok("accounting parentheses are a negative", parseMoneyToCents("(45.00)"), -4500);
ok("an unparseable amount is null, not zero", parseMoneyToCents("n/a"), null);
ok("a genuine zero is zero, not null", parseMoneyToCents("0.00"), 0);

console.log("\n  ALLOCATION — the parts must equal the whole\n");
ok("an odd cent 50/50 does not vanish", allocate(101, [5000, 5000]), [51, 50]);
ok("a negative odd cent divides the same way", allocate(-101, [5000, 5000]), [-51, -50]);
ok("thirds reconcile exactly", allocate(100, [3333, 3333, 3334]), [33, 33, 34]);
ok("a year of odd months never loses a cent",
  Array.from({ length: 12 }, (_, i) => allocate(10001 + i, [5000, 5000]))
    .every((parts, i) => parts[0] + parts[1] === 10001 + i), true);
ok("zero weights get zero, not NaN", allocate(500, [0, 0]), [0, 0]);

// --- one line ----------------------------------------------------------------
console.log("\n  ONE STATEMENT LINE — $100 subscription, 50/50 on net\n");
const account = { id: "acc1", creatorId: "cr1", platformFeeBp: 2000, royaltyCovered: true };
const netCreator = { id: "cr1", stageName: "Ava", creatorShareBp: 5000, splitBasis: "net" };
const line = splitEarning({ grossCents: 10000, platformFeeCents: 2000, netCents: 8000 }, netCreator, account);
ok("the fan paid $100", line.grossCents, 10000);
ok("OnlyFans took $20", line.platformFeeCents, 2000);
ok("$80 reached the account", line.netCents, 8000);
ok("the creator keeps $40", line.creatorCents, 4000);
ok("the agency keeps $40", line.agencyCents, 4000);
ok("nothing to warn about", line.warnings, []);

console.log("\n  THE SAME DEAL WRITTEN ON GROSS — not the same deal\n");
const grossCreator = { id: "cr1", stageName: "Ava", creatorShareBp: 5000, splitBasis: "gross" };
const grossLine = splitEarning({ grossCents: 10000, platformFeeCents: 2000, netCents: 8000 }, grossCreator, account);
ok("the creator keeps $50, not $40", grossLine.creatorCents, 5000);
ok("the agency is left $30, a quarter less", grossLine.agencyCents, 3000);
ok("which is 62.5% of what actually arrived",
  Math.round((grossLine.creatorCents / grossLine.netCents) * 1000) / 10, 62.5);

console.log("\n  A SPLIT THAT PAYS OUT MORE THAN ARRIVED\n");
const greedy = { id: "cr1", stageName: "Ava", creatorShareBp: 9000, splitBasis: "gross" };
const upsideDown = splitEarning({ grossCents: 10000, platformFeeCents: 2000, netCents: 8000 }, greedy, account);
ok("the agency goes negative", upsideDown.agencyCents, -1000);
ok("and says so rather than paying it quietly", upsideDown.warnings.length, 1);

console.log("\n  A STATEMENT LINE THAT DOES NOT BALANCE\n");
const bent = splitEarning({ grossCents: 10000, platformFeeCents: 2000, netCents: 7000 }, netCreator, account);
ok("the discrepancy is reported", bent.warnings.length, 1);

// --- a whole month -----------------------------------------------------------
console.log("\n  A MONTH — two creators, $12,000 gross, $2,400 of costs\n");

const creators = [
  { id: "cr1", stageName: "Ava", creatorShareBp: 5000, splitBasis: "net", payoutMinCents: 5000 },
  { id: "cr2", stageName: "Bea", creatorShareBp: 6000, splitBasis: "net", payoutMinCents: 5000 },
];
const accounts = [
  { id: "acc1", creatorId: "cr1", handle: "ava", platform: "onlyfans", platformFeeBp: 2000, royaltyCovered: true },
  { id: "acc2", creatorId: "cr2", handle: "bea", platform: "onlyfans", platformFeeBp: 2000, royaltyCovered: true },
];
const earnings = [
  { id: "e1", accountId: "acc1", period: "2026-09", kind: "subscription", grossCents: 800000, platformFeeCents: 160000, netCents: 640000 },
  { id: "e2", accountId: "acc2", period: "2026-09", kind: "subscription", grossCents: 400000, platformFeeCents: 80000, netCents: 320000 },
];
const expenses = [
  { id: "x1", period: "2026-09", category: "chatter", amountCents: 180000, agencyAttributable: true },
  { id: "x2", period: "2026-09", category: "advertising", amountCents: 60000, agencyAttributable: true },
  { id: "x3", period: "2026-09", category: "other", amountCents: 999999, agencyAttributable: false },
];
const partners = [
  { key: "owner", name: "Owner", shareBp: 5000, active: true },
  { key: "david", name: "David Rodgers", shareBp: 5000, active: true },
];

const month = settlePeriod({
  period: "2026-09", earnings, accounts, creators, expenses, partners,
  settings: { royaltyBasis: "net_profit", royaltyRateBp: 250 },
});

// Ava: $8,000 gross -> $6,400 net -> $3,200 each.
// Bea:  $4,000 gross -> $3,200 net -> creator 60% = $1,920, agency $1,280.
ok("creators are owed $5,120 between them", month.creatorOwedCents, 512000);
ok("agency commission is $4,480", month.agencyGrossCents, 448000);
ok("costs are $2,400 — the non-attributable row is excluded", month.agencyExpenseCents, 240000);
ok("agency net profit is $2,080", month.agencyNetProfitCents, 208000);

console.log("\n  CLAUSE 4 — the two readings of the same six words\n");
ok("2.5% of net profit is $52", month.royalty.amountCents, 5200);
ok("2.5% of revenue would be $112", month.royalty.alternateAmountCents, 11200);
ok("the ambiguity is worth $60 this month", month.royalty.ambiguityCents, 6000);
ok("and $720 over a year at this run rate", month.royalty.ambiguityCents * 12, 72000);

console.log("\n  THE RESIDUAL\n");
ok("$2,028 is left to divide", month.distributableCents, 202800);
ok("the owner draws $1,014", month.partnerDraws.find((p) => p.partner === "owner").amountCents, 101400);
ok("David draws $1,014", month.partnerDraws.find((p) => p.partner === "david").amountCents, 101400);
ok("the draws sum to the residual exactly",
  month.partnerDraws.reduce((s, p) => s + p.amountCents, 0), month.distributableCents);
ok("and the whole waterfall reconciles to the commission",
  month.royalty.amountCents + month.distributableCents + month.agencyExpenseCents,
  month.agencyGrossCents);

console.log("\n  AN ACCOUNT OUTSIDE THE ROYALTY — clause 4's carve-out\n");
const carved = settlePeriod({
  period: "2026-09", earnings, creators, expenses, partners,
  accounts: [accounts[0], { ...accounts[1], royaltyCovered: false }],
  settings: { royaltyBasis: "net_profit", royaltyRateBp: 250 },
});
ok("covered revenue drops to Ava's $3,200", carved.royalty.coveredRevenueCents, 320000);
ok("costs are apportioned to it in proportion", carved.royalty.coveredExpenseCents, 171429);
ok("so the royalty falls to $37.14", carved.royalty.amountCents, 3714);
ok("but the partners' residual is untouched by the carve-out",
  carved.agencyNetProfitCents, month.agencyNetProfitCents);

console.log("\n  A LOSS MONTH — where the two readings diverge hardest\n");
const lossMonth = settlePeriod({
  period: "2026-09", earnings, accounts, creators, partners,
  expenses: [{ id: "x9", period: "2026-09", category: "advertising", amountCents: 600000, agencyAttributable: true }],
  settings: { royaltyBasis: "net_profit", royaltyRateBp: 250 },
});
ok("the agency lost $1,520", lossMonth.agencyNetProfitCents, -152000);
ok("nothing is owed on the net-profit reading", lossMonth.royalty.amountCents, 0);
ok("but $112 would be owed on the revenue reading", lossMonth.royalty.alternateAmountCents, 11200);
ok("the loss divides between the partners too",
  lossMonth.partnerDraws.map((p) => p.amountCents), [-76000, -76000]);

console.log("\n  A ROYALTY WITH AN END DATE — what an addendum would buy\n");
const afterEnd = settlePeriod({
  period: "2026-09", earnings, accounts, creators, expenses, partners,
  settings: { royaltyBasis: "net_profit", royaltyRateBp: 250, royaltyEndsOn: "2026-08-31" },
});
ok("nothing is owed after it ends", afterEnd.royalty.amountCents, 0);
ok("and the partners keep the difference", afterEnd.distributableCents, 208000);

console.log("\n  PARTNER SHARES THAT DO NOT ADD UP\n");
const wonky = settlePeriod({
  period: "2026-09", earnings, accounts, creators, expenses,
  partners: [{ key: "owner", name: "Owner", shareBp: 5000, active: true },
             { key: "david", name: "David", shareBp: 4000, active: true }],
  settings: {},
});
ok("it still divides the whole residual",
  wonky.partnerDraws.reduce((s, p) => s + p.amountCents, 0), wonky.distributableCents);
ok("and warns that the split is wrong", wonky.warnings.some((w) => /not 100%/.test(w)), true);

console.log("\n  BAD REFERENCES\n");
const orphan = settlePeriod({
  period: "2026-09", accounts, creators, expenses: [], partners,
  earnings: [{ id: "e9", accountId: "nope", period: "2026-09", grossCents: 100000, platformFeeCents: 20000, netCents: 80000 }],
  settings: {},
});
ok("an earning on an unknown account is skipped, not counted", orphan.agencyGrossCents, 0);
ok("and named", orphan.warnings.length, 1);

console.log("\n  THE RATE BANDS — a rate that improves as she grows\n");
ok("$2,000 is all in the first band: half", applyTiers(200000, DEFAULT_TIERS), 100000);
ok("exactly $5,000 is still half", applyTiers(500000, DEFAULT_TIERS), 250000);
ok("$10,000 is 50% of five then 60% of five", applyTiers(1000000, DEFAULT_TIERS), 550000);
ok("$15,000 tops out the middle band", applyTiers(1500000, DEFAULT_TIERS), 850000);
ok("$20,000 reaches the top band", applyTiers(2000000, DEFAULT_TIERS), 1200000);
ok("which leaves the agency $8,000", 2000000 - applyTiers(2000000, DEFAULT_TIERS), 800000);

console.log("\n  NO CLIFF AT A BAND EDGE\n");
ok("one cent over $5,000 earns one cent more, not less",
  applyTiers(500001, DEFAULT_TIERS) > applyTiers(500000, DEFAULT_TIERS), true);
ok("and the step is 60 cents on the dollar, not a re-price",
  applyTiers(500100, DEFAULT_TIERS) - applyTiers(500000, DEFAULT_TIERS), 60);
ok("earning more never takes home less, across every edge",
  Array.from({ length: 40 }, (_, i) => applyTiers(i * 50000, DEFAULT_TIERS))
    .every((v, i, a) => i === 0 || v >= a[i - 1]), true);

console.log("\n  THE FOUNDING CREATOR\n");
ok("60% from the first dollar", applyTiers(100000, FOUNDING_TIERS), 60000);
ok("and still 60% at $10,000", applyTiers(1000000, FOUNDING_TIERS), 600000);
ok("she beats the standard deal at $10,000",
  applyTiers(1000000, FOUNDING_TIERS) > applyTiers(1000000, DEFAULT_TIERS), true);
ok("but the standard deal overtakes her once it tiers up",
  applyTiers(3000000, DEFAULT_TIERS) > applyTiers(3000000, FOUNDING_TIERS), true);

console.log("\n  AWKWARD BANDS\n");
ok("a month underwater takes back at the LOWEST rate, not the highest",
  applyTiers(-50000, DEFAULT_TIERS), -25000);
ok("zero is zero", applyTiers(0, DEFAULT_TIERS), 0);
ok("no bands falls back to the standard ones", applyTiers(1000000, null), 550000);
ok("bands that stop short still pay on the remainder",
  applyTiers(1000000, [{ uptoCents: 100000, creatorShareBp: 5000 }]), 500000);

console.log("\n  READING A RATE PLAN\n");
ok("a JSON string parses", tiersFor({ rateTiersJson: JSON.stringify(DEFAULT_TIERS) }).length, 3);
ok("no plan is null, not an empty list", tiersFor({ creatorShareBp: 5000 }), null);
ok("malformed JSON is treated as absent, never as zero",
  tiersFor({ rateTiersJson: "{not json" }), null);
ok("an empty list is treated as absent", tiersFor({ rateTiersJson: "[]" }), null);
ok("a band over 100% is dropped rather than paid",
  tiersFor({ rateTiersJson: JSON.stringify([{ uptoCents: null, creatorShareBp: 15000 }]) }), null);

console.log("\n  A TIERED MONTH, END TO END\n");
const bigMonth = settlePeriod({
  period: "2026-09",
  creators: [{ id: "cr1", stageName: "Ava", creatorShareBp: 5000, splitBasis: "net",
               rateTiersJson: JSON.stringify(DEFAULT_TIERS) }],
  accounts: [{ id: "acc1", creatorId: "cr1", handle: "ava", platformFeeBp: 2000, royaltyCovered: true }],
  earnings: [
    { id: "e1", accountId: "acc1", period: "2026-09", grossCents: 1500000, platformFeeCents: 300000, netCents: 1200000 },
    { id: "e2", accountId: "acc1", period: "2026-09", grossCents: 1000000, platformFeeCents: 200000, netCents: 800000 },
  ],
  expenses: [],
  partners: [{ key: "owner", name: "Owner", shareBp: 4500, active: true },
             { key: "david", name: "David", shareBp: 5500, active: true }],
  settings: { royaltyRateBp: 0 },
});
ok("two lines totalling $20,000 of net", bigMonth.perCreator[0].netCents, 2000000);
ok("are banded on the MONTH, not line by line", bigMonth.creatorOwedCents, 1200000);
ok("leaving the agency $8,000", bigMonth.agencyGrossCents, 800000);
ok("the creator row says which plan she is on",
  bigMonth.perCreator[0].tiered, true);
ok("creator plus agency still equals what arrived",
  bigMonth.perCreator[0].creatorCents + bigMonth.perCreator[0].agencyCents,
  bigMonth.perCreator[0].netCents);

console.log("\n  BANDING BEATS LINE-BY-LINE, WHICH IS THE WHOLE POINT\n");
ok("split per line she would have been underpaid",
  applyTiers(1200000, DEFAULT_TIERS) + applyTiers(800000, DEFAULT_TIERS) < applyTiers(2000000, DEFAULT_TIERS),
  true);

ok("the partners split what is left, 45/55",
  bigMonth.partnerDraws.map((p) => p.amountCents), [360000, 440000]);
ok("and it reconciles exactly",
  bigMonth.partnerDraws.reduce((a, p) => a + p.amountCents, 0), bigMonth.distributableCents);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
