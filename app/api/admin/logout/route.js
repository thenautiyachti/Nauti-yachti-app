const { NextResponse } = require("next/server");
const { SESSION_COOKIE_NAME } = require("../../../../lib/session");

async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}

module.exports = { POST };
