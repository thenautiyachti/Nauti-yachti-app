// Find the good moments in a long Roblox recording and cut them into Shorts.
//
//   node scripts/roblox-shorts.js --in "C:/Videos/roblox-session.mp4"
//   node scripts/roblox-shorts.js --in ... --count 5 --seconds 25
//   node scripts/roblox-shorts.js --in ... --at 12:30 --at 41:05
//   node scripts/roblox-shorts.js --in ... --layout blur
//   node scripts/roblox-shorts.js --in ... --dry
//
// WHY THIS IS NOT charter-montage.js. Both hunt for the interesting seconds in
// footage nobody wants to scrub through, and the scoring here is descended from
// that file. Three things are genuinely different:
//
//   ONE FILE IN, MANY FILES OUT. A charter is twenty one-minute clips cut down
//   to one montage. A Roblox session is ONE ninety-minute recording that should
//   come out as three or four separate Shorts, each able to stand alone. So the
//   windows have to be picked non-overlapping across a single timeline rather
//   than one-per-file, and nothing is joined together at the end.
//
//   THE SOURCE IS LANDSCAPE. Tablet Roblox is played in landscape, so the
//   recording is 16:9 and a Short is 9:16. That is not a trim, it is a reframe:
//   a 9:16 window out of 1920x1080 is 607 pixels, THIRTY-ONE PERCENT of the
//   width. Two thirds of the picture is thrown away and which two thirds is the
//   single biggest quality decision in this file. See cropX().
//
//   THERE IS NO CAMERAMAN. The whole reason the charter scoring needs two
//   signals scored on the weaker of the two is that motion on that footage
//   measures the owner's wrist, not the boat. A screen recording has no wrist:
//   motion here is the game actually moving. That makes motion a much better
//   signal than it is on charter footage — but see THE JOYSTICK PROBLEM, which
//   is the new way it lies.
//
// WHAT IT DOES NOT DO. It does not know a win from a death, it cannot read the
// screen, and it has no idea what game is being played. It finds seconds that
// are loud and busy, which is a correlate of something happening and not a
// recognition of it. Watch them before they go anywhere.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");
const { videoArgs, describe } = require("./videoEncoder");

// WHERE FFMPEG IS, and unlike the other scripts in here this one cannot just
// hardcode it. Those run unattended on the owner's box; this one gets run by
// hand, possibly on a different machine, by somebody who did not install
// ffmpeg themselves. So: an explicit flag wins, then the env var, then the
// path the rest of this repo uses, then whatever is on PATH.
function findTool(name, flagValue) {
  const candidates = [
    flagValue,
    process.env[name.toUpperCase()],
    `C:/Users/immex/tools/ffmpeg/${name}.exe`,
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  // Not a path we can stat — let exec resolve it on PATH and fail loudly if
  // it is not there. Better than guessing a path that does not exist and
  // reporting "no such file" about the recording instead of about ffmpeg.
  return name;
}

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}
// Flags that may be given more than once: --at 2:10 --at 14:55
function args(name) {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a === "--" + name && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) out.push(process.argv[i + 1]);
  });
  return out;
}
const has = (name) => process.argv.includes("--" + name);

const FFMPEG = findTool("ffmpeg", arg("ffmpeg"));
const FFPROBE = findTool("ffprobe", arg("ffprobe"));

const IN = arg("in");
const COUNT = Math.max(1, Math.min(12, Number(arg("count", 3)) || 3));
// THIRTY SECONDS, not sixty. YouTube will take three minutes as a Short, but
// the thing being optimised is the share of viewers who reach the end, and a
// clip that runs past its own moment is the ordinary way that number falls. A
// death, a win or a good scream is over in ten seconds; the rest is padding.
const TARGET = Math.max(8, Math.min(180, Number(arg("seconds", 30)) || 30));
const LAYOUT = (arg("layout", "crop") || "crop").toLowerCase();
const DRY = has("dry");
const CRF = String(Math.max(14, Math.min(32, Number(arg("crf", 21)) || 21)));
const OUT_OVERRIDE = arg("out");
const MUTE = has("mute");
const KEEP_AUDIO = !MUTE;

// 1080x1920. Shorts, Reels and TikTok all want this and all re-encode it
// anyway, so there is nothing to gain by going above it.
const W = 1080, H = 1920, FPS = 30;

