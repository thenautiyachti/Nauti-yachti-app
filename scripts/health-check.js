// Standing health check for everything the platform depends on but does not own.
//
//   node scripts/health-check.js
//
// TEST THE CAPABILITY, NOT THE AUTHENTICATION. This is the whole design of this
// file, and it is written down because the first version got it wrong twice in
// one run:
//
//   * Resend was reported dead because GET /domains returned 401. The key is
//     send-only: it cannot read domains and sends perfectly well. A live run had
//     been emailing the owner all along.
//   * ElevenLabs was reported as an invalid key, also on a 401. ElevenLabs
//     returns 401 for QUOTA EXHAUSTION. The key was fine; the credits were gone.
//
// Both would have sent someone to rotate a working key. So each check below
// exercises the operation the platform actually performs, and reads the error
// body rather than trusting the status code to mean what it usually means.
const fs = require("fs");
const path = require("path");
const APP = path.join(__dirname, "..");

// Every outside call gets a deadline. Without one, a host that is DOWN -- as
// opposed to refusing -- never answers, and the whole check stops dead.
//
// Added defensively, not after an incident. On 4 Sep 2026 this looked like it
// had hung for fifteen minutes; it had not, the output was simply buffered and
// it exited clean. But the risk was real and specific: the image check walks
// every gallery URL one at a time, and it exists precisely BECAUSE those URLs
// once pointed at an abandoned host. Had that still been true, a check written
// to warn about a dead host would itself have stopped dead on it, reported
// nothing, and left whoever ran it concluding the tool was broken.
//
// The parallel image check below is the other half: 45 sequential timeouts is
// six minutes even with a deadline on each.
const DEADLINE = 8000;
const withDeadline = (url, opts) =>
  fetch(url, { ...(opts || {}), signal: AbortSignal.timeout(DEADLINE) });

