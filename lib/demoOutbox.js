// The demo's email outbox. SERVER ONLY (it needs the database); the browser-safe
// half of demo mode is lib/demo.js.
//
// In the demo, email is never sent. Each message is kept, newest first, in a
// ConsoleSetting row, so the console can show a prospect exactly what a guest
// and the owner would have received. No new table, so no schema change.
const { isDemo } = require("./demo");

const OUTBOX_KEY = "demo:outbox";
const OUTBOX_MAX = 40;

async function recordDemoEmail(payload) {
  const { prisma } = require("./db");
  const row = await prisma.consoleSetting.findUnique({ where: { key: OUTBOX_KEY } }).catch(() => null);
  let list = [];
  try { list = row ? JSON.parse(row.value) : []; } catch { list = []; }
  list.unshift({
    at: new Date().toISOString(),
    to: [].concat(payload.to || []),
    cc: [].concat(payload.cc || []),
    subject: payload.subject || "",
    html: payload.html || null,
    text: payload.text || null,
  });
  const value = JSON.stringify(list.slice(0, OUTBOX_MAX));
  await prisma.consoleSetting.upsert({
    where: { key: OUTBOX_KEY },
    update: { value },
    create: { key: OUTBOX_KEY, value },
  });
}

async function readDemoOutbox() {
  const { prisma } = require("./db");
  const row = await prisma.consoleSetting.findUnique({ where: { key: OUTBOX_KEY } });
  try { return row ? JSON.parse(row.value) : []; } catch { return []; }
}

// Drop-in for fetch("https://api.resend.com/emails", opts). In the demo it
// records the message and answers like a successful send; everywhere else it
// is fetch.
async function resendFetch(opts) {
  if (!isDemo()) return fetch("https://api.resend.com/emails", opts);
  let payload = {};
  try { payload = JSON.parse(opts.body); } catch {}
  await recordDemoEmail(payload);
  return { ok: true, status: 200, text: async () => "", json: async () => ({ id: "demo" }) };
}

module.exports = { OUTBOX_KEY, recordDemoEmail, readDemoOutbox, resendFetch };