if (!IN) {
  console.error(`
  Usage: node scripts/roblox-shorts.js --in <recording.mp4> [options]

    --in <file>        the screen recording (required)
    --count 3          how many Shorts to cut
    --seconds 30       how long each one is
    --at 12:30         cut here, whatever the scoring thinks (repeatable)
    --layout crop|blur crop fills the frame; blur keeps the whole picture
    --mute             drop the audio
    --dry              measure and report, write nothing
    --out <folder>     where they land (default: a "shorts" folder alongside)
`);
  process.exit(1);
}
if (!fs.existsSync(IN)) {
  console.error(`\n  No recording at ${IN}\n`);
  process.exit(1);
}
if (!["crop", "blur"].includes(LAYOUT)) {
  console.error(`\n  --layout must be "crop" or "blur", not "${LAYOUT}"\n`);
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

function hasAudio(file) {
  try {
    const out = execFileSync(FFPROBE, ["-v", "error", "-select_streams", "a:0",
      "-show_entries", "stream=codec_type", "-of", "csv=p=0", file], { encoding: "utf8" });
    return /audio/.test(out);
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// MEASURING THE PICTURE
//
// THE JOYSTICK PROBLEM, which is this file's equivalent of the wakeboard tower
// and cost more to find than anything else here.
//
// Tablet Roblox draws its controls ON the recording: a thumbstick bottom-left
// that is under a moving thumb for the entire session, a jump button
// bottom-right that pulses, and a chat feed top-left that scrolls. All three are
// high-contrast overlays composited every frame, and all three move when
// NOTHING IN THE GAME IS HAPPENING. Measured on a lobby stretch where the
// character stood still, the bottom fifth of the frame carried more
// frame-to-frame difference than the top four fifths combined.
//
// Left in, that wrecks both jobs at once: idle menus score as action, and the
// horizontal profile hands every crop to the bottom-left corner where the thumb
// is. So the bottom BAND is excluded from both measurements. Not the whole
// bottom — the floor a character runs across lives there too — but the strip
// the controls occupy.
const CONTROL_BAND = 0.22;

// Downscaled frame size for measurement. Small on purpose: this is measuring
// where change is, not what it looks like, and 160 columns is finer than the
// crop decision can use.
const M_W = 160, M_FPS = 4;

// READ IT IN CHUNKS, always, however short the file is.
//
// A raw gray plane at this size is ~14KB a frame. That is nothing until the
// input is a ninety-minute session, at which point one spawnSync is 300MB of
// stdout buffered in Node and the run dies with ENOBUFS — on the long
// recordings this tool exists for and never on the short one it was tested
// with. Ten-minute chunks keep it near 35MB whatever the length, and give
// somewhere honest to print progress.
const CHUNK = 600;

function actionTrack(file, duration, mH) {
  const rows = [];
  const bandTop = Math.floor(mH * (1 - CONTROL_BAND));
  const frameBytes = M_W * mH;

  for (let base = 0; base < duration; base += CHUNK) {
    const len = Math.min(CHUNK, duration - base);
    process.stdout.write(`    measuring picture  ${Math.round((base / duration) * 100)}%\r`);
    // -an: the audio is measured separately and decoding it here is most of
    // the cost and none of the answer.
    const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-nostats", "-an",
      "-ss", String(base), "-t", String(len), "-i", file,
      "-vf", `fps=${M_FPS},scale=${M_W}:${mH},format=gray`,
      "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 });
    const buf = r.stdout;
    if (!buf || buf.length < frameBytes * 2) continue;

    const n = Math.floor(buf.length / frameBytes);
    for (let f = 1; f < n; f++) {
      const cur = buf.subarray(f * frameBytes, (f + 1) * frameBytes);
      const prev = buf.subarray((f - 1) * frameBytes, f * frameBytes);
      // Per-column difference, summed down the rows ABOVE the control band.
      // Keeping the columns is what makes the reframe possible later; the
      // total alone would only answer "was anything happening".
      const cols = new Float64Array(M_W);
      let total = 0;
      for (let y = 0; y < bandTop; y++) {
        const row = y * M_W;
        for (let x = 0; x < M_W; x++) {
          const d = Math.abs(cur[row + x] - prev[row + x]);
          cols[x] += d;
          total += d;
        }
      }
      const px = Math.max(1, bandTop * M_W);
      rows.push({ t: base + f / M_FPS, v: total / px, cols });
    }
  }
  process.stdout.write("                                   \r");
  return rows;
}

// ---------------------------------------------------------------------------
// MEASURING THE SOUND
//
// Both of these are lifted from charter-montage.js, which explains at length
// why it is ebur128 MOMENTARY and not astats, and why the metadata lines must
// be read in pairs rather than assumed to arrive at a fixed rate. The gate
// sentinels below -70 are not measurements of silence.
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

// Do NOT add -loglevel error here: metadata=print writes at INFO on stderr and
// silencing it reports "no data" for every window, which reads like a broken
// filter rather than a muzzled one.
function loudnessTrack(file) {
  process.stdout.write("    measuring sound   \r");
  const r = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-vn",
    "-i", file, "-af", "ebur128=peak=none:metadata=1,ametadata=print:key=lavfi.r128.M",
    "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
  process.stdout.write("                      \r");
  return pairs(r.stderr, /lavfi\.r128\.M=(-?[\d.]+)/, (v) => v > -70);
}

// IS SOMEBODY TALKING, or is that the game?
//
// Same 300-3000Hz band-pass test as the charter script, and it earns its place
// here for a better reason than it does there. On a charter the competition is
// an engine, which is rumble underneath the speech band. Here the competition
// is GAME AUDIO — music, footsteps, UI clicks, an obby's background loop —
// which is broadband and sits in that band too, so the test is less clean.
//
// What it still separates well is a REACTION from ambience: two boys shouting
// over each other is almost entirely in-band, and a game music loop is not.
// That is the distinction that matters, because the reaction is the Short.
//
// SAMPLED AROUND THE PEAK, NOT THE OPENING. The charter script measures the
// first few seconds of a window because its windows are three seconds long and
// that IS the window. These are thirty, and measuring the opening eight seconds
// found nothing on the test footage where the shout landed at second nine: it
// reported the same figure for a window containing a scream and one containing
// room tone. Eight seconds centred on where the loudness actually peaked is the
// same two decodes and answers the question that was asked.
function voiceGap(file, from, to) {
  const grab = (band) => {
    const af = (band ? "highpass=f=300,lowpass=f=3000," : "") +
      "ebur128=peak=none:metadata=1,ametadata=print:key=lavfi.r128.M";
    const r = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-vn",
      "-ss", String(from), "-t", String(Math.max(1, to - from)), "-i", file,
      "-af", af, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
    const vals = [...String(r.stderr || "").matchAll(/lavfi\.r128\.M=(-?[\d.]+)/g)]
      .map((m) => Number(m[1])).filter((v) => v > -70);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const full = grab(false), band = grab(true);
  return full == null || band == null ? null : band - full;
}

// Percentile spread, so one loading-screen flash does not set the scale for a
// ninety-minute session.
function spread(vals) {
  const s = [...vals].sort((a, b) => a - b);
  if (!s.length) return { lo: 0, hi: 1 };
  return { lo: s[Math.floor(s.length * 0.05)], hi: s[Math.floor(s.length * 0.95)] };
}
const norm = (v, s) => Math.max(0, Math.min(1, (v - s.lo) / Math.max(1e-6, s.hi - s.lo)));

// ---------------------------------------------------------------------------
// THE REFRAME
//
// A 9:16 window out of a 16:9 frame is 31.6% of the width. Three ways to choose
// where it sits, in increasing order of how good they are and how much they
// cost:
//
//   CENTRE, always. Free, and wrong often enough to matter — Roblox parks the
//   character near the middle but the thing being reacted to is frequently not.
//
//   FOLLOW THE ACTION, frame by frame. What a person editing would do, and it
//   cannot be done here: a crop that moves every frame needs the x as an
//   ffmpeg expression, and a crop driven by a noisy per-frame measurement
//   SWIMS. A drifting frame looks like a mistake in a way that an imperfect
//   static one does not.
//
//   ONE CROP PER SHORT, from the whole window's accumulated column profile.
//   What this does. Thirty seconds of a game is usually one place; the
//   character moves inside the frame more than the interesting part of the
//   frame moves.
//
// PULLED TOWARD THE CENTRE, deliberately. The profile is a difference measure,
// so a bright UI element that flickers twice can out-argue a character running,
// and the failure mode is a Short framed on the edge of the screen with the
// game happening off to one side. The centre bias costs a little accuracy on
// genuinely off-centre action and removes that failure entirely.
// 0.25 rather than the 0.35 this started at. The number trades two failures off
// against each other and the balance moved once the control band was excluded:
// most of what used to drag a crop to the edge was the thumbstick, and that is
// no longer in the measurement. Measured on the test recording, 0.35 clipped the
// right-hand edge off action that 0.25 holds fully in frame.
const CENTRE_PULL = 0.25;

// How much of the window's total movement a crop actually contains. Returned
// alongside the position because no single fixed crop is right for every
// thirty seconds of a game, and the useful thing is not to pretend otherwise —
// it is to SAY SO, so the clip that needs --layout blur can be spotted without
// watching all of them.
function cropX(rows, srcW, cropW) {
  const cols = new Float64Array(M_W);
  for (const r of rows) for (let x = 0; x < M_W; x++) cols[x] += r.cols[x];

  const winCols = Math.max(1, Math.round(M_W * (cropW / srcW)));
  if (winCols >= M_W) return Math.max(0, Math.round((srcW - cropW) / 2));

  const peak = Math.max(1e-9, ...cols);
  const mid = (M_W - winCols) / 2;
  let best = null;
  for (let s = 0; s + winCols <= M_W; s++) {
    let sum = 0;
    for (let x = s; x < s + winCols; x++) sum += cols[x];
    // Scored against the best possible, then penalised for how far from centre
    // it sits, so the two terms are on the same 0-1 scale.
    const action = sum / (peak * winCols);
    const offCentre = Math.abs(s - mid) / Math.max(1, mid);
    const score = action - CENTRE_PULL * offCentre;
    if (!best || score > best.score) best = { s, score };
  }
  let inside = 0, all = 0;
  for (let x = 0; x < M_W; x++) { all += cols[x]; if (x >= best.s && x < best.s + winCols) inside += cols[x]; }

  const x = Math.round((best.s / M_W) * srcW);
  return {
    // Even, and inside the frame. h264 requires even dimensions and ffmpeg
    // refuses an out-of-range crop rather than clamping it.
    x: Math.max(0, Math.min(srcW - cropW, x - (x % 2))),
    kept: all > 0 ? inside / all : 1,
  };
}

// ---------------------------------------------------------------------------
const src = probe(IN);
if (!src.seconds || !src.w || !src.h) {
  console.error(`\n  Could not read ${IN} — is it a video?\n`);
  process.exit(1);
}
const AUDIO = KEEP_AUDIO && hasAudio(IN);
if (KEEP_AUDIO && !AUDIO) {
  console.log("\n  NO AUDIO TRACK in this recording.");
  console.log("  On an iPad the screen recorder captures the mic only if you long-press");
  console.log("  the record button and switch the microphone ON. Without it there is no");
  console.log("  reaction to find and no commentary to post, so the scoring below is");
  console.log("  running on the picture alone and is much weaker for it.\n");
}

const mH = Math.max(2, Math.round((M_W * src.h) / src.w / 2) * 2);

console.log(`\n  ${path.basename(IN)}`);
console.log(`  ${Math.floor(src.seconds / 60)}m${String(Math.round(src.seconds % 60)).padStart(2, "0")}s · ${src.w}x${src.h} · encoding on ${describe(FFMPEG)}\n`);

// Cache beside the recording. Measuring a long session is minutes of decode and
// the second run — a different count, a different length, a different layout —
// should be instant.
const cacheDir = path.dirname(IN);
const cachePath = path.join(cacheDir, "." + path.basename(IN) + ".shorts-scores-v1.json");
let track = null, loud = null;
try {
  const c = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  if (c && c.mH === mH && Array.isArray(c.track)) {
    track = c.track.map((r) => ({ t: r.t, v: r.v, cols: Float64Array.from(r.cols) }));
    loud = c.loud;
    console.log("  (reusing the measurements from last time)\n");
  }
} catch {}

if (!track) {
  track = actionTrack(IN, src.seconds, mH);
  loud = AUDIO ? loudnessTrack(IN) : [];
  try {
    fs.writeFileSync(cachePath, JSON.stringify({
      mH, loud,
      // Rounded to keep the cache from being larger than the recording.
      track: track.map((r) => ({ t: r.t, v: Math.round(r.v * 1000) / 1000, cols: Array.from(r.cols).map((v) => Math.round(v)) })),
    }));
  } catch {}
}

if (!track.length) {
  console.error("  Measured nothing. Is the file playable?\n");
  process.exit(1);
}

const mScale = spread(track.map((r) => r.v));
const lScale = loud.length ? spread(loud.map((r) => r.v)) : null;

// MENUS, LOADING AND AFK. A sustained stretch of near-zero motion above the
// control band is the Roblox home screen, a game's loading screen, or the
// tablet sitting on a sofa. These are not low-scoring moments to be ranked
// below better ones — they are not moments, and leaving them in the pool means
// a quiet session produces three Shorts of a menu. Anything under a tenth of
// this session's own normalised motion is struck out before ranking.
const DEAD = 0.10;

// The first and last stretch go too: a screen recording opens on the tablet's
// home screen and closes on somebody reaching for the stop button.
const EDGE = Math.min(8, src.seconds * 0.02);

const STEP = 1.0;
const windows = [];
for (let s = EDGE; s + TARGET <= src.seconds - EDGE; s += STEP) {
  const e = s + TARGET;
  const mv = track.filter((r) => r.t >= s && r.t < e);
  if (!mv.length) continue;
  const m = norm(mv.reduce((a, r) => a + r.v, 0) / mv.length, mScale);
  if (m < DEAD) continue;

  let score = m, l = null;
  if (lScale) {
    const lv = loud.filter((r) => r.t >= s && r.t < e).map((r) => r.v);
    if (lv.length) {
      // Peak loudness, not mean: the shout is an instant and averaging it over
      // thirty seconds is exactly how it gets lost.
      l = norm(Math.max(...lv), lScale);
      // THE WEAKER OF THE TWO, same as the charter script and for the same
      // reason — the two signals fail in opposite directions. Busy and silent
      // is grinding; loud and still is a lobby chat. A Short needs both.
      //
      // WITH A TIEBREAK, which the charter script does not need and this does.
      // There it scores one window per clip, twenty times. Here it ranks every
      // second of a ninety-minute session against every other, and a bare
      // min() sends a LOT of them to exactly 0.00 — anything at or below the
      // 5th percentile of either signal normalises to zero, so a quiet session
      // produces hundreds of tied windows and the "best" one is then whichever
      // order sort happened to leave them in. Seen on the test footage: a
      // near-static stretch selected over better material on a coin flip.
      //
      // 85/15 against the mean keeps "it must be BOTH loud and busy" as the
      // decision and lets the average separate the ties underneath it.
      score = 0.85 * Math.min(m, l) + 0.15 * ((m + l) / 2);
    }
  }
  windows.push({ start: s, m, l, score });
}

if (!windows.length) {
  console.error(`
  Nothing in this recording scored above the floor for ${TARGET}s windows.

  Usually one of three things: the recording is almost all menu, it is shorter
  than ${TARGET}s of usable footage, or the tablet recorded with the mic off and
  the picture alone is too flat to separate. Try --seconds 15, or --at <time>
  to cut a moment yourself.
`);
  process.exit(1);
}

// NON-OVERLAPPING, and this is the whole difference between a tool that gives
// you three Shorts and one that gives you the same moment three times.
//
// Take the best window, then strike out everything within a full clip length of
// it on both sides before taking the next. Greedy rather than optimal: the best
// set of three windows by total score is a harder problem and the answer is not
// better, because two adjacent near-identical moments are worth less to a
// channel than two separated ones even when they score the same.
const GAP = TARGET;
const chosen = [];
const forced = args("at").map((s) => {
  const p = String(s).split(":").map(Number);
  if (p.some((x) => !Number.isFinite(x))) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
}).filter((v) => v != null);

// HIS OWN PICKS OUTRANK EVERY SCORE IN THIS FILE, for the same reason the
// charter script honours picks.txt: every signal here is a proxy for "something
// happened", and the person who was playing knows.
for (const at of forced) {
  if (at < 0 || at >= src.seconds - 1) {
    console.log(`    !  --at ${at}s is outside a ${Math.round(src.seconds)}s recording — skipped`);
    continue;
  }
  // Centre the clip on the moment he named rather than starting there: people
  // remember when a thing HAPPENED, not when the run-up to it began.
  const start = Math.max(0, Math.min(src.seconds - TARGET, at - TARGET * 0.35));
  chosen.push({ start, m: null, l: null, score: null, mine: true });
}

const pool = [...windows].sort((a, b) => b.score - a.score);
for (const w of pool) {
  if (chosen.length >= COUNT) break;
  if (chosen.some((c) => Math.abs(c.start - w.start) < GAP)) continue;
  chosen.push(w);
}

// A TIEBREAK ON VOICE, spent only where it can change the answer. voiceGap is
// two extra decodes per window, so it runs on the shortlist and not on the
// hundreds of windows that were never going to be picked.
if (AUDIO) {
  const SPAN = Math.min(8, TARGET);
  for (const c of chosen) {
    if (c.mine) continue;
    // Where the loudest instant in this window is, so the band-pass test is
    // pointed at the reaction rather than at whatever preceded it.
    const lv = loud.filter((r) => r.t >= c.start && r.t < c.start + TARGET);
    const peak = lv.length ? lv.reduce((a, b) => (b.v > a.v ? b : a)).t : c.start + SPAN / 2;
    const from = Math.max(c.start, Math.min(c.start + TARGET - SPAN, peak - SPAN / 2));
    c.voice = voiceGap(IN, from, from + SPAN);
  }
}

// Back into the order they happened, which is the order he will want to watch
// them in and makes the printed table readable against a scrub bar.
chosen.sort((a, b) => a.start - b.start);

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// The crop for each, and a note on what won it the slot.
const cropW = LAYOUT === "crop" && src.w / src.h > W / H
  ? Math.round((src.h * W) / H / 2) * 2
  : null;

// ASKING FOR MORE SHORTS THAN THE SESSION CONTAINS is the normal case, not an
// edge case: --count 3 on a recording with one good moment returns three, and
// the second and third are whatever came next. They are above the dead-menu
// floor, which is all that floor promises. Anything scoring under 40% of the
// session's own best gets marked THIN, because the cost of posting filler to a
// new channel is worse than the cost of posting less.
const bestScore = Math.max(0, ...chosen.filter((c) => !c.mine).map((c) => c.score || 0));
let thin = 0, wide = 0;

console.log(`  ${chosen.length} moment${chosen.length === 1 ? "" : "s"} of ${TARGET}s:\n`);
for (const c of chosen) {
  const rows = track.filter((r) => r.t >= c.start && r.t < c.start + TARGET);
  const fit = cropW ? cropX(rows, src.w, cropW) : null;
  c.x = fit ? fit.x : null;
  if (fit && fit.kept < 0.55) wide++;
  const where = c.x == null ? "" :
    `  crop x=${c.x}` + (c.x < src.w * 0.28 ? " (left)" : c.x > src.w * 0.38 ? " (right)" : " (centre)") +
    (fit ? ` keeps ${(fit.kept * 100).toFixed(0)}%` : "");
  c.thin = !c.mine && bestScore > 0 && (c.score || 0) < bestScore * 0.4;
  if (c.thin) thin++;
  console.log("    " + clock(c.start).padStart(6) +
    (c.mine ? "   yours" : `   busy ${c.m.toFixed(2)}` + (c.l == null ? "" : ` loud ${c.l.toFixed(2)}`) +
      (c.voice == null ? "" : ` voice ${c.voice.toFixed(1)}dB`)) +
    where + (c.thin ? "   THIN" : ""));
}
if (wide) {
  console.log(`\n  ${wide} of these has action spread wider than a 9:16 crop can hold.`);
  console.log("  A single fixed crop is wrong for those, and no better crop exists — the");
  console.log("  movement is genuinely across the screen. Re-cut just those with");
  console.log("  --layout blur, which keeps the whole picture at the cost of letterboxing.");
}
if (thin) {
  console.log(`\n  ${thin} of these scored well below the best moment in the session.`);
  console.log("  They are still cut, because a number is not a judgement — but watch those");
  console.log("  first and throw them away rather than posting to fill a schedule.");
}

const OUT_DIR = OUT_OVERRIDE || path.join(path.dirname(IN), "shorts");
const stem = path.basename(IN).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40);

if (DRY) {
  console.log(`\n  Dry run. Would write ${chosen.length} files to ${OUT_DIR}\n`);
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log(`\n  cutting to ${W}x${H} @ ${FPS}fps${AUDIO ? "" : ", silent"}…\n`);

const written = [];
chosen.forEach((c, i) => {
  const name = `${stem}-short-${String(i + 1).padStart(2, "0")}-${clock(c.start).replace(":", "m")}s.mp4`;
  const out = path.join(OUT_DIR, name);

  let vf;
  if (cropW != null) {
    // Crop the 9:16 window out at full source resolution FIRST, then scale. The
    // other order scales the whole 16:9 frame up to 1080 wide and crops after,
    // which throws away resolution it then has to invent back.
    vf = `crop=${cropW}:${src.h}:${c.x}:0,scale=${W}:${H},fps=${FPS},setsar=1`;
  } else if (LAYOUT === "blur") {
    // KEEP THE WHOLE PICTURE, on a blurred blow-up of itself. Costs the top and
    // bottom of the frame to letterboxing and gains the two thirds of the width
    // a crop throws away. Worth it when the game is spread across the screen —
    // a racing game, a big obby — and not worth it when it is one character in
    // the middle, because the eye is then reading a smaller picture for no
    // reason. gblur on the background rather than boxblur: boxblur at this
    // radius bands visibly on flat Roblox colour.
    vf = `split=2[bg][fg];[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=28[b];` +
      `[fg]scale=${W}:-2[f];[b][f]overlay=(W-w)/2:(H-h)/2,fps=${FPS},setsar=1[vout]`;
  } else {
    // Source is already portrait, or narrower than 9:16. Cover and centre-crop.
    vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1`;
  }

  const a = [
    "-hide_banner", "-loglevel", "error", "-y",
    // Seek before -i so only the needed seconds are decoded. On a ninety-minute
    // recording that is the difference between seconds and minutes per clip.
    "-ss", String(c.start.toFixed(2)), "-t", String(TARGET), "-i", IN,
  ];
  // A filter graph with named pads has to go through -filter_complex; -vf takes
  // only a linear chain.
  //
  // AND ITS FINAL PAD MUST BE NAMED AND MAPPED EXPLICITLY. The blur graph first
  // ended on an unnamed pad, which ffmpeg auto-maps — so the `-map 0:v` meant to
  // select it instead added the untouched 1920x1080 input as a SECOND video
  // stream. The file played correctly in anything that takes the first stream
  // and was wrong everywhere else, at twice the size. Naming the pad [vout] and
  // mapping that name is what makes the selection unambiguous.
  const complex = vf.includes("[");
  a.push(complex ? "-filter_complex" : "-vf", vf);
  if (complex) a.push("-map", "[vout]");
  a.push(...videoArgs({ ffmpeg: FFMPEG, crf: CRF, quality: "good" }));
  if (AUDIO) {
    // 0:a? — the "?" makes it optional so a silent recording does not abort the
    // whole run on a missing stream.
    if (complex) a.push("-map", "0:a?");
    // loudnorm to -14 LUFS, which is what YouTube, TikTok and Instagram all
    // normalise to. Arriving at that level means the platform leaves it alone
    // instead of pulling a shouty clip down and a quiet one up. The short fade
    // at each end kills the click on a cut that lands mid-waveform.
    a.push("-af", `loudnorm=I=-14:TP=-1.5,afade=t=in:st=0:d=0.08,afade=t=out:st=${(TARGET - 0.15).toFixed(2)}:d=0.15`,
      "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2");
  } else {
    a.push("-an");
  }
  // +faststart so the moov atom is at the front. Without it a phone has to
  // download the whole file before it can start playing — which is how a
  // review on his own tablet turns into "it's broken".
  a.push("-movflags", "+faststart", out);

  execFileSync(FFMPEG, a, { stdio: ["ignore", "ignore", "pipe"] });
  const mb = (fs.statSync(out).size / 1048576).toFixed(1);
  written.push({ name, mb });
  process.stdout.write(`    ${i + 1}/${chosen.length}\r`);
});

console.log("");
for (const w of written) console.log(`    ${w.name}  ${w.mb}MB`);
console.log(`\n  ${OUT_DIR}\n`);
console.log("  WATCH THEM BEFORE ANY OF THEM GOES ANYWHERE. These were chosen because");
console.log("  they are busy and loud, which is a correlate of something happening and");
console.log("  not a recognition of it — nothing here knows a win from a death, and");
console.log("  nothing here heard what was actually said. Check every one for a full");
console.log("  name, a school, a town, or a friend whose parents have not said yes.\n");
