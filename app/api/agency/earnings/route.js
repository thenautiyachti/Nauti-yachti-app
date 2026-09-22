const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { requireAdmin, bad } = require("../_guard");
const { validPeriod } = require("../../../../lib/agency/store");
const { parseStatement } = require("../../../../lib/agency/statements");

async function GET(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const params = new URL(req.url).searchParams;
  const period = validPeriod(params.get("period"));
  const accountId = params.get("accountId");

  const earnings = await prisma.agencyEarning.findMany({
    where: { ...(period ? { period } : {}), ...(accountId ? { accountId } : {}) },
    orderBy: { earnedOn: "desc" },
    take: 500,
  });
  return NextResponse.json(earnings);
}

// Import a statement.
//
// Two things this deliberately does NOT do. It does not log into OnlyFans —
// there is no third-party management API, and driving somebody else's session
// risks the account, which in this business is their whole income. And it does
// not silently swallow rows it cannot read: rejected lines come back with
// their line numbers so the file can be fixed and re-run, because an import
// that looks clean while being short by four rows surfaces weeks later as a
// creator whose payout disagrees with their own screenshot.
//
// The whole batch writes or none of it does. A half-imported statement is
// worse than a failed one: it reconciles against nothing and there is no way
// to tell by looking which half arrived.
async function POST(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json();
  if (!body.accountId) return bad("accountId is required.");
  if (typeof body.csv !== "string" || !body.csv.trim()) return bad("csv is required.");

  const account = await prisma.agencyAccount.findUnique({ where: { id: body.accountId } });
  if (!account) return bad("No such account.");

  const importBatch = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { entries, rejected, error } = parseStatement(body.csv, {
    accountId: account.id,
    platformFeeBp: account.platformFeeBp,
    importBatch,
  });

  if (error) return NextResponse.json({ error, rejected }, { status: 422 });
  if (!entries.length) {
    return NextResponse.json({ error: "Nothing in this file could be imported.", rejected }, { status: 422 });
  }

  // A re-uploaded statement is the normal case, not the exception, and a second
  // import that lands silently doubles the month — which doubles every creator
  // payout computed from it and the royalty on top.
  //
  // Where the export carries its own row ids, dedupe is exact. Most do not, and
  // the first version of this route skipped nothing for those files: a
  // re-upload of a statement without an id column imported cleanly, twice.
  //
  // So rows without an id are matched on what actually identifies them — the
  // account, the day, and the amounts — and COUNTED rather than merely matched.
  // Two genuine $20 tips on the same afternoon are a real thing, so this
  // imports the excess instead of dropping either: if the file holds three of a
  // row and the database already holds two, one is new. Re-uploading the same
  // file leaves nothing to add.
  const refs = entries.map((e) => e.externalRef).filter(Boolean);
  const seenRefs = refs.length
    ? new Set(
        (
          await prisma.agencyEarning.findMany({
            where: { accountId: account.id, externalRef: { in: refs } },
            select: { externalRef: true },
          })
        ).map((r) => r.externalRef)
      )
    : new Set();

  const naturalKey = (e) => `${e.earnedOn}|${e.grossCents}|${e.netCents}|${e.kind}`;
  const unidentified = entries.filter((e) => !e.externalRef);

  const heldCounts = new Map();
  if (unidentified.length) {
    const days = [...new Set(unidentified.map((e) => e.earnedOn))];
    const existing = await prisma.agencyEarning.findMany({
      where: { accountId: account.id, earnedOn: { in: days }, externalRef: null },
      select: { earnedOn: true, grossCents: true, netCents: true, kind: true },
    });
    for (const row of existing) {
      const key = naturalKey(row);
      heldCounts.set(key, (heldCounts.get(key) || 0) + 1);
    }
  }

  const fresh = [];
  for (const entry of entries) {
    if (entry.externalRef) {
      if (!seenRefs.has(entry.externalRef)) fresh.push(entry);
      continue;
    }
    const key = naturalKey(entry);
    const held = heldCounts.get(key) || 0;
    if (held > 0) heldCounts.set(key, held - 1);
    else fresh.push(entry);
  }
  const duplicates = entries.length - fresh.length;

  if (!fresh.length) {
    return NextResponse.json({
      importBatch, imported: 0, duplicates, rejected,
      message: "Every row in this file had already been imported.",
    });
  }

  if (body.dryRun) {
    return NextResponse.json({ dryRun: true, wouldImport: fresh.length, duplicates, rejected, entries: fresh.slice(0, 20) });
  }

  await prisma.agencyEarning.createMany({ data: fresh });

  const periods = [...new Set(fresh.map((e) => e.period))].sort();
  return NextResponse.json({ importBatch, imported: fresh.length, duplicates, rejected, periods });
}

// Undo a bad import as a unit. The reason importBatch exists.
async function DELETE(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const importBatch = new URL(req.url).searchParams.get("importBatch");
  if (!importBatch) return bad("importBatch is required — this route does not delete by anything else.");

  const { count } = await prisma.agencyEarning.deleteMany({ where: { importBatch } });
  return NextResponse.json({ importBatch, deleted: count });
}

module.exports = { GET, POST, DELETE };
