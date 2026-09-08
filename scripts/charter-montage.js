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
// TRANSITIONS between shots, because the owner's own CapCuts have them and a
// wall of hard cuts reads as unedited beside one that does not.
//
// The workhorse is a dissolve with a slide every third join. That ratio is
// deliberate: his cuts use two or three transition types, not twelve, and
// variety past that stops reading as a style and starts reading as somebody
// clicking every button in the menu.
//
// 0.35s matches what a ~3s shot can spare. Longer and the shot is more
// transition than picture.
const NO_TRANS = has("no-transitions");
const TRANS_D = Math.max(0.15, Math.min(0.8, Number(arg("transition-length", 0.35)) || 0.35));
const FORCED_TRANS = arg("transition");
const TRANS_CYCLE = ["dissolve", "slideleft", "dissolve", "slideright", "dissolve", "smoothup"];
const transitionAt = (i) => FORCED_TRANS || TRANS_CYCLE[i % TRANS_CYCLE.length];
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

// IS ANYBODY TALKING IN THIS WINDOW?
//
// Returns how much of the level survives a 300-3000Hz band-pass. Speech lives
// in that band; a boat engine is rumble below it and water is broadband hiss.
// Closer to zero means more of the sound was already voice.
//
// Validated against the one labelled example there is: the owner's spoken intro
// on Tasha's first clip reads -2.0dB, while engine-only windows on the same
// charter read -6.0dB. Less negative is more voice.
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

// WHAT THE PICTURE IS MADE OF, per second. Two numbers, both earned from the
// owner's notes on the first two test cuts.
//
// DARK — the wakeboard tower. His note on Anna: "from 3 to 4 seconds you see
// the wakeboard tower blocking the entire view", and again at 10-12s. The
// tower is the nearest object to a boat-mounted lens and it swallows the shot.
// The first attempt at catching it assumed it sits STILL in frame because it
// is bolted down — it does not, the footage is shot on head-mounted glasses,
// so it swings as he looks around, and a static-pixel test found nothing at
// either moment. What it is instead is DARK: a black tube against sky and
// water. Measured over his flagged seconds that reads 26.7% against 13.9% for
// the rest of the video.
//
// COLOUR — people. Saturated, non-blue pixels are life jackets, swimwear and
// skin; fibreglass, foam, sky and water are not. This is the closest thing
// here to "is anybody in this shot", which is the other half of his note:
// "you see nothing but the back of the boat, no people in it, just a wave."
//
// The sky third is excluded from both. The top of a 9:16 boat frame is nearly
// always sky and including it just dilutes whatever is happening lower down.
function visualTrack(file) {
  const W = 96, H = 170, FPS = 2;
  function planes(pixfmt, bpp) {
    const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-nostats", "-an",
      "-i", file, "-vf", `fps=${FPS},scale=${W}:${H},format=${pixfmt}`, "-f", "rawvideo", "-"],
      { maxBuffer: 1 << 28 });
    const buf = r.stdout;
    if (!buf || !buf.length) return [];
    const size = W * H * bpp, out = [];
    for (let i = 0; i + size <= buf.length; i += size) out.push(buf.subarray(i, i + size));
    return out;
  }
  const grays = planes("gray", 1), rgbs = planes("rgb24", 3);
  const lowFrom = Math.floor(H / 3);
  const out = [];
  for (let i = 0; i < grays.length; i++) {
    const g = grays[i], rgb = rgbs[i];
    let dark = 0, n = 0, colour = 0;
    for (let y = lowFrom; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (g[p] < 60) dark++;
        n++;
        if (rgb) {
          const q = p * 3, r = rgb[q], gg = rgb[q + 1], b = rgb[q + 2];
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          // Blue-dominant pixels are sky and water, not a person.
          if (mx && (mx - mn) / mx > 0.35 && !(b > r && b > gg)) colour++;
        }
      }
    }
    out.push({ t: i / FPS, dark: dark / n, colour: colour / Math.max(1, n) });
  }
  return out;
}