const env = {};
for (const l of fs.readFileSync("C:/Users/immex/.secrets/nauti-yachti.env", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  // Into process.env as well as the local map: Prisma reads DATABASE_URL from
  // the environment, and populating only the local object left the image check
  // failing with "Environment variable not found" while every other check passed.
  if (m) { env[m[1]] = m[2].replace(/^["']|["']$/g, ""); if (!process.env[m[1]]) process.env[m[1]] = env[m[1]]; }
}

const out = [];
const R = (name, state, detail) => out.push({ name, state, detail });

async function main() {
  // --- Stripe: read-only call, proves the key and reveals live vs test -------
  const sk = env.STRIPE_SECRET_KEY;
  if (!sk) R("Stripe", "MISSING", "no key in the secrets store");
  else {
    const mode = sk.startsWith("sk_live") ? "LIVE" : sk.startsWith("sk_test") ? "TEST" : "?";
    try {
      const r = await withDeadline("https://api.stripe.com/v1/balance", { headers: { Authorization: "Bearer " + sk } });
      R("Stripe (local key)", r.ok ? "ok" : "FAIL", r.ok ? mode + " mode" : "rejected " + r.status);
    } catch (e) { R("Stripe (local key)", "FAIL", e.message.slice(0, 50)); }
  }
  R("Stripe webhook secret", env.STRIPE_WEBHOOK_SECRET ? "ok" : "MISSING", env.STRIPE_WEBHOOK_SECRET ? "present" : "cannot verify signatures");

  // --- Resend: no read call. A send-only key fails every read endpoint. ------
  // There is no way to prove sending without sending, so this only confirms the
  // key is present and the shape is right. The real proof is Joy's Monday run.
  const rk = env.RESEND_API_KEY;
  R("Resend (local key)", rk && /^re_/.test(rk) ? "ok" : rk ? "CHECK" : "MISSING",
    rk ? "present locally; send-only keys cannot be read-tested" : "review reminder cannot send");

  // --- What the RUNNING DEPLOYMENT actually has -----------------------------
  //
  // The single most useful check here, and it did not exist while it mattered.
  // Every line above reads the local secrets store on this PC. Production is a
  // different machine with a different set of variables, and for a week it had
  // no RESEND_API_KEY at all -- so lib/email.js returned { sent: false } before
  // reaching the sender and every booking confirmation was silently not sent,
  // while this script cheerfully reported Resend as fine.
  //
  // A check that runs somewhere other than the thing it checks is not a check.
  // /api/admin/env-check answers from inside the deployment, and returns names
  // only -- never a value, a prefix or a length.
  const svc = env.JARVIS_SERVICE_KEY;
  const site = env.SITE_URL || "https://www.thenautiyachti.com";
  if (!svc) {
    R("Production env", "CHECK", "no JARVIS_SERVICE_KEY locally, so production cannot be asked");
  } else {
    try {
      const r = await withDeadline(site + "/api/admin/env-check", { headers: { "x-jarvis-key": svc } });
      if (r.status === 404) {
        R("Production env", "CHECK", "endpoint not deployed yet -- push and redeploy");
      } else if (!r.ok) {
        R("Production env", "FAIL", "env-check returned " + r.status);
      } else {
        const d = await r.json();
        if (d.missing && d.missing.length) {
          R(
            "Production env",
            "FAIL",
            d.missing.length + " missing: " + d.missing.map((m) => m.name).join(", ")
          );
          // Say what each one actually breaks. A list of names is a puzzle;
          // a list of consequences is a to-do list.
          for (const m of d.missing) console.log("              " + m.name + " -> " + m.breaks);
        } else {
          R(
            "Production env",
            "ok",
            d.presentCount + "/" + d.requiredCount + " required present in " + d.environment
          );
        }
        for (const o of (d.optionalMissing || [])) {
          if (o.name === "REPLY_TO_EMAIL") {
            R("Reply-to address", "CHECK", o.note);
          }
        }
      }
    } catch (e) {
      R("Production env", "FAIL", e.message.slice(0, 60));
    }
  }

  // --- ElevenLabs: hit TTS and read the body. 401 here usually means quota. --
  const ek = env.ELEVENLABS_API_KEY;
  if (!ek) R("ElevenLabs", "MISSING", "speech falls back to text, which is handled");
  else {
    try {
      const voice = env.ELEVENLABS_VOICE_ID || "wDsJlOXPqcvIUKdLXjDs";
      const r = await withDeadline("https://api.elevenlabs.io/v1/text-to-speech/" + voice, {
        method: "POST",
        headers: { "xi-api-key": ek, "Content-Type": "application/json", Accept: "audio/mpeg" },
        // A realistic length on purpose. A one-character probe costs one credit
        // and succeeds even when the account is empty, so it reported "synthesis
        // works" against an account that then refused a sixteen-character line.
        // A health check that passes when the thing is broken is worse than none.
        body: JSON.stringify({ text: "Health check line.", model_id: env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5" }),
      });
      if (r.ok) R("ElevenLabs", "ok", "synthesis works at a realistic length");
      else {
        const t = await r.text();
        if (/quota_exceeded|credits remaining/i.test(t)) R("ElevenLabs", "NO CREDITS", "key is valid; quota exhausted. Speech falls back to text.");
        else R("ElevenLabs", "FAIL", "HTTP " + r.status + " " + t.slice(0, 90));
      }
    } catch (e) { R("ElevenLabs", "FAIL", e.message.slice(0, 50)); }
  }

  // --- the site and the console --------------------------------------------
  for (const [n, u] of [["Website", "https://www.thenautiyachti.com"], ["Owner console", "https://www.thenautiyachti.com/admin"]]) {
    try { const r = await withDeadline(u); R(n, r.ok ? "ok" : "FAIL", "HTTP " + r.status); }
    catch (e) { R(n, "FAIL", e.message.slice(0, 40)); }
  }

  // --- every image the booking pages point at -------------------------------
  try {
    const { prisma } = require(path.join(APP, "lib/db.js"));
    // Each source is named and counted separately. This check once read
    // galleryItem and mapped g.url -- the field is g.image -- so all 45 rows
    // became undefined, .filter(Boolean) swallowed them, and it cheerfully
    // reported "10 checked, 0 on third-party hosts" while 32 of them sat on an
    // abandoned BrandCrowd account. A silent zero is the most dangerous result
    // a checker can produce, so a source that has rows but yields no URLs is
    // now an error rather than an absence.
    const sources = [
      ["vessel", await prisma.vessel.findMany(), (r) => r.image],
      ["package", await prisma.package.findMany(), (r) => r.image],
      ["galleryItem", await prisma.galleryItem.findMany(), (r) => r.image],
    ];
    const imgs = [];
    const mismapped = [];
    for (const [name, rows, pick] of sources) {
      const got = rows.map(pick).filter(Boolean);
      if (rows.length && !got.length) mismapped.push(name + " has " + rows.length + " rows but no image field matched");
      imgs.push(...got);
    }
    if (mismapped.length) {
      R("Site images", "FAIL", mismapped.join("; "));
      await prisma.$disconnect();
      throw new Error("skip");
    }
    let offsite = 0;
    // In parallel, with a deadline each. Sequentially, 45 dead hosts at eight
    // seconds apiece is six minutes of nothing happening.
    const results = await Promise.all(imgs.map(async (u) => {
      if (/^https?:/i.test(u) && !u.includes("thenautiyachti.com")) offsite++;
      const target = u.startsWith("http") ? u : "https://www.thenautiyachti.com" + u;
      try {
        const r = await withDeadline(target, { method: "GET", headers: { Range: "bytes=0-32" } });
        return r.ok ? null : "HTTP " + r.status;
      } catch (e) {
        // A timeout and a refusal are different problems: one host is gone, the
        // other is saying no. Worth telling apart in the output.
        return e.name === "TimeoutError" ? "no answer" : "unreachable";
      }
    }));
    const broken = results.filter(Boolean);
    const timedOut = broken.filter((b) => b === "no answer").length;
    R("Site images", broken.length ? "FAIL" : "ok",
      `${imgs.length} checked, ${broken.length} broken` +
      (timedOut ? ` (${timedOut} never answered)` : "") +
      `, ${offsite} on third-party hosts`);
    await prisma.$disconnect();
  } catch (e) { R("Site images", "CHECK", e.message.slice(0, 50)); }

  // --- the manual the console links to --------------------------------------
  try {
    const { check } = require(path.join(APP, "scripts/check-manual-fresh.js"));
    const c = check();
    R("Manual PDF", c.ok ? "ok" : "STALE", c.reason);
  } catch (e) { R("Manual PDF", "CHECK", e.message.slice(0, 50)); }

  const width = Math.max(...out.map((r) => r.name.length));
  for (const r of out) console.log(`  ${(r.state === "ok" ? "ok" : r.state).padEnd(10)}${r.name.padEnd(width + 2)}${r.detail}`);
  const bad = out.filter((r) => !["ok"].includes(r.state));
  console.log(`\n  ${out.length - bad.length}/${out.length} clean.`);
}
main().catch((e) => { console.error("ERR " + e.message); process.exit(1); });
