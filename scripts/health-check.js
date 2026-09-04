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
      const r = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: "Bearer " + sk } });
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
      const r = await fetch(site + "/api/admin/env-check", { headers: { "x-jarvis-key": svc } });
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
      const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + voice, {
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
    try { const r = await fetch(u); R(n, r.ok ? "ok" : "FAIL", "HTTP " + r.status); }
    catch (e) { R(n, "FAIL", e.message.slice(0, 40)); }
  }

  // --- every image the booking pages point at -------------------------------
  try {
    const { prisma } = require(path.join(APP, "lib/db.js"));
    const imgs = [
      ...(await prisma.vessel.findMany()).map((v) => v.image),
      ...(await prisma.package.findMany()).map((p) => p.image),
      ...(await prisma.galleryItem.findMany()).map((g) => g.url),
    ].filter(Boolean);
    let bad = 0, offsite = 0;
    for (const u of imgs) {
      if (/^https?:/i.test(u) && !u.includes("thenautiyachti.com")) offsite++;
      const target = u.startsWith("http") ? u : "https://www.thenautiyachti.com" + u;
      try { const r = await fetch(target, { method: "GET", headers: { Range: "bytes=0-32" } }); if (!r.ok) bad++; }
      catch { bad++; }
    }
    R("Site images", bad ? "FAIL" : "ok", `${imgs.length} checked, ${bad} broken, ${offsite} on third-party hosts`);
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
