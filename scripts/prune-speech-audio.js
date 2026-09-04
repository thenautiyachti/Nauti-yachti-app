// Drops the stored MP3 from old SpeechEvent rows, keeping the text.
//
//   node scripts/prune-speech-audio.js            what it would do
//   ALLOW_PROD_WRITES=1 node scripts/prune-speech-audio.js --confirm
//
// WHY. The speak route stores the synthesized audio as base64 in the row. In one
// week that reached 128.8 MB across 172 rows -- roughly a quarter of Supabase's
// 500MB free-tier ceiling, made entirely of lines already spoken and heard, and
// growing every time an agent talks.
//
// WHAT IS KEPT. The text of every message, always. That is the transcript, it is
// what the console displays when it opens, and it is tiny. Only `audioB64` is
// cleared, and only on rows past the window -- recent ones are still worth
// playing. Nothing is deleted: no row goes away, so nothing that references one
// breaks, and the record of what was said stays complete.
//
// The audio is regenerable in any case; it is one API call to say a line again.
const fs = require("fs");
const path = require("path");
const APP = path.join(__dirname, "..");
for (const line of fs.readFileSync("C:/Users/immex/.secrets/nauti-yachti.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { prisma } = require(APP + "/lib/db.js");

const KEEP_DAYS = Number(process.env.SPEECH_AUDIO_KEEP_DAYS || 3);
const CONFIRM = process.argv.includes("--confirm");

(async () => {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000);
  const stale = await prisma.speechEvent.findMany({
    where: { createdAt: { lt: cutoff }, NOT: { audioB64: null } },
    select: { id: true, createdAt: true, text: true, audioB64: true },
  });
  const bytes = stale.reduce((n, r) => n + (r.audioB64 || "").length, 0);

  const kept = await prisma.speechEvent.count({ where: { createdAt: { gte: cutoff }, NOT: { audioB64: null } } });
  const total = await prisma.speechEvent.count();

  console.log(`  keeping audio on the last ${KEEP_DAYS} days: ${kept} rows`);
  console.log(`  clearing audio on older rows           : ${stale.length} rows`);
  console.log(`  freed                                  : ${(bytes / 1048576).toFixed(1)} MB`);
  console.log(`  rows deleted                           : 0 of ${total} (text is kept on every one)`);

  if (!stale.length) { await prisma.$disconnect(); return; }
  if (!CONFIRM) {
    console.log("\n  dry run. Re-run with ALLOW_PROD_WRITES=1 and --confirm to apply.");
    console.log("  oldest affected: " + String(stale[0].createdAt).slice(0, 24));
    await prisma.$disconnect();
    return;
  }

  const res = await prisma.speechEvent.updateMany({
    where: { createdAt: { lt: cutoff }, NOT: { audioB64: null } },
    data: { audioB64: null },
  });
  console.log(`\n  cleared ${res.count} rows.`);

  const left = await prisma.speechEvent.findMany({ where: { NOT: { audioB64: null } }, select: { audioB64: true } });
  const leftBytes = left.reduce((n, r) => n + (r.audioB64 || "").length, 0);
  // text is non-nullable in the schema, so a null test on it is not a valid
  // filter -- it threw here after the write had already succeeded, which read
  // like a failed prune when the prune was fine. Count blank text instead.
  const blank = (await prisma.speechEvent.findMany({ select: { text: true } })).filter((r) => !r.text.trim()).length;
  console.log(`  audio remaining: ${(leftBytes / 1048576).toFixed(1)} MB across ${left.length} rows`);
  console.log(`  transcripts intact: ${total - blank} of ${total}`);
  await prisma.$disconnect();
})().catch((e) => { console.error("FAILED: " + e.message); process.exit(1); });
