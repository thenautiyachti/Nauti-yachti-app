const { NextResponse } = require("next/server");
const { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE } = require("../../../../lib/session");

async function POST(req) {
  const { passcode } = await req.json();

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Server misconfigured: ADMIN_PASSWORD is not set." },
      { status: 500 }
    );
  }

  if (passcode !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, createSessionCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

module.exports = { POST };
