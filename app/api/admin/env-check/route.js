// Which variables does the RUNNING deployment actually have?
//
// This exists because of a real, week-long, silent failure. health-check.js
// reported "Resend: key present" every time it ran -- and it was reading the key
// out of the local secrets store on the owner's PC. Production had no
// RESEND_API_KEY at all, so lib/email.js returned { sent: false } before it
// reached the sender and every booking confirmation was quietly not sent. Local
// said healthy, production sent nothing, and nothing anywhere disagreed.
//
// A check that runs on a different machine from the thing it is checking is not
// a check. This endpoint answers from inside the deployment.
//
// It returns NAMES ONLY. Never a value, never a prefix, never a length -- those
// are all a slow way of leaking a secret. Whether a name is present is all the
// caller needs, and it is not sensitive.
const { NextResponse } = require("next/server");

const JARVIS_SERVICE_KEY = process.env.JARVIS_SERVICE_KEY;

// Required means: something the site cannot do its job without. Each entry says
// what actually breaks, so a failure reads as a consequence rather than a name.
const REQUIRED = [
  ["DATABASE_URL", "nothing loads at all"],
  ["DIRECT_URL", "Prisma migrations and direct queries"],
  ["SESSION_SECRET", "the console session cookie cannot be signed"],
  ["ADMIN_PASSWORD", "nobody can log into the console"],
  ["STRIPE_SECRET_KEY", "no checkout session can be created"],
  ["STRIPE_WEBHOOK_SECRET", "payments succeed but nothing records them"],
  ["RESEND_API_KEY", "booking confirmations are silently never sent"],
  ["OWNER_EMAIL", "nowhere to copy the owner on a booking"],
  ["FROM_EMAIL", "confirmations send from Resend's sandbox address"],
  ["JARVIS_SERVICE_KEY", "the crew cannot file statuses or speak"],
  ["ELEVENLABS_API_KEY", "no voice, anywhere"],
];

// Optional means: there is a working default, and the default is acceptable.
const OPTIONAL = [
  ["REPLY_TO_EMAIL", "falls back to OWNER_EMAIL; only safe if that is a real inbox"],
  ["ELEVENLABS_VOICE_ID", "unused now that voices live on the roster"],
  ["ELEVENLABS_MODEL_ID", "defaults to flash, which is half the price"],
  ["JARVIS_SPEECH_CAP", "defaults to 350 characters"],
  ["SPEECH_AUDIO_KEEP_DAYS", "defaults to 3"],
];

async function GET(req) {
  // Service key only. This is an operational endpoint, not a console one -- it
  // should answer a scheduled check on a machine with no browser session.
  if (!JARVIS_SERVICE_KEY || req.headers.get("x-jarvis-key") !== JARVIS_SERVICE_KEY) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const has = (k) => typeof process.env[k] === "string" && process.env[k].trim() !== "";

  return NextResponse.json({
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    missing: REQUIRED.filter(([k]) => !has(k)).map(([k, breaks]) => ({ name: k, breaks })),
    presentCount: REQUIRED.filter(([k]) => has(k)).length,
    requiredCount: REQUIRED.length,
    optionalMissing: OPTIONAL.filter(([k]) => !has(k)).map(([k, note]) => ({ name: k, note })),
  });
}

module.exports = { GET };
