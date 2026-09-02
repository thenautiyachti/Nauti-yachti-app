const crypto = require("crypto");
const { NextResponse } = require("next/server");
const { createSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE } = require("../../../../lib/session");
const { lockedFor, recordFailure, recordSuccess } = require("../../../../lib/loginThrottle");

// Compare without leaking the answer through timing. A plain !== returns as
// soon as two characters differ, so how long it takes reveals how much of the
// guess was right. Hashing first gives both sides equal length, which
// timingSafeEqual requires.
function sameSecret(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

async function POST(req) {
  const wait = lockedFor(req);
  if (wait !== null) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(wait) } }
    );
  }

  let passcode;
  try {
    ({ passcode } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Server misconfigured: ADMIN_PASSWORD is not set." },
      { status: 500 }
    );
  }

  if (typeof passcode !== "string" || !sameSecret(passcode, process.env.ADMIN_PASSWORD)) {
    recordFailure(req);
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 });
  }

  recordSuccess(req);
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
