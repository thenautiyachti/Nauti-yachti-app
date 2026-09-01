const { NextResponse } = require("next/server");
const { prisma } = require("../../../../lib/db");
const { isAdminAuthenticated } = require("../../../../lib/auth-guard");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "wDsJlOXPqcvIUKdLXjDs"; // "Jarvis" preset
const JARVIS_SERVICE_KEY = process.env.JARVIS_SERVICE_KEY;

// POST { text: string } -> synthesizes speech via ElevenLabs and stores the
// resulting audio as a SpeechEvent row for the Jarvis tab to pick up on its
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
  if (!text) {
    return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
  }
  // The text is the point; the voice is a bonus. If synthesis is unavailable
  // for any reason — no API key, an exhausted ElevenLabs quota, an outage —
  // store the message as text so it still reaches the Jarvis tab. Previously
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
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
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
// oldest-first. Polled every ~2s by the Jarvis tab while it's open.
async function GET(req) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;

  const events = await prisma.speechEvent.findMany({
    where: sinceDate && !isNaN(sinceDate.getTime()) ? { createdAt: { gt: sinceDate } } : undefined,
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    events.map((e) => ({ id: e.id, text: e.text, audioB64: e.audioB64, createdAt: e.createdAt }))
  );
}

module.exports = { POST, GET };
