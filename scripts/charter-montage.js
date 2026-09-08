// Turn a charter's clips into one short vertical video.
//
//   node scripts/charter-montage.js --day 20260906 --name "Oscar RoblesGil R"
//   node scripts/charter-montage.js --day 20260906 --seconds 45 --mute
//   node scripts/charter-montage.js --day 20260906 --dry
//
// WHY. The owner shoots roughly a minute per clip and ends up with fifteen or
// twenty of them per charter — 16 minutes of footage from Oscar's trip on
// 6 September. Turning that into one postable minute is twenty minutes in
// CapCut, every time, which is why it mostly does not happen and why the social
// queue runs on the same glow photographs over and over.
//
// This is not CapCut. It does not beat-match or caption. What it does is the
// mechanical three quarters: choose clips spread across the day, take a slice
// out of each, normalise them to one size and framerate, and cut them together
// in order. The result is a real montage that reads as the arc of the trip,
// ready to post or to drop into CapCut for music and captions.
//
// HOW IT PICKS THE SLICE. Two cheap measurements, each useless alone:
//
//   MOTION — frame-to-frame difference — is fooled by the CAMERA. Measured on
//   its own it ranked the dock clip (phone swinging over a cleat while ropes
//   came off) 4th busiest of 21, and a locked-off shot of a wakeboarder
//   actually riding DEAD LAST. It measures the operator's wrist.
//
//   LOUDNESS — ebur128 momentary — is fooled by CONVERSATION. Its top pick was
//   a genuine wipeout reaction, six people laughing at a rider in the water.
//   Its second was four people chatting with a phone out.
//
// They fail in opposite directions, so a window is scored on the WEAKER of the
// two: it has to be loud AND moving. Shake alone and talk alone both die.
//
//              quiet                 loud
//   still      idle scenery          chatting, phones
//   moving     dock, handheld        ACTION
//
// IT STILL CANNOT SEE. It does not know a wipeout from a wave, and "loud and
// moving" is a correlate of action, not a recognition of it. Anyone reviewing
// the output has to actually watch it before it goes near a guest's feed.
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

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
// SOUND IS THE DEFAULT, because the house rule is that a video does not go out
// silent — and a montage that arrives muted is a montage that either never gets
// posted or gets posted silent by mistake.
//
// --music <file> lays a track over the whole thing and DROPS the clip audio,
// which is what the owner's own CapCut cuts do and what he asked for after
// watching one of these: "in most of the clips all you hear is water and
// engine noise". Without it you get the clips' own sound.
const MUSIC = arg("music");
const MUTE = has("mute");
const KEEP_AUDIO = !MUTE;
// Keep a bed of the clips' own sound under the music. Off by default: the
// point of the music is to replace the engine, not to sit on top of it.
const KEEP_BED = has("bed");

if (MUSIC && !fs.existsSync(MUSIC)) {
  console.error(`\n  No music file at ${MUSIC}\n`);
  process.exit(1);
}
const DRY = has("dry");
// Scoring is on by default; --no-score falls back to a fixed offset in every
// clip, which is what this did before it could listen.
const SCORE = !has("no-score");
// Where it lands. Default is a "compilation video" folder inside the charter's
// own folder, so the finished cut sits with the footage it came from instead of
// loose in the inbox where the next filing run has to decide what it is.
// Falls back to the inbox only when there is no charter folder to put it in.
const OUT_OVERRIDE = arg("out");
// Quality. Lower is better and bigger; 23 is the default, 19-20 is a keeper
// you would hand to CapCut, 26+ is a review copy. This was passed on the
// command line before it existed and silently ignored, which is the worst way
// for a flag to behave — a run that looks like it honoured you and did not.
const CRF = String(Math.max(14, Math.min(32, Number(arg("crf", 23)) || 23)));

