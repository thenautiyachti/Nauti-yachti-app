const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

const JARVIS_SERVICE_KEY = process.env.JARVIS_SERVICE_KEY;

// Bank balance readings — what the bank said, on the day somebody looked.
//
// The ledger knows what was earned and spent. It has never known what is IN the
// account, because it does not see transfers between accounts, the owner's own
// deposits, or a fee the bank took quietly. On 31 Aug 2026 this account sat at
// MINUS $11.36 with two bounced Optimum payments, and nothing here could say so.
//
// Same dual auth as /api/admin/agent-activity: the owner's session cookie for
// the console, or the machine key so an agent can file a reading from a
// statement it has just read.
async function authorized(req) {
  const key = req.headers.get("x-jarvis-key");
  return (await isAdminAuthenticated()) || (JARVIS_SERVICE_KEY && key === JARVIS_SERVICE_KEY);
}

// GET -> the newest reading per account, plus that account's recent history.
//
// Returns the LATEST per account rather than every row, because the question
// the console asks is "what is in the bank". The history rides along so a
// balance can be seen falling before it goes negative, which is the whole point
// of keeping readings rather than one mutable number.
async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rows = await prisma.bankBalanceReading.findMany({
    orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const byAccount = new Map();
  for (const r of rows) {
    if (!byAccount.has(r.account)) byAccount.set(r.account, { latest: r, history: [] });
    else byAccount.get(r.account).history.push(r);
  }

  // TODAY IN TEXAS, not today in UTC.
  //
  // asOf is the calendar date the owner read the bank app on — a local date,
  // with no time in it. toISOString() gives UTC, which after 5pm Central is
  // already tomorrow, so a balance read this afternoon came back as "1d ago"
  // and a week-old one would have turned amber a day early. Every evening, the
  // panel would have quietly aged by a day nobody had lived through.
  //
  // America/Chicago is the business's own clock — the same zone the booking
  // confirmation prints departure times in. en-CA is the locale that formats a
  // date as YYYY-MM-DD, which is the form asOf is stored in.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const accounts = [...byAccount.entries()].map(([account, v]) => ({
    account,
    last4: v.latest.last4,
    balance: v.latest.balance,
    asOf: v.latest.asOf,
    source: v.latest.source,
    note: v.latest.note,
    // Age in days, so the console can show a stale figure AS stale rather than
    // presenting a three-week-old number as the current balance.
    ageDays: Math.max(0, Math.round((Date.parse(today) - Date.parse(v.latest.asOf)) / 86400000)),
    history: v.history.slice(0, 12),
  }));

  return NextResponse.json(accounts);
}

// POST -> file a reading. Body: { account, balance, asOf, last4?, source?, note? }
//
// Always an INSERT. A reading is a fact about a day and is never edited: if the
// figure was wrong, the correct response is a newer reading, not a rewritten
// one. That is what makes the history trustworthy.
async function POST(req) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const account = String(body.account || "").trim();
  const asOf = String(body.asOf || "").trim();
  const balance = Number(body.balance);

  if (!account) return NextResponse.json({ error: "account is required" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return NextResponse.json({ error: "asOf must be YYYY-MM-DD — the date the balance was true" }, { status: 400 });
  }
  // A balance of zero is meaningful and so is a negative one; only a missing or
  // unparseable figure is an error. This account has genuinely been negative.
  if (!Number.isFinite(balance)) {
    return NextResponse.json({ error: "balance must be a number" }, { status: 400 });
  }

  const source = ["screenshot", "statement", "manual"].includes(body.source) ? body.source : "manual";
  const last4 = body.last4 ? String(body.last4).replace(/\D/g, "").slice(-4) : null;

  const created = await prisma.bankBalanceReading.create({
    data: { account, last4, balance, asOf, source, note: body.note || null },
  });

  return NextResponse.json(created, { status: 201 });
}

module.exports = { GET, POST };
