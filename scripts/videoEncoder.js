// Which encoder to hand ffmpeg: the graphics card if it will take the job, the
// CPU if it will not.
//
// WHY. Every montage and every clip cut on this machine went through libx264 on
// an i3-10105F, while a GeForce GTX 1650 with a dedicated hardware encoder sat
// idle. Measured on a real charter clip, 9 Sep 2026:
//
//     libx264   (CPU)   29.6s
//     h264_nvenc (GPU)  12.3s      2.4x faster, same file size
//
// That is the largest speed-up available on this box and it costs nothing. The
// owner's alternative was buying a CPU.
//
// WHY IT STILL FALLS BACK. These scripts run unattended on a schedule. NVENC can
// be listed by ffmpeg and still fail at run time -- no card on a different
// machine, a driver update mid-run, or the encoder already held by something
// else. A montage that dies at 8am because the GPU was busy is worse than one
// that takes twice as long, so availability is PROVEN with a real one-frame
// encode rather than assumed from the encoder list, and anything that fails
// falls back to libx264 with a line saying so.
//
// QUALITY. libx264 takes -crf; NVENC has no CRF. The closest equivalent is
// constant-quality VBR: -rc vbr with -cq at the same number and -b:v 0, which
// lets the bitrate float to hold that quality. NVENC at a given number is
// slightly softer than x264 at the same one, so the caller's CRF is nudged down
// a little rather than passed straight through.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Keyed on the ffmpeg path, not a single flag. A bare `cached` answered for
// whichever binary asked first, so a second call naming a different — or
// missing — ffmpeg got the first one's answer. Nothing in the current scripts
// does that, which is exactly why it would have been found late.
const cache = new Map();

// preset: "fast" for intermediate shots nobody sees on their own, "good" for
// the file that actually gets posted.
const NVENC_PRESET = { fast: "p4", good: "p5" };
const X264_PRESET = { fast: "veryfast", good: "medium" };

// Prove it, do not trust the list. One frame of colour bars, encoded and thrown
// away.
function nvencWorks(ffmpeg) {
  const out = path.join(os.tmpdir(), "ny-nvenc-probe-" + process.pid + ".mp4");
  try {
    execFileSync(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc=size=256x256:rate=30:duration=0.1",
      "-c:v", "h264_nvenc", "-frames:v", "1", out,
    ], { stdio: "pipe", timeout: 30000 });
    const ok = fs.existsSync(out) && fs.statSync(out).size > 0;
    try { fs.unlinkSync(out); } catch {}
    return ok;
  } catch {
    try { fs.unlinkSync(out); } catch {}
    return false;
  }
}

// Answers once per process. A montage encodes many shots and probing before
// each would cost more than it saves.
function detect(ffmpeg, { force } = {}) {
  if (force === "cpu") return { name: "libx264", gpu: false, reason: "forced to CPU" };
  const key = String(ffmpeg || "");
  if (cache.has(key)) return cache.get(key);
  const gpu = nvencWorks(ffmpeg);
  const answer = gpu
    ? { name: "h264_nvenc", gpu: true, reason: "NVENC available" }
    : { name: "libx264", gpu: false, reason: "no working NVENC — using the CPU" };
  cache.set(key, answer);
  return answer;
}

// The -c:v ... block for an ffmpeg command, ready to push into an args array.
//
//   crf     the quality number the caller already reasons in
//   quality "fast" | "good"
//   force   "cpu" to opt out entirely
function videoArgs({ ffmpeg, crf = 23, quality = "good", force } = {}) {
  const enc = detect(ffmpeg, { force });
  const n = Math.max(0, Math.min(51, Number(crf) || 23));
  if (!enc.gpu) {
    return ["-c:v", "libx264", "-preset", X264_PRESET[quality] || "medium",
      "-crf", String(n), "-pix_fmt", "yuv420p"];
  }
  // -b:v 0 is what makes -cq behave as a quality target rather than a ceiling.
  // The -2 keeps NVENC visually level with x264 at the same number.
  const cq = Math.max(0, Math.min(51, n - 2));
  // A CEILING THAT SHOULD NEVER BIND.
  //
  // Constant-quality VBR with -b:v 0 is unbounded by design, which is right
  // until a clip is all spray and glow sticks and the encoder decides it needs
  // 60 Mbps to hold the quality target. Measured for reference: the existing
  // CPU montages of this library run 9,400-21,650 kbps, and the first NVENC one
  // came out at 15,800.
  //
  // 30M therefore sits above anything real this library has produced and only
  // clips the pathological case. It is insurance, not a bitrate setting -- if
  // it ever starts binding, that is a signal the source is unusual, not that
  // the number is wrong.
  return ["-c:v", "h264_nvenc", "-preset", NVENC_PRESET[quality] || "p5",
    "-rc", "vbr", "-cq", String(cq), "-b:v", "0",
    "-maxrate", "30M", "-bufsize", "60M",
    "-pix_fmt", "yuv420p"];
}

// For a one-line note in a script's own output, so a slow run is explainable
// afterwards rather than mysterious.
function describe(ffmpeg, opts) {
  const enc = detect(ffmpeg, opts);
  return enc.gpu ? "GPU (h264_nvenc)" : "CPU (libx264) — " + enc.reason;
}

module.exports = { videoArgs, detect, describe };
