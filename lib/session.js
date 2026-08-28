const crypto = require("crypto");

const SESSION_COOKIE_NAME = "nauti_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours, in seconds

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Add it to your .env file.");
  }
  return secret;
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function createSessionCookieValue() {
  const secret = getSecret();
  const payload = JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE * 1000 });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = sign(b64, secret);
  return `${b64}.${sig}`;
}

function verifySessionCookieValue(value) {
  if (!value) return false;
  let secret;
  try {
    secret = getSecret();
  } catch {
    return false;
  }
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const [b64, sig] = parts;
  const expectedSig = sign(b64, secret);
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  createSessionCookieValue,
  verifySessionCookieValue,
};
