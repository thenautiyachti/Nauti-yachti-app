// Turn a charter's clips into one short vertical video.
//
//   node scripts/charter-montage.js --day 20260906 --name "Oscar RoblesGil R"
//   node scripts/charter-montage.js --day 20260906 --seconds 45 --keep-audio
//   node scripts/charter-montage.js --day 20260906 --dry
//
// WHY. The owner shoots roughly a minute per clip and ends up with fifteen or
// twenty of them per charter — 16 minutes of footage from Oscar's trip on
// 6 September. Turning that into one postable minute is twenty minutes in
// CapCut, every time, which is why it mostly does not happen and why the social
// queue runs on the same glow photographs over and over.
//
// This is not CapCut. It does not beat-match, caption, or pick the good bits —
// it cannot see what is in frame. What it does is the mechanical three
// quarters: choose clips spread across the day, take a slice out of the middle
// of each, normalise them to one size and framerate, and cut them together in
// order. The result is a real montage that reads as the arc of the trip, ready
// to post or to drop into CapCut for music and captions.
//
// THE CLIPS ARE CHOSEN BY THE CLOCK, NOT BY CONTENT. Anyone reviewing the
// output has to actually watch it before it goes anywhere near a guest's
// social feed.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FFMPEG = "C:/Users/immex/tools/ffmpeg/ffmpeg.exe";
const FFPROBE = "C:/Users/immex/tools/ffmpeg/ffprobe.exe";
const INBOX = "C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos/00 Inbox";
const CHARTERS = "C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/Photos/02 Charters/_By charter";

// 9:16, which is what Reels, TikTok and Stories all want. The source is 3:4,
// so filling the frame costs about a quarter of the width off the sides —
// deliberate, because a pillarboxed montage looks like a mistake.
const W = 1080, H = 1920, FPS = 30;

// CRF 23 rather than 20. The first run came out at 132MB for sixty seconds —
// roughly 17 Mbps, far past anything Instagram or TikTok keeps after their own
// re-encode, and too large to even review on a phone. 23 lands around half that
// and survives a pass through CapCut without visible loss.

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes("--" + name);

const DAY = arg("day");
const NAME = arg("name", "");
const TARGET = Number(arg("seconds", 60));
const KEEP_AUDIO = has("keep-audio");
const DRY = has("dry");
const OUT_DIR = arg("out", INBOX);

if (!DAY || !/^\d{8}$/.test(DAY)) {
  console.error("Usage: node scripts/charter-montage.js --day YYYYMMDD [--name \"Guest\"] [--seconds 60] [--keep-audio] [--dry]");
  process.exit(1);
}

function probe(file) {
  const out = execFileSync(FFPROBE, [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json", file,
  ], { encoding: "utf8", maxBuffer: 1 << 24 });
  const j = JSON.parse(out);
  const st = (j.streams && j.streams[0]) || {};
  return { w: st.width, h: st.height, seconds: Number((j.format || {}).duration || 0) };
}

// Look in the charter's own folder first, then the inbox. Footage gets filed
// eventually, and a tool that only reads the inbox stops working the day
// somebody tidies up.
function sourceDir() {
  if (NAME) {
    const y = DAY.slice(0, 4), m = DAY.slice(4, 6), d = DAY.slice(6, 8);
    const folder = path.join(CHARTERS, `${y}-${m}-${d} ${NAME}`);
    if (fs.existsSync(folder)) return folder;
  }
  return INBOX;
}

const dir = sourceDir();
const clips = fs.readdirSync(dir)
  .filter((f) => f.startsWith(DAY) && /\.(mp4|mov|m4v)$/i.test(f))
  .sort()
  .map((f) => {
    const full = path.join(dir, f);
    try { return { file: f, full, ...probe(full) }; } catch { return null; }
  })
  .filter((c) => c && c.seconds > 2);

if (!clips.length) {
  console.error(`No clips for ${DAY} in ${dir}`);
  process.exit(1);
}

// How long each clip gets. Spread the target across everything available, but
// keep the slices between 2 and 4.5 seconds: under two and it is a strobe,
// over five and a minute only holds a dozen moments.
const per = Math.max(2, Math.min(4.5, TARGET / clips.length));
const used = clips.filter((c) => c.seconds >= per + 0.5);
const slice = Math.max(2, Math.min(4.5, TARGET / Math.max(1, used.length)));

console.log(`\n  ${clips.length} clips for ${DAY}${NAME ? " — " + NAME : ""}`);
console.log(`  source: ${dir}`);
console.log(`  using ${used.length}, ${slice.toFixed(1)}s each -> about ${Math.round(used.length * slice)}s\n`);

// Take from a quarter of the way in. The first seconds of a phone clip are
// usually the camera being raised and pointed at nothing.
const rows = used.map((c) => {
  const start = Math.min(c.seconds * 0.25, Math.max(0, c.seconds - slice - 0.2));
  return { ...c, start: Math.round(start * 10) / 10 };
});

for (const r of rows) {
  console.log("    " + r.file.slice(9, 15).replace(/(\d\d)(\d\d)(\d\d)/, "$1:$2") +
    "  " + String(Math.round(r.seconds)).padStart(3) + "s clip  ->  from " +
    String(r.start).padStart(5) + "s  " + r.w + "x" + r.h);
}

const stamp = `${DAY.slice(0, 4)}-${DAY.slice(4, 6)}-${DAY.slice(6, 8)}`;
const outName = `montage-${stamp}${NAME ? "-" + NAME.replace(/[^A-Za-z0-9]+/g, "-") : ""}.mp4`;
const outPath = path.join(OUT_DIR, outName);

if (DRY) {
  console.log(`\n  Dry run. Would write ${outPath}\n`);
  process.exit(0);
}

const work = fs.mkdtempSync(path.join(require("os").tmpdir(), "montage-"));
console.log(`\n  normalising to ${W}x${H} @ ${FPS}fps${KEEP_AUDIO ? " with audio" : ", muted"}…\n`);

const parts = [];
rows.forEach((r, i) => {
  const seg = path.join(work, `seg${String(i).padStart(3, "0")}.mp4`);
  // Scale so the frame is covered, then centre-crop. -2 keeps the dimension
  // even, which h264 requires.
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1`;
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    // Seeking BEFORE -i decodes only what is needed, which is the difference
    // between seconds and minutes across twenty large files.
    "-ss", String(r.start), "-t", String(slice), "-i", r.full,
    "-vf", vf,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
  ];
  if (KEEP_AUDIO) args.push("-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2");
  else args.push("-an");
  args.push(seg);
  execFileSync(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
  parts.push(seg);
  process.stdout.write(`    ${i + 1}/${rows.length}\r`);
});

const listFile = path.join(work, "list.txt");
fs.writeFileSync(listFile, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));

console.log("\n  joining…");
execFileSync(FFMPEG, [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "concat", "-safe", "0", "-i", listFile,
  "-c", "copy", outPath,
], { stdio: ["ignore", "ignore", "pipe"] });

for (const p of parts) { try { fs.unlinkSync(p); } catch {} }
try { fs.unlinkSync(listFile); fs.rmdirSync(work); } catch {}

const final = probe(outPath);
const mb = Math.round(fs.statSync(outPath).size / 1048576);
console.log(`\n  ${outName}`);
console.log(`  ${Math.round(final.seconds)}s · ${final.w}x${final.h} · ${mb}MB`);
console.log(`  ${outPath}\n`);
console.log("  WATCH IT BEFORE IT GOES ANYWHERE. Clips were chosen by the clock,");
console.log("  not by what is in them — nothing here knows who is in shot.\n");