if (!DAY || !/^\d{8}$/.test(DAY)) {
  console.error("Usage: node scripts/charter-montage.js --day YYYYMMDD [--name \"Guest\"] [--seconds 45] [--crf 20] [--mute] [--no-score] [--dry]");
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

// Both measurements come back through ffmpeg's metadata=print, which writes at
// INFO level on STDERR. Do NOT add -loglevel error to these two calls: it
// throws away the only output that matters and every clip silently reports
// "no data", which reads like a broken filter rather than a muzzled one.
// spawnSync rather than execFileSync because we need stderr on success.
function motionTrack(file) {
  const vf = "scale=120:-2,fps=2,tblend=all_mode=difference,signalstats," +
    "metadata=print:key=lavfi.signalstats.YAVG";
  // -an: decoding the audio here is most of the cost and none of the answer.
  const r = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-an",
    "-i", file, "-vf", vf, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
  return pairs(r.stderr, /YAVG=([\d.]+)/);
}

function loudnessTrack(file) {
  // ebur128 MOMENTARY (400ms window, emitted every 100ms). Not astats: its
  // Overall.RMS_level is a running accumulator that produced the same smooth
  // upward ramp for all 21 clips and put a peak "2238 seconds into" a
  // 60-second clip.
  const r = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-vn",
    "-i", file, "-af", "ebur128=peak=none:metadata=1,ametadata=print:key=lavfi.r128.M",
    "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
  // -120 and -163 are below-the-gate sentinels emitted while the window is
  // still filling. They are not measurements of silence.
  return pairs(r.stderr, /lavfi\.r128\.M=(-?[\d.]+)/, (v) => v > -70);
}

// metadata=print emits a "pts_time:" line and then the value line, so read
// them as pairs rather than assuming a fixed sample rate.
function pairs(stderr, valueRe, keep) {
  const out = [];
  let t = null;
  for (const line of String(stderr || "").split(/\r?\n/)) {
    const mt = line.match(/pts_time:([\d.]+)/);
    if (mt) { t = Number(mt[1]); continue; }
    const mv = line.match(valueRe);
    if (mv && t != null) {
      const v = Number(mv[1]);
      if (Number.isFinite(v) && (!keep || keep(v))) out.push({ t, v });
      t = null;
    }
  }
  return out;
}

// Measuring is minutes of decode. Cache beside the footage so a re-run at a
// different length is instant, and so a second montage of the same charter
// costs nothing.
function measureAll(list, dir) {
  const cachePath = path.join(dir, ".montage-scores.json");
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, "utf8")); } catch {}
  let fresh = 0;
  for (const c of list) {
    if (cache[c.file]) continue;
    process.stdout.write(`    measuring ${c.file.slice(9, 15)} …\r`);
    cache[c.file] = { motion: motionTrack(c.full), loud: loudnessTrack(c.full) };
    fresh++;
  }
  if (fresh) { try { fs.writeFileSync(cachePath, JSON.stringify(cache)); } catch {} }
  return cache;
}

// AT THE DOCK THE ENGINE IS OFF, AND THAT IS AUDIBLE. Underway there is a
// constant floor around -20 LUFS; tied up there is not. On Oscar's charter the
// nineteen on-water clips ran -16.9 to -21.1 and the two dock clips -27.4 and
// -39.3 — a six-decibel gap with nothing in it. The threshold sits in that gap.
// This is what drops the opening rope-untying footage, and it does it by
// listening rather than by trusting that the dock is always the first clip.
const DOCK_LUFS = -24;

// Percentile spread rather than min/max, so one bright frame or one gate
// sentinel does not set the scale for the whole charter.
function spread(vals) {
  const s = [...vals].sort((a, b) => a - b);
  if (!s.length) return { lo: 0, hi: 1 };
  return { lo: s[Math.floor(s.length * 0.05)], hi: s[Math.floor(s.length * 0.95)] };
}
const norm = (v, s) => Math.max(0, Math.min(1, (v - s.lo) / Math.max(1e-6, s.hi - s.lo)));

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

console.log(`\n  ${clips.length} clips for ${DAY}${NAME ? " — " + NAME : ""}`);
console.log(`  source: ${dir}\n`);

let pool = clips;
let scores = null;

