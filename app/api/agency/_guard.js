// Shared entry check for every agency route.
//
// The agency console sits behind the same admin session as the rest of this
// app. That is not merely convenient: clause 10 of the Inner Wifi Sales
// Agreement forbids making the licensed material publicly available, and the
// records behind these endpoints include performers' compliance status. There
// is no route below that is safe to serve unauthenticated, so the check is a
// shared helper rather than a decision each route makes for itself.

const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

async function requireAdmin() {
  if (await isAdminAuthenticated()) return null;
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

function bad(message) {
  return NextResponse.json({ error: message }, { status: 400 });
}

module.exports = { requireAdmin, bad };
