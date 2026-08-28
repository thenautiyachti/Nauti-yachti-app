const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

async function GET() {
  return NextResponse.json({ authenticated: isAdminAuthenticated() });
}

module.exports = { GET };