if (SCORE) {
  console.log("  listening and watching…");
  scores = measureAll(clips, dir);
  const dropped = [];
  pool = clips.filter((c) => {
    const lv = ((scores[c.file] || {}).loud || []).map((x) => x.v);
    if (!lv.length) return true; // no audio to judge by — keep it, say so later
    const mean = lv.reduce((a, b) => a + b, 0) / lv.length;
    c.meanLoud = mean;
    if (mean < DOCK_LUFS) { dropped.push(c); return false; }
    return true;
  });
  for (const c of dropped) {
    console.log("    " + c.file.slice(9, 15).replace(/(\d\d)(\d\d)(\d\d)/, "$1:$2") +
      "  dropped — engine off, " + c.meanLoud.toFixed(1) + " LUFS (tied up)");
  }
  if (!pool.length) {
    console.error("\n  Every clip reads as dockside. Re-run with --no-score.\n");
    process.exit(1);
  }
}

// How long each clip gets. Spread the target across everything available, but
// keep the slices between 2 and 4.5 seconds: under two and it is a strobe,
// over five and a minute only holds a dozen moments.
const per = Math.max(2, Math.min(4.5, TARGET / pool.length));
const used = pool.filter((c) => c.seconds >= per + 0.5);
const slice = Math.max(2, Math.min(4.5, TARGET / Math.max(1, used.length)));

console.log(`  using ${used.length}, ${slice.toFixed(1)}s each -> about ${Math.round(used.length * slice)}s\n`);

// Normalise across the whole DAY, not within each clip. Scoring windows inside
// a clip would still hand us the best three seconds of a clip with nothing in
// it — the point is to compare moments against the trip, not against
// themselves.
let mScale = null, lScale = null;
if (SCORE) {
  mScale = spread(used.flatMap((c) => (scores[c.file].motion || []).map((x) => x.v)));
  lScale = spread(used.flatMap((c) => (scores[c.file].loud || []).map((x) => x.v)));
}

// Pick the best window in each clip, or fall back to a quarter of the way in —
// the first seconds of a phone clip are usually the camera being raised and
// pointed at nothing.
const rows = used.map((c) => {
  const fallback = Math.min(c.seconds * 0.25, Math.max(0, c.seconds - slice - 0.2));
  if (!SCORE) return { ...c, start: Math.round(fallback * 10) / 10, why: "" };

  const mt = scores[c.file].motion || [], lt = scores[c.file].loud || [];
  let best = null;
  for (let s = 0; s + slice <= c.seconds; s += 0.5) {
    const e = s + slice;
    const mv = mt.filter((x) => x.t >= s && x.t < e).map((x) => x.v);
    const lv = lt.filter((x) => x.t >= s && x.t < e).map((x) => x.v);
    if (!mv.length || !lv.length) continue;
    // Mean motion, because sustained movement beats one jolt; peak loudness,
    // because the shout is an instant and averaging it away is the whole
    // problem.
    const m = norm(mv.reduce((a, b) => a + b, 0) / mv.length, mScale);
    const l = norm(Math.max(...lv), lScale);
    const score = Math.min(m, l);
    if (!best || score > best.score) best = { start: s, m, l, score };
  }
  // Bring each clip toward a common level, but never shout at a quiet one.
  // -18 LUFS is roughly where these clips already sit; the cap is what stops
  // an empty clip's engine hum being dragged up to match a noisy one.
  const lv = lt.map((x) => x.v);
  const mean = lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : null;
  const gainDb = mean == null ? 0 : Math.max(-12, Math.min(3, -18 - mean));

  if (!best) return { ...c, start: Math.round(fallback * 10) / 10, why: "unscored", gainDb };
  return {
    ...c,
    start: Math.round(best.start * 10) / 10,
    gainDb,
    why: `motion ${best.m.toFixed(2)} loud ${best.l.toFixed(2)}`,
  };
});

for (const r of rows) {
  console.log("    " + r.file.slice(9, 15).replace(/(\d\d)(\d\d)(\d\d)/, "$1:$2") +
    "  " + String(Math.round(r.seconds)).padStart(3) + "s clip  ->  from " +
    String(r.start).padStart(5) + "s  " + r.w + "x" + r.h +
    (r.why ? "   " + r.why : ""));
}

const stamp = `${DAY.slice(0, 4)}-${DAY.slice(4, 6)}-${DAY.slice(6, 8)}`;
const outName = `montage-${stamp}${NAME ? "-" + NAME.replace(/[^A-Za-z0-9]+/g, "-") : ""}.mp4`;
// dir is the charter's own folder when one was found, and the inbox otherwise.
const OUT_DIR = OUT_OVERRIDE || (dir === INBOX ? INBOX : path.join(dir, "compilation video"));
const outPath = path.join(OUT_DIR, outName);

