const { NextResponse } = require("next/server");
const { prisma } = require("../../../lib/db");
const { isAdminAuthenticated } = require("../../../lib/auth-guard");

// Public: a guest asking for their photographs, from the QR code on the boat.
//
// Deliberately forgiving. This is filled in one-handed, on a phone, in sunlight,
// by somebody who is about to step off a boat. Anything that rejects their entry
// for a formatting reason loses both the photo request and the contact detail.
//
// So: a name and ONE way to reach them is all that is required. No confirmation
// step, no validation beyond "is this plausibly an email or a phone".

function looksLikeEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

// Ten digits somewhere in the string. People type (936) 555-1212, 936.555.1212,
// +1 936 555 1212, and all of those are the same number.
function looksLikePhone(v) {
  return typeof v === "string" && (String(v).match(/\d/g) || []).length >= 10;
}

async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : "";
  const charterDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.charterDate || "")) ? body.charterDate : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  if (!name) {
    return NextResponse.json({ error: "Please tell us your name so we know which photos are yours." }, { status: 400 });
  }
  const hasEmail = email && looksLikeEmail(email);
  const hasPhone = phone && looksLikePhone(phone);
  if (!hasEmail && !hasPhone) {
    return NextResponse.json(
      { error: "We need one way to send them — an email address or a mobile number." },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.photoRequest.create({
      data: {
        name,
        email: hasEmail ? email : null,
        phone: hasPhone ? phone : null,
        charterDate,
        note: note || null,
      },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    // Never show a guest a database error. They did nothing wrong and there is
    // nothing they can do about it.
    console.error("[photo-request] " + e.message);
    return NextResponse.json(
      { error: "Something went wrong our end. Grab the captain and he'll take your details." },
      { status: 500 }
    );
  }
}

// ADMIN ONLY, with no public mode at all.
//
// This differs deliberately from /api/testimonials, which answers publicly with
// the approved rows and switches to the full queue for an admin. There is no
// equivalent here: every row is a named guest's mobile number or email address,
// given to us for one purpose. There is nothing in this table that a stranger
// has any business reading, so an unauthenticated caller gets 401 and no body.
async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Unfulfilled first — that is the promise still outstanding — and oldest
  // first within that, because the guest who has waited longest is the one
  // most likely to have decided we were never going to send them.
  const rows = await prisma.photoRequest.findMany({ orderBy: { createdAt: "desc" } });
  const pending = rows.filter((r) => !r.sentAt).sort((a, b) => a.createdAt - b.createdAt);
  const sent = rows.filter((r) => r.sentAt);
  return NextResponse.json([...pending, ...sent]);
}

module.exports = { GET, POST };
