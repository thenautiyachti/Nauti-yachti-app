const fs = require("fs");
const path = require("path");
const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../../lib/auth-guard");

// The liability waiver is an unreviewed DRAFT marked "not for use with guests".
// It used to sit in public/, which meant anyone who guessed the URL could
// download it — robots.txt only asks crawlers not to index a file, it does not
// make it private. It now lives outside public/ and is streamed only to a
// request carrying a valid admin session.
//
// next.config.js has an outputFileTracingIncludes entry for this route so the
// PDF is bundled into the serverless function on deploy.
const WAIVER_PATH = path.join(process.cwd(), "private", "legal", "liability-waiver-draft.pdf");

async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let file;
  try {
    file = fs.readFileSync(WAIVER_PATH);
  } catch {
    return NextResponse.json({ error: "Waiver document not found" }, { status: 404 });
  }

  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/pdf",
      // inline so it opens in a tab like the manual does, rather than downloading
      "Content-Disposition": 'inline; filename="Nauti_Yachti_Liability_Waiver_DRAFT.pdf"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

module.exports = { GET };