if (DRY) {
  console.log(`\n  Dry run. Would write ${outPath}\n`);
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

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
    "-c:v", "libx264", "-preset", "veryfast", "-crf", CRF, "-pix_fmt", "yuv420p",
  ];
  if (KEEP_AUDIO) {
    // Two problems with raw clip audio cut every three seconds: the joins pop,
    // and the levels jump between a clip shot beside the engine and one shot
    // at the back of the boat. A short fade at each end kills the pop.
    //
    // LEVELLING USED TO BE dynaudnorm AND THAT WAS A REAL MISTAKE. Measured
    // across Oscar's 21 clips it raised every one of them: +5 to +8 dB on the
    // on-water clips, +10.5 on the dock clip, +18.1 on the near-silent one.
    // On a clip whose only sound IS the engine, dynaudnorm finds nothing else
    // to normalise and boosts the engine. That is exactly what the owner heard
    // and it was this filter, not the footage.
    //
    // Instead: one static gain per clip, computed from the loudness already
    // measured for slice-picking, and CAPPED at +3 dB. A clip that is quiet
    // because nothing is happening in it stays quiet.
    const af = [`afade=t=in:st=0:d=0.12`,
      `afade=t=out:st=${Math.max(0, slice - 0.12).toFixed(2)}:d=0.12`];
    if (r.gainDb) af.unshift(`volume=${r.gainDb.toFixed(1)}dB`);
    args.push("-af", af.join(","), "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2");
  } else {
    args.push("-an");
  }
  args.push(seg);
  execFileSync(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
  parts.push(seg);
  process.stdout.write(`    ${i + 1}/${rows.length}\r`);
});

const listFile = path.join(work, "list.txt");
fs.writeFileSync(listFile, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));

console.log("\n  joining…");
const joined = MUSIC ? path.join(work, "joined.mp4") : outPath;
execFileSync(FFMPEG, [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "concat", "-safe", "0", "-i", listFile,
  "-c", "copy", joined,
], { stdio: ["ignore", "ignore", "pipe"] });

if (MUSIC) {
  console.log("  laying the music over it…");
  const total = probe(joined).seconds;
  const fadeOut = Math.max(0, total - 1.5);
  // -stream_loop -1 so a track shorter than the montage repeats rather than
  // ending in silence; -shortest then trims it back to the video's length.
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", joined,
    "-stream_loop", "-1", "-i", MUSIC,
  ];
  // loudnorm to -14 LUFS: what Instagram, TikTok and YouTube all normalise to,
  // so the track arrives at the level the platform was going to force anyway
  // rather than being pushed around on upload.
  const music = `[1:a]loudnorm=I=-14:TP=-1.5,afade=t=in:st=0:d=1.0,afade=t=out:st=${fadeOut.toFixed(2)}:d=1.5[m]`;
  if (KEEP_BED) {
    // The clips' own sound kept well underneath — a shout still reads, the
    // engine does not.
    args.push("-filter_complex", `${music};[0:a]volume=-16dB[b];[m][b]amix=inputs=2:duration=first:dropout_transition=0[a]`);
  } else {
    args.push("-filter_complex", music.replace("[m]", "[a]"));
  }
  args.push("-map", "0:v", "-map", "[a]", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-shortest", outPath);
  execFileSync(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
  try { fs.unlinkSync(joined); } catch {}
}

for (const p of parts) { try { fs.unlinkSync(p); } catch {} }
try { fs.unlinkSync(listFile); fs.rmdirSync(work); } catch {}

const final = probe(outPath);
const mb = Math.round(fs.statSync(outPath).size / 1048576);
console.log(`\n  ${outName}`);
console.log(`  ${Math.round(final.seconds)}s · ${final.w}x${final.h} · ${mb}MB`);
console.log(`  ${outPath}\n`);
console.log("  WATCH IT BEFORE IT GOES ANYWHERE. Slices were chosen because they are");
console.log("  loud and moving, which is a correlate of action, not a recognition of");
console.log("  it — nothing here knows a wipeout from a wave, or who is in shot.\n");
