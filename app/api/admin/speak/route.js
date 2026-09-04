const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
// The default voice, used for Pearl and for anything that does not name an
// agent. Still the old Jarvis preset until a Pearl voice is chosen -- that is a
// change to this variable in Vercel and in the secrets store, not to this file.
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "wDsJlOXPqcvIUKdLXjDs";

// A voice per agent, so an avatar can read its own status in its own voice.
// Variables are named after the agents: ELEVENLABS_VOICE_CORAL, _SIREN, _PENNY,
// _SHELLY, _JOY, _REEF, _NOVA, _PEARL.
//
// Unset ones fall through to the default, so setting none changes nothing and
// setting one changes only that agent. Adding a voice later is an environment
// change, not a deploy.
function voiceFor(agent) {
  const key = String(agent || "")
    .trim()
    .replace(/^nauti\s+/i, "")   // callers pass "Nauti Coral" or "Coral"
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!key) return ELEVENLABS_VOICE_ID;
  return process.env["ELEVENLABS_VOICE_" + key] || ELEVENLABS_VOICE_ID;
}
const JARVIS_SERVICE_KEY = process.env.JARVIS_SERVICE_KEY;

// Flash bills half a credit per character where multilingual_v2 bills a full
// one, and for short spoken status lines the difference in quality is not worth
// twice the price. Override with ELEVENLABS_MODEL_ID=eleven_multilingual_v2 to
// go back.
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";

// Every character synthesized is billed, so an unbounded message is an
// unbounded bill. The stored text is never truncated -- this only limits what
// is read aloud. A 2,353-character message once went through here, which is
// over two minutes of talking; nobody listens to that, they read it.
const SPEECH_CHAR_CAP = Number(process.env.JARVIS_SPEECH_CAP || 350);

// Trim to the last sentence that ends before the cap, so speech stops on a
// full stop rather than mid-word. Falls back to a word boundary if the first
// sentence is itself longer than the cap.
function speakableFrom(full, cap) {
  if (full.length <= cap) return full;
  const head = full.slice(0, cap);
  const lastStop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (lastStop > cap * 0.4) return head.slice(0, lastStop + 1);
  const lastSpace = head.lastIndexOf(" ");
  return (lastSpace > 0 ? head.slice(0, lastSpace) : head).replace(/[,;:s]+$/, "") + "...";
}

// POST { text: string } -> synthesizes speech via ElevenLabs and stores the
// resulting audio as a SpeechEvent row for the console to pick up on its
// next poll. This replaces the standalone Jarvis-Voice-UI server's websocket
// push — Vercel serverless functions can't hold a long-lived websocket, so
// the frontend polls GET /api/admin/speak?since=... instead.
//
// Auth: the owner's admin session cookie, OR a machine-only service key sent
// as `x-jarvis-key` — this lets Claude Code trigger speech from the backend
// without ever touching the human admin passcode.
async function POST(req) {
  const serviceKeyHeader = req.headers.get("x-jarvis-key");
  const authorized = (await isAdminAuthenticated()) || (JARVIS_SERVICE_KEY && serviceKeyHeader === JARVIS_SERVICE_KEY);
  if (!authorized) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const text = ((body && body.text) || "").trim();
  // Who is speaking. Optional: without it everything uses the default voice,
  // which is the behaviour this route has always had.
  const agent = (body && body.agent) || "";
  const voiceId = voiceFor(agent);
  if (!text) {
    return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
  }
  // The text is the point; the voice is a bonus. If synthesis is unavailable
  // for any reason — no API key, an exhausted ElevenLabs quota, an outage —
  // store the message as text so it still reaches the console. Previously
  // this returned early and the words were lost along with the audio, which
  // meant a credit problem silently turned into a communication blackout.
  async function saveTextOnly(reason) {
    await prisma.speechEvent.create({ data: { text, audioB64: null } });
    return NextResponse.json({ ok: true, spoken: false, reason });
  }

  if (!ELEVENLABS_API_KEY) {
    return saveTextOnly("ELEVENLABS_API_KEY not set");
  }

  try {
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          // Read the constant rather than repeating a literal here. It was
          // hardcoded to multilingual while ELEVENLABS_MODEL_ID sat above
          // defaulting to flash and being ignored -- so every line was billed at
          // twice the intended rate, which is not a small thing when the credits
          // are what ran out.
          model_id: ELEVENLABS_MODEL_ID,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: 1.1 },
        }),
      }
    );

    if (!elevenRes.ok) {
      const errBody = await elevenRes.text().catch(() => "");
      console.error("[elevenlabs] request failed:", elevenRes.status, errBody);
      // Quota exhausted is the common case and is not an error worth losing
      // the message over — keep the text, drop the voice.
      return saveTextOnly(`ElevenLabs ${elevenRes.status}: ${errBody.slice(0, 200)}`);
    }

    const arrayBuffer = await elevenRes.arrayBuffer();
    const audioB64 = Buffer.from(arrayBuffer).toString("base64");

    await prisma.speechEvent.create({ data: { text, audioB64 } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[speak] threw:", err);
    return NextResponse.json({ error: "Internal error", detail: String(err) }, { status: 500 });
  }
}

// GET ?since=<ISO timestamp> -> any SpeechEvent rows created after `since`,
// oldest-first. Polled every ~2s by the console while it's open.
async function GET(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;
  const valid = sinceDate && !isNaN(sinceDate.getTime());

  // With no `since`, return the most recent messages rather than the whole
  // history. The console calls it this way on load so the panel opens with
  // what Pearl has already said — previously it only ever asked for messages
  // newer than the moment the page opened, so the panel was always empty until
  // something new arrived, and anything said while the console was shut was lost
  // to the owner entirely.
  if (!valid) {
    const recent = await prisma.speechEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(searchParams.get("limit")) || 15, 50),
    });
    // Oldest-first, so the client can append new arrivals the same way in
    // both cases.
    recent.reverse();
    return NextResponse.json(
      recent.map((e) => ({ id: e.id, text: e.text, audioB64: e.audioB64, createdAt: e.createdAt }))
    );
  }

  const events = await prisma.speechEvent.findMany({
    where: { createdAt: { gt: sinceDate } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    events.map((e) => ({ id: e.id, text: e.text, audioB64: e.audioB64, createdAt: e.createdAt }))
  );
}

module.exports = { POST, GET };
