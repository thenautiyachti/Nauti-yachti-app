// Where the browser sends what a Content-Security-Policy WOULD have blocked.
//
// The policy ships in Report-Only mode, so nothing is actually blocked yet.
// Without this endpoint that mode is pointless: the browser would write
// violations to each visitor's own console, where nobody would ever see them.
//
// Read them in the Vercel logs, filtered on "[csp]". After a week of real
// traffic the list stops growing, and whatever is on it either belongs in the
// policy or should not be loading at all. Only then is it worth renaming the
// header to Content-Security-Policy and letting it bite.
//
// No authentication, deliberately: the browser posts these unauthenticated by
// design, and refusing them would defeat the exercise. Nothing is stored and
// nothing is trusted -- the body is a report from a stranger's browser, so it
// is logged as text and never acted on.
const { NextResponse } = require("next/server");

// Chrome sends application/csp-report, newer browsers application/reports+json.
// Both arrive as JSON; the shape differs, so read defensively rather than
// assuming either.
async function POST(req) {
  let body = null;
  try { body = await req.json(); } catch { /* a malformed report is not an error worth raising */ }
  if (!body) return new NextResponse(null, { status: 204 });

  const reports = Array.isArray(body) ? body : [body];
  for (const r of reports.slice(0, 10)) {
    const v = r["csp-report"] || r.body || r;
    const blocked = v["blocked-uri"] || v.blockedURL || "?";
    const directive = v["violated-directive"] || v.effectiveDirective || "?";
    const doc = v["document-uri"] || v.documentURL || "?";

    // One line, greppable, and truncated: these are attacker-influenceable
    // strings and a log is not the place to find that out.
    console.error("[csp] " + String(directive).slice(0, 60) +
      "  blocked=" + String(blocked).slice(0, 160) +
      "  on=" + String(doc).slice(0, 120));
  }

  // 204 always. A browser that gets an error here may stop reporting, and a
  // reporting endpoint that argues with the browser is worse than none.
  return new NextResponse(null, { status: 204 });
}

module.exports = { POST };
