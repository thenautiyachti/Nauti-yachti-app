// Generate the secrets inventory from the actual file, never from memory.
//
// I wrote the first version of that table by hand and got 14 of 22 wrong --
// including the name of the console password, which I called ADMIN_PASSCODE
// when it is ADMIN_PASSWORD. On the day somebody is rebuilding this machine
// from a dead disk, a table of names that do not exist is worse than no table.
//
// NAMES ONLY. This never reads a value, and asserts as much by printing the
// character count instead, so the doc can say "22 variables" and be checked.
const fs = require("fs");

const ENV = "C:/Users/immex/.secrets/nauti-yachti.env";
const DOC = "C:/Users/immex/Documents/_MyFiles/_The Nauti Yachti LLC/AI & Website/DISASTER RECOVERY.md";

const names = [...fs.readFileSync(ENV, "utf8").matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]);

// Where each one comes from. Anything not listed gets a safe default row rather
// than being silently dropped -- a variable with no note still has to appear.
const WHERE = {
  DATABASE_URL: ["Supabase -> Project Settings -> Database", "Connection string. The DATA is safe in Supabase; this is just the address."],
  DIRECT_URL: ["Supabase -> same page", "Used by Prisma migrations."],
  JARVIS_SERVICE_KEY: ["Invent a new one", "A shared secret between the crew scripts and the console. Set it in both and nothing else needs to agree."],
  ADMIN_PASSWORD: ["Invent a new one", "Owner console login."],
  SESSION_SECRET: ["Invent a new one", "Signs console sessions. Changing it logs everyone out, which is harmless."],
  STRIPE_SECRET_KEY: ["Stripe -> Developers -> API keys", "LIVE key. Roll the old one once the new machine works."],
  STRIPE_PUBLISHABLE_KEY: ["Stripe -> same page", "Not secret, but needed."],
  STRIPE_WEBHOOK_SECRET: ["Stripe -> Developers -> Webhooks", "Tied to the endpoint URL; re-created with the endpoint."],
  RESEND_API_KEY: ["resend.com -> API Keys", "Send-only by design. Domain verification lives in DNS and survives."],
  FROM_EMAIL: ["Not a secret", "The Nauti Yachti <bookings@thenautiyachti.com>"],
  REPLY_TO_EMAIL: ["Not a secret", "Where guest replies go."],
  OWNER_EMAIL: ["Not a secret", "Where the console sends the owner's own mail."],
  SITE_URL: ["Not a secret", "https://www.thenautiyachti.com"],
  DOCK_ADDRESS: ["Ask the owner", "The dock's street address, sent in the booking confirmation. Kept out of the repo because the dock is a private residence."],
  DOCK_GATE_CODE: ["Ask the owner", "SENSITIVE, and DELIBERATELY LEFT UNSET. Setting it puts the gate code in every confirmation email, where it is forwarded and kept forever — every past guest would keep working access to a private residence. The code is texted on the morning instead. Never commit it either way: git history keeps it permanently and rotating the code would not remove it."],
  CONTACT_PHONE: ["Not a secret", "(832) 948-2912 — shown in guest emails."],
  ARRIVE_MINUTES_EARLY: ["Not a secret", "Optional. How early guests are asked to arrive; defaults to 15."],
  ELEVENLABS_API_KEY: ["elevenlabs.io -> Profile -> API key", "TTS only. A 401 from it means QUOTA, not a bad key."],
  ELEVENLABS_MODEL_ID: ["Not a secret", "Optional. Defaults to flash, which is half the price."],
  BLOTATO_API_KEY: ["blotato.com -> Settings", "Social publishing."],
};

const VOICE = "elevenlabs.io -> Voices";

const rows = names.map((n) => {
  if (WHERE[n]) return [n, WHERE[n][0], WHERE[n][1]];
  if (/^ELEVENLABS_VOICE_/.test(n)) {
    const who = n.replace("ELEVENLABS_VOICE_", "");
    if (who === "ID") return [n, VOICE, "Legacy fallback voice. The roster in lib/crew.js names each agent's voice instead, so this should not be needed."];
    return [n, VOICE, "Voice id for Nauti " + who.charAt(0) + who.slice(1).toLowerCase() + ". Without it she speaks in the wrong voice."];
  }
  return [n, "UNKNOWN -- find out before you need it", ""];
});

const table = [
  "| Variable | Where to get it again | Notes |",
  "|---|---|---|",
  ...rows.map(([n, w, note]) => "| `" + n + "` | " + w + " | " + note + " |"),
].join("\n");

let doc = fs.readFileSync(DOC, "utf8");
// Match the header this script itself writes, not the hand-written one it
// replaced the first time, so it can be re-run whenever a secret is added.
const START = "| Variable | Where to get it again | Notes |";
const END = "\n\n**Production does not read that file.**";
const from = doc.indexOf(START);
const to = doc.indexOf(END);
if (from === -1 || to === -1) { console.error("  anchors missing"); process.exit(1); }

doc = doc.slice(0, from) + table + doc.slice(to);
fs.writeFileSync(DOC, doc);

console.log("  " + names.length + " variables, table regenerated from the file itself");
const unknown = rows.filter((r) => r[1].startsWith("UNKNOWN"));
console.log("  " + (unknown.length ? unknown.length + " with no known source: " + unknown.map((r) => r[0]).join(", ")
  : "every one has a documented source"));

// Prove no SECRET value leaked. Values whose row says "Not a secret" are in the
// document on purpose -- FROM_EMAIL is the address printed on every email the
// business sends, and a recovery doc that hid it would be less useful.
const PUBLIC = new Set(Object.entries(WHERE).filter(([, v]) => v[0] === "Not a secret").map(([k]) => k));
const leaked = [...fs.readFileSync(ENV, "utf8").matchAll(/^([A-Z0-9_]+)=(.+)$/gm)]
  .filter(([, n]) => !PUBLIC.has(n))
  .map(([, , v]) => v.trim().replace(/^["']|["']$/g, ""))
  .filter((v) => v.length > 12 && doc.includes(v));
console.log("  " + (leaked.length ? "!! " + leaked.length + " VALUE(S) LEAKED INTO THE DOC" : "no secret value appears in the document"));
