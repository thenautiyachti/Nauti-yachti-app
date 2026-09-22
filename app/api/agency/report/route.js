const { NextResponse } = require("next/server");
const { requireAdmin, bad } = require("../_guard");
const { validPeriod, currentPeriod, periodReport } = require("../../../../lib/agency/store");

// Everything the console needs for one month, in one request.
//
// One endpoint rather than eight, because every figure on that screen is
// derived from the same settlement and fetching them separately would let the
// payout run and the royalty disagree with each other on screen — computed a
// few hundred milliseconds apart, from a table that changed in between.
async function GET(req) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const requested = new URL(req.url).searchParams.get("period");
  if (requested && !validPeriod(requested)) return bad("period must be YYYY-MM.");

  const period = validPeriod(requested) || currentPeriod();
  const report = await periodReport(period, new Date());
  return NextResponse.json(report);
}

module.exports = { GET };
