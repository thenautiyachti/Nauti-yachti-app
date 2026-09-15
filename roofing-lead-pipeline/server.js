import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as store from './lib/db.js';
import { scoreLead } from './lib/score.js';
import { fetchReddit } from './lib/sources/reddit.js';
import { draftReply } from './lib/reply.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4317);

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
    if (raw.length > 1e6) { req.destroy(); reject(new Error('body too large')); }
  });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
});

const geoFor = (signalRow) =>
  (signalRow?.geo_terms || '').split(',').map((s) => s.trim()).filter(Boolean);

// The one signal we use for geo context when scoring ad-hoc leads.
const defaultGeo = () => geoFor(store.listSignals()[0]);

async function scoreAndSave(lead, geoTerms) {
  const result = await scoreLead(lead, { geoTerms });
  store.saveScore(lead.id, result);
  return result;
}

const routes = {
  'GET /api/stats': async (_req, res) => json(res, 200, store.stats()),

  'GET /api/leads': async (req, res, { query }) => {
    json(res, 200, store.listLeads({
      status: query.get('status') || undefined,
      temperature: query.get('temperature') || undefined,
      source: query.get('source') || undefined,
    }));
  },

  'GET /api/leads/:id': async (_req, res, { params }) => {
    const lead = store.getLead(Number(params.id));
    if (!lead) return json(res, 404, { error: 'not found' });
    json(res, 200, { ...lead, events: store.leadEvents(lead.id) });
  },

  'POST /api/leads': async (req, res) => {
    const body = await readBody(req);
    if (!body.raw_text) return json(res, 400, { error: 'raw_text is required' });
    const id = store.insertLead({
      source: 'manual',
      source_ref: `manual:${Date.now()}`,
      raw_text: body.raw_text,
      name: body.name || null,
      phone: body.phone || null,
      email: body.email || null,
      location_text: body.location_text || null,
      posted_at: new Date().toISOString(),
      // A lead typed in by hand has whatever consent the person typing it says
      // it has. Default to none so nothing can be texted by accident.
      consent: body.consent || 'none',
      consent_note: body.consent_note || null,
    });
    await scoreAndSave(store.getLead(id), defaultGeo());
    json(res, 201, store.getLead(id));
  },

  'PATCH /api/leads/:id': async (req, res, { params }) => {
    const body = await readBody(req);
    const id = Number(params.id);
    if (!store.getLead(id)) return json(res, 404, { error: 'not found' });
    const allowed = ['status', 'notes', 'assigned_to', 'name', 'phone', 'email',
                     'consent', 'consent_note', 'draft_reply'];
    const fields = Object.fromEntries(
      Object.entries(body).filter(([k]) => allowed.includes(k)));
    if (Object.keys(fields).length) {
      store.updateLead(id, fields);
      if (fields.status) store.logEvent(id, 'status', `→ ${fields.status}`);
      if (fields.consent) store.logEvent(id, 'consent', `→ ${fields.consent}`);
      if (fields.notes) store.logEvent(id, 'note', fields.notes.slice(0, 200));
    }
    json(res, 200, store.getLead(id));
  },

  'POST /api/score': async (_req, res) => {
    const pending = store.unscored();
    const geo = defaultGeo();
    for (const lead of pending) await scoreAndSave(lead, geo);
    json(res, 200, { scored: pending.length, by: pending.length ? store.getLead(pending[0].id).scored_by : null });
  },

  'POST /api/leads/:id/score': async (_req, res, { params }) => {
    const lead = store.getLead(Number(params.id));
    if (!lead) return json(res, 404, { error: 'not found' });
    json(res, 200, await scoreAndSave(lead, defaultGeo()));
  },

  // Drafts only. Nothing here posts to Reddit — see lib/reply.js for why.
  'POST /api/leads/:id/reply': async (_req, res, { params }) => {
    const lead = store.getLead(Number(params.id));
    if (!lead) return json(res, 404, { error: 'not found' });
    const draft = await draftReply(lead);
    store.saveDraft(lead.id, draft);
    json(res, 200, draft);
  },

  'GET /api/signals': async (_req, res) => json(res, 200, store.listSignals()),

  'POST /api/signals': async (req, res) => {
    const body = await readBody(req);
    if (!body.title || !body.keywords) return json(res, 400, { error: 'title and keywords are required' });
    json(res, 201, store.getSignal(store.insertSignal(body)));
  },

  'POST /api/signals/:id/run': async (_req, res, { params }) => {
    const signal = store.getSignal(Number(params.id));
    if (!signal) return json(res, 404, { error: 'not found' });
    try {
      const found = await fetchReddit(signal);
      const geo = geoFor(signal);
      let added = 0, duplicates = 0;
      for (const lead of found) {
        const id = store.insertLead(lead);
        if (id === null) { duplicates++; continue; }
        added++;
        await scoreAndSave(store.getLead(id), geo);
      }
      const result = `${found.length} found · ${added} new · ${duplicates} already seen`;
      store.markSignalRun(signal.id, result);
      json(res, 200, { ok: true, found: found.length, added, duplicates, result });
    } catch (e) {
      store.markSignalRun(signal.id, `error: ${e.message}`);
      json(res, 502, { error: e.message });
    }
  },
};

function match(method, path) {
  for (const key of Object.keys(routes)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const pp = pattern.split('/'), ap = path.split('/');
    if (pp.length !== ap.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(ap[i]);
      else if (pp[i] !== ap[i]) { ok = false; break; }
    }
    if (ok) return { handler: routes[key], params };
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(await readFile(join(ROOT, 'public/index.html')));
    }
    const hit = match(req.method, url.pathname);
    if (!hit) return json(res, 404, { error: 'no such route' });
    await hit.handler(req, res, { params: hit.params, query: url.searchParams });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}).listen(PORT, () => {
  const scorer = process.env.ANTHROPIC_API_KEY ? 'Claude' : 'keyword heuristic (no ANTHROPIC_API_KEY)';
  const reddit = process.env.REDDIT_CLIENT_ID ? 'OAuth' : 'anonymous (may 403 off a laptop)';
  console.log(`\n  Roofing lead pipeline → http://localhost:${PORT}`);
  console.log(`  Scoring: ${scorer}`);
  console.log(`  Reddit:  ${reddit}\n`);
});