// Measuring is minutes of decode. Cache beside the footage so a re-run at a
// different length is instant, and so a second montage of the same charter
// costs nothing.
function measureAll(list, dir) {
  // v2: the cache gained the visual track. An old cache has no `visual` key,
  // and silently scoring against a missing one would quietly restore the old
  // behaviour, so the version is in the filename.
  const cachePath = path.join(dir, ".montage-scores-v2.json");
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, "utf8")); } catch {}
  let fresh = 0;
  for (const c of list) {
    if (cache[c.file]) continue;
    process.stdout.write(`    measuring ${c.file.slice(9, 15)} …\r`);
    cache[c.file] = {
      motion: motionTrack(c.full),
      loud: loudnessTrack(c.full),
      visual: visualTrack(c.full),
    };
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

// THE OWNER'S OWN PICKS BEAT EVERY SCORE IN THIS FILE.
//
// Drop a `picks.txt` in the charter folder and the montage is built from it.
// One line per moment:
//
//     20260812_112342_2f4bac9d.mp4   12-16
//     20260812_125156_89b550f9.mp4   1:30-1:34
//     20260812_131004_a5fa14b1.mp4   47          (start only; takes one slice)
//
// Blank lines and anything after # are ignored, and the filename can be a
// unique fragment — "112342" is enough.
//
// WHY THIS OUTRANKS THE SCORING. Every automatic signal here is a proxy, and
// the labels he gave for Anna's cut on 8 Sep 2026 show how weak they are: of
// four features measured against 23 seconds he called good, motion separated
// at a ratio of 0.96 and evenness at 0.98 — both noise — while the strongest,
// people-in-frame, managed 2.12. A proxy at 2:1 is worth having and is not
// worth arguing with a person who has watched the footage.
function readPicks(dir) {
  const f = path.join(dir, "picks.txt");
  if (!fs.existsSync(f)) return [];
  const out = [];
  for (const raw of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^(\S+)\s+(.+)$/);
    if (!m) continue;
    const toSec = (s) => {
      const p = String(s).trim().split(":").map(Number);
      if (p.some((x) => !Number.isFinite(x))) return null;
      return p.length === 2 ? p[0] * 60 + p[1] : p[0];
    };
    // One line may carry several moments: "12-16, 30-34".
    for (const part of m[2].split(",")) {
      // A trailing "!" is his "very good" as against merely "good". He marked
      // both on Anna's footage and the difference is worth keeping: it is the
      // only ranking signal in the file, and there is always more good
      // material than there is room for.
      const t = part.trim();
      const veryGood = /!\s*$/.test(t);
      const r = t.replace(/!\s*$/, "").trim().match(/^([\d:.]+)(?:\s*-\s*([\d:.]+))?$/);
      if (!r) continue;
      const start = toSec(r[1]);
      const end = r[2] ? toSec(r[2]) : null;
      if (start == null) continue;
      out.push({ match: m[1], start, end, veryGood });
    }
  }
  return out;
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

// NDA CHARTERS GET NOTHING. This rule existed only in Coral's brief, which
// meant the tool itself would happily cut a montage of an NDA trip if anyone
// pointed it at one — and on 7 Sep 2026 every charter folder gained a
// "compilation video" subfolder, so the invitation is now sitting in the NDA
// charter too. A rule that lives only in a brief is a rule the next person
// runs straight past.
if (/\[NDA/i.test(dir)) {
  console.error("\n  REFUSING: " + path.basename(dir));
  console.error("  This charter is marked NDA - NO MEDIA MAY BE POSTED.");
  console.error("  No montage, no stills, no mention. Nothing is written.\n");
  process.exit(1);
}
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

// If he has marked the good moments, that IS the montage. No scoring, no dock
// test, no dark penalty — those exist to guess at what he would pick, and he
// has stopped guessing being necessary.
let PICKED = null;
const PICKS = readPicks(dir);
if (PICKS.length) {
  let chosen = [];
  for (const p of PICKS) {
    const clip = clips.find((c) => c.file.includes(p.match));
    if (!clip) { console.log(`    ?  no clip matches "${p.match}" — skipped`); continue; }

    // These are typed by hand off a video player, so a start past the end of
    // the clip or an end a few seconds beyond it are both going to happen.
    // Neither can be allowed through quietly: ffmpeg answers a start past the
    // end with an empty segment, and an empty segment silently shifts every
    // transition offset after it onto the wrong shot.
    if (p.start >= clip.seconds - 0.5) {
      console.log(`    !  ${clip.file.slice(9, 15)} is only ${clip.seconds.toFixed(0)}s ` +
        `— a pick at ${p.start}s is past the end. Skipped.`);
      continue;
    }
    let len = p.end != null ? Math.max(0.5, p.end - p.start) : null;
    const room = clip.seconds - p.start;
    if (len != null && len > room) {
      console.log(`    ~  ${clip.file.slice(9, 15)} ends at ${clip.seconds.toFixed(0)}s ` +
        `— trimming your ${len.toFixed(1)}s pick to ${room.toFixed(1)}s.`);
      len = room;
    }
    if (len != null && len < 1.2) {
      console.log(`    !  ${clip.file.slice(9, 15)} at ${p.start}s leaves only ` +
        `${len.toFixed(1)}s — too short to read as a shot. Skipped.`);
      continue;
    }
    // veryGood has to be carried across explicitly — it lives on the parsed
    // pick, not on the clip, and spreading `...clip` does not bring it.
    chosen.push({ ...clip, start: p.start, pickLen: len, veryGood: p.veryGood });
  }
  if (!chosen.length) {
    console.error("\n  picks.txt matched no clips. Check the filenames.\n");
    process.exit(1);
  }
  // THERE IS ALWAYS MORE GOOD MATERIAL THAN ROOM. On Anna's charter he marked
  // 27 moments totalling about four minutes for a sixty-second cut, so the
  // question is not whether to trim but how.
  //
  // Each moment gets `base` seconds, doubled if he marked it "very good", and
  // never more than he actually marked — a two-second pick stays two seconds
  // rather than being padded into footage he did not choose. Solve for `base`
  // by bisection so the total lands on the target; a closed form does not
  // exist once picks start hitting their own ceiling.
  // A SHOT HAS TO BE LONG ENOUGH TO READ. The first attempt at this squeezed
  // all 28 of his marks on Anna into sixty seconds, which is 2.1s each, and he
  // could not follow it: "the video goes so quickly, I can't even see what just
  // happened, it transitioned in like 1 second."
  //
  // So the length is fixed FIRST and the count follows. His own CapCuts hold
  // about 3 seconds and fit 18-20 shots in a minute; that is the target, and
  // when he marks more than fits, the surplus is DROPPED rather than everything
  // being compressed. His words: "you may just have to choose which ones to not
  // even show."
  const marked = chosen.reduce((a, c) => a + (c.pickLen || 0), 0);
  const SHOT = Math.max(2.2, Math.min(4.5, Number(arg("shot", 3.2)) || 3.2));
  const roomFor = Math.max(1, Math.floor(
    (TARGET + (NO_TRANS ? 0 : TRANS_D)) / (SHOT - (NO_TRANS ? 0 : TRANS_D))
  ));

  if (chosen.length > roomFor) {
    // WHICH ONES SURVIVE. His tiebreaker, in his words: "some clips may have
    // better vocals in them, like people talking. I would probably prioritise
    // those." Speech sits in 300-3000Hz where an engine does not, and the one
    // labelled example available — his spoken intro on Tasha's first clip —
    // reads -2.0dB against -6.0dB for engine-only footage.
    //
    // Ties and unmeasurable clips fall back to the longer mark, on the grounds
    // that a moment he watched for twenty seconds is one he rated higher than
    // one he watched for three.
    console.log(`  ${chosen.length} marks is more than ${roomFor} shots of ${SHOT}s — ` +
      `keeping the ones with people talking\n`);
    for (const c of chosen) {
      c.voice = voiceGap(c.full, c.start, c.start + Math.min(6, c.pickLen || 4));
    }
    const ranked = [...chosen].sort((a, b) =>
      (b.voice == null ? -99 : b.voice) - (a.voice == null ? -99 : a.voice) ||
      (b.pickLen || 0) - (a.pickLen || 0));
    const keep = new Set(ranked.slice(0, roomFor));
    for (const c of chosen) {
      if (!keep.has(c)) {
        console.log("    -  " + c.file.slice(9, 15).replace(/(\d\d)(\d\d)(\d\d)/, "$1:$2") +
          " @" + String(c.start).padStart(4) + "s  dropped" +
          (c.voice == null ? "" : "   voice " + c.voice.toFixed(1) + "dB"));
      }
    }
    chosen = chosen.filter((c) => keep.has(c)); // still in shooting order
    console.log("");
  }

  console.log(`  picks.txt: ${chosen.length} of your marks, ${SHOT}s each` +
    ` (you marked ${Math.round(marked)}s in total)\n`);
  for (const c of chosen) {
    // Never longer than he marked — a 2s mark stays 2s rather than running on
    // into footage he did not choose.
    c.pickLen = c.pickLen == null ? SHOT : Math.min(c.pickLen, SHOT);
    console.log("    " + c.file.slice(9, 15).replace(/(\d\d)(\d\d)(\d\d)/, "$1:$2") +
      "  from " + String(c.start).padStart(6) + "s  for " + c.pickLen.toFixed(1) + "s" +
      (c.voice == null ? "" : "   voice " + c.voice.toFixed(1) + "dB"));
  }
  PICKED = chosen.map((c) => ({ ...c, len: c.pickLen, gainDb: 0, why: "your pick" }));
}

let pool = clips;
let scores = null;

// Picks skip every filter below. The dock test, the dark penalty and the
// people bonus all exist to approximate his judgement; when he has supplied it
// directly they are noise, and a dockside second he deliberately chose must
// not be thrown away by a rule about engine noise.
if (SCORE && !PICKED) {
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
const per = Math.max(2, Math.min(4.5, TARGET / Math.max(1, pool.length)));
const used = PICKED ? [] : pool.filter((c) => c.seconds >= per + 0.5);
// Each transition OVERLAPS two shots, so N slices joined by N-1 transitions
// run for N*L - (N-1)*D, not N*L. Ignoring that quietly delivers a 54-second
// video when 60 was asked for — the slices have to grow to pay for the joins.
const nUsed = Math.max(1, used.length);
const overlap = NO_TRANS ? 0 : (nUsed - 1) * TRANS_D;
const slice = Math.max(2, Math.min(5.5, (TARGET + overlap) / nUsed));

if (!PICKED) {
  console.log(`  using ${used.length}, ${slice.toFixed(1)}s each -> about ${Math.round(used.length * slice)}s\n`);
}

// Normalise across the whole DAY, not within each clip. Scoring windows inside
// a clip would still hand us the best three seconds of a clip with nothing in
// it — the point is to compare moments against the trip, not against
// themselves.
let mScale = null, lScale = null;
if (SCORE && !PICKED) {
  mScale = spread(used.flatMap((c) => (scores[c.file].motion || []).map((x) => x.v)));
  lScale = spread(used.flatMap((c) => (scores[c.file].loud || []).map((x) => x.v)));
}

// Pick the best window in each clip, or fall back to a quarter of the way in —
// the first seconds of a phone clip are usually the camera being raised and
// pointed at nothing.
const rows = PICKED || used.map((c) => {
  const fallback = Math.min(c.seconds * 0.25, Math.max(0, c.seconds - slice - 0.2));
  if (!SCORE) return { ...c, len: slice, start: Math.round(fallback * 10) / 10, why: "" };

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
    let score = Math.min(m, l);

    const vv = (scores[c.file].visual || []).filter((x) => x.t >= s && x.t < e);
    let dark = 0, colour = 0;
    if (vv.length) {
      dark = vv.reduce((a, x) => a + x.dark, 0) / vv.length;
      colour = vv.reduce((a, x) => a + x.colour, 0) / vv.length;
      // THE TOWER PENALTY. Below 15% dark costs nothing — every shot from a
      // boat has some hull in it. Past that it falls away fast, and a window
      // that is a third black is worth about half what it was. A penalty and
      // not a veto on purpose: a clip whose every window is dark should still
      // offer its least-bad three seconds rather than drop out entirely.
      score *= 1 - Math.min(0.55, Math.max(0, (dark - 0.15) * 1.8));
      // THE PEOPLE BONUS. Weaker evidence than the dark signal — forward-facing
      // seconds measured 5.1% coloured against 8.4% elsewhere, a real
      // difference but not a clean split — so it is allowed to move the score
      // by about a third, not to decide it.
      score *= 0.85 + Math.min(0.30, colour * 3.5);
    }
    if (!best || score > best.score) best = { start: s, m, l, dark, colour, score };
  }
  // Bring each clip toward a common level, but never shout at a quiet one.
  // -18 LUFS is roughly where these clips already sit; the cap is what stops
  // an empty clip's engine hum being dragged up to match a noisy one.
  const lv = lt.map((x) => x.v);
  const mean = lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : null;
  const gainDb = mean == null ? 0 : Math.max(-12, Math.min(3, -18 - mean));

  if (!best) return { ...c, len: slice, start: Math.round(fallback * 10) / 10, why: "unscored", gainDb };
  return {
    ...c,
    len: slice,
    start: Math.round(best.start * 10) / 10,
    gainDb,
    why: `mot ${best.m.toFixed(2)} loud ${best.l.toFixed(2)} dark ${((best.dark || 0) * 100).toFixed(0)}% ppl ${((best.colour || 0) * 100).toFixed(1)}%`,
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
    "-ss", String(r.start), "-t", String(r.len || slice), "-i", r.full,
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
    // With transitions on, acrossfade already fades each join — adding a
    // 0.12s fade underneath a 0.35s crossfade digs a hole in the audio at
    // every single join.
    const hardCuts = NO_TRANS || rows.length < 2;
    const af = hardCuts
      ? [`afade=t=in:st=0:d=0.12`, `afade=t=out:st=${Math.max(0, (r.len || slice) - 0.12).toFixed(2)}:d=0.12`]
      : [];
    if (r.gainDb) af.unshift(`volume=${r.gainDb.toFixed(1)}dB`);
    if (!af.length) af.push("anull");
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

const joined = MUSIC ? path.join(work, "joined.mp4") : outPath;

if (NO_TRANS || parts.length < 2) {
  // Hard cuts: the segments are already identical in every respect, so this
  // is a stream copy and costs nothing.
  console.log("\n  joining…");
  execFileSync(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-c", "copy", joined,
  ], { stdio: ["ignore", "ignore", "pipe"] });
} else {
  console.log(`\n  joining with ${parts.length - 1} transitions (${TRANS_D}s)…`);
  // xfade OVERLAPS two streams, so every join has to be told where in the
  // running timeline it begins. After k joins the chain is (k+1) slices long
  // MINUS the k overlaps already spent, so the next one starts at
  // (k+1)*(slice - D). Getting this wrong does not error — it silently drops
  // or freezes footage, which is why it is spelled out rather than fiddled
  // with until it looked right.
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const p of parts) args.push("-i", p);

  const vChain = [], aChain = [];
  let acc = 0;
  let vPrev = "0:v", aPrev = "0:a";
  for (let i = 1; i < parts.length; i++) {
    // Cumulative, NOT i*(slice-D): a picks.txt montage has shots of
    // different lengths, and a uniform stride would drift further out of
    // place with every join until the last transitions landed inside the
    // wrong shot entirely.
    acc += (rows[i - 1].len || slice);
    const offset = (acc - i * TRANS_D).toFixed(3);
    const vOut = `v${i}`;
    vChain.push(`[${vPrev}][${i}:v]xfade=transition=${transitionAt(i - 1)}:duration=${TRANS_D}:offset=${offset}[${vOut}]`);
    vPrev = vOut;
    if (KEEP_AUDIO) {
      // acrossfade needs no offset — it always joins the tail of one to the
      // head of the next — and spends exactly the same D as the video, which
      // is what keeps picture and sound the same length.
      const aOut = `a${i}`;
      aChain.push(`[${aPrev}][${i}:a]acrossfade=d=${TRANS_D}:c1=tri:c2=tri[${aOut}]`);
      aPrev = aOut;
    }
  }
  args.push("-filter_complex", [...vChain, ...aChain].join(";"));
  args.push("-map", `[${vPrev}]`);
  if (KEEP_AUDIO) args.push("-map", `[${aPrev}]`, "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2");
  else args.push("-an");
  // The whole thing is re-encoded here rather than copied — unavoidable, since
  // a crossfade invents frames that exist in neither source.
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", CRF, "-pix_fmt", "yuv420p", joined);
  execFileSync(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
}

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
