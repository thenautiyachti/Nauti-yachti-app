const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// This answers "is whoever is holding this cookie signed in", which is about as
// per-request as an answer gets. It was going out as
// `Cache-Control: public, max-age=0, must-revalidate` — the default. The
// max-age=0 saves it in practice, but `public` on an authentication-state
// endpoint is the wrong instruction to hand a shared cache, and a stale
// `{"authenticated":true}` would walk somebody into a console where every
// request then answers 401. Say no-store and stop relying on luck.
const dynamic = "force-dynamic";

async function GET() {
  return NextResponse.json(
    { authenticated: await isAdminAuthenticated() },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}

module.exports = { GET, dynamic };
