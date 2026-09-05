const { NextResponse } = require("next/server");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

// The dock address and gate code, for the owner's own phone page.
//
// ADMIN ONLY, and it must stay that way. The gate code opens a private
// residence; this is the one place in the application that hands it out, and it
// does so to a logged-in owner on his own device so that the day-of text is one
// tap instead of something to remember.
//
// The values live in the Vercel environment, never in the repository — a gate
// code committed to git stays in its history permanently, and rotating the code
// afterwards would not remove it.
//
// Deliberately NOT included in the guest's booking confirmation. An email is
// forwarded and kept forever, so mailing the code would leave every past guest
// holding working access indefinitely. The address is safe to email and is;
// the code is texted on the morning.
async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({
    address: process.env.DOCK_ADDRESS || "",
    gateCode: process.env.DOCK_GATE_CODE || "",
    phone: process.env.CONTACT_PHONE || "(832) 948-2912",
    arriveMinutesEarly: process.env.ARRIVE_MINUTES_EARLY || "15",
  });
}

module.exports = { GET };
