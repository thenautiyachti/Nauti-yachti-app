const { cookies } = require("next/headers");
const { SESSION_COOKIE_NAME, verifySessionCookieValue } = require("./session");

// Call from any API route to check whether the request carries a valid
// admin session cookie. Returns true/false — never throws.
//
// Async since Next 15: cookies() returns a promise, so every caller must
// await this.
async function isAdminAuthenticated() {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME);
    return verifySessionCookieValue(cookie && cookie.value);
  } catch {
    return false;
  }
}

module.exports = { isAdminAuthenticated };
