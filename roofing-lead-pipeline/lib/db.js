// Storage. node:sqlite ships with Node 22, so the prototype has no install step.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const FILE = process.env.PIPELINE_DB || './data/pipeline.db';
mkdirSync(dirname(FILE), { recursive: true });

export const db = new DatabaseSync(FILE);

db.exec(`
CREATE TABLE IF NOT EXISTS lead (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT NOT NULL,

  source        TEXT NOT NULL,   -- reddit | manual | meta_lead_ad | web_form | missed_call | storm_campaign
  source_ref    TEXT UNIQUE,     -- permalink or provider id; UNIQUE is what makes re-runs idempotent
  author        TEXT,
  raw_text      TEXT NOT NULL,
  posted_at     TEXT,
  location_text TEXT,

  name          TEXT,
  phone         TEXT,
  email         TEXT,

  -- Scoring
  temperature   TEXT,            -- hot | warm | mild | cold
  intent        INTEGER,         -- 0-100
  urgency       INTEGER,         -- 0-100
  signals       TEXT,            -- JSON array of the phrases that earned the score
  concerns      TEXT,            -- JSON array of reasons to doubt it
  reasoning     TEXT,
  scored_by     TEXT,            -- claude | heuristic
  scored_at     TEXT,

  -- Consent is a first-class field, not a checkbox. It decides which
  -- contact actions the UI will even render. See README, "Why consent
  -- is a column".
  consent       TEXT NOT NULL DEFAULT 'none',  -- none | public_thread_only | opted_in
  consent_note  TEXT,

  status        TEXT NOT NULL DEFAULT 'new',
  assigned_to   TEXT,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS signal (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  title       TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT 'reddit',
  subreddits  TEXT,              -- comma separated; empty = search all
  keywords    TEXT NOT NULL,     -- comma separated
  geo_terms   TEXT,              -- comma separated; used to boost/penalise locality
  window      TEXT NOT NULL DEFAULT 'week',  -- hour|day|week|month|year|all
  enabled     INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_result TEXT
);

CREATE TABLE IF NOT EXISTS event (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  lead_id    INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  detail     TEXT
);

CREATE INDEX IF NOT EXISTS lead_status   ON lead(status);
CREATE INDEX IF NOT EXISTS lead_temp     ON lead(temperature);
CREATE INDEX IF NOT EXISTS event_lead    ON event(lead_id);
`);

// Added after the first seeded databases existed, so widen in place rather than
// making anyone delete their data.
for (const [col, type] of [['draft_reply', 'TEXT'], ['draft_caution', 'TEXT'],
                           ['draft_at', 'TEXT'], ['drafted_by', 'TEXT']]) {
  const present = db.prepare('PRAGMA table_info(lead)').all().some((c) => c.name === col);
  if (!present) db.exec(`ALTER TABLE lead ADD COLUMN ${col} ${type}`);
}

const now = () => new Date().toISOString();

export function logEvent(leadId, kind, detail = null) {
  db.prepare('INSERT INTO event (at, lead_id, kind, detail) VALUES (?,?,?,?)')
    .run(now(), leadId, kind, detail);
}

// Returns the new lead id, or null when source_ref was already present.
// Callers rely on the null to count duplicates rather than re-scoring them.
export function insertLead(lead) {
  const cols = ['created_at','source','source_ref','author','raw_text','posted_at',
                'location_text','name','phone','email','consent','consent_note','status'];
  const row = {
    created_at: now(),
    status: 'new',
    consent: 'none',
    ...lead,
  };
  try {
    const r = db.prepare(
      `INSERT INTO lead (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    ).run(...cols.map((c) => row[c] ?? null));
    const id = Number(r.lastInsertRowid);
    logEvent(id, 'captured', `from ${row.source}`);
    return id;
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return null;
    throw e;
  }
}

export function saveScore(id, s) {
  db.prepare(`UPDATE lead SET temperature=?, intent=?, urgency=?, signals=?,
              concerns=?, reasoning=?, scored_by=?, scored_at=? WHERE id=?`)
    .run(s.temperature, s.intent, s.urgency, JSON.stringify(s.signals ?? []),
         JSON.stringify(s.concerns ?? []), s.reasoning ?? '', s.scored_by, now(), id);
  logEvent(id, 'scored', `${s.temperature} · intent ${s.intent} · by ${s.scored_by}`);
}

export function saveDraft(id, d) {
  db.prepare('UPDATE lead SET draft_reply=?, draft_caution=?, draft_at=?, drafted_by=? WHERE id=?')
    .run(d.reply, d.caution || '', now(), d.drafted_by, id);
  logEvent(id, 'draft', `reply drafted by ${d.drafted_by}`);
}

export function listLeads({ status, temperature, source } = {}) {
  const where = [], args = [];
  if (status)      { where.push('status = ?');      args.push(status); }
  if (temperature) { where.push('temperature = ?'); args.push(temperature); }
  if (source)      { where.push('source = ?');      args.push(source); }
  const sql = `SELECT * FROM lead ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE temperature WHEN 'hot' THEN 0 WHEN 'warm' THEN 1
                              WHEN 'mild' THEN 2 ELSE 3 END,
             intent DESC, created_at DESC`;
  return db.prepare(sql).all(...args);
}

export const getLead    = (id) => db.prepare('SELECT * FROM lead WHERE id=?').get(id);
export const leadEvents = (id) => db.prepare('SELECT * FROM event WHERE lead_id=? ORDER BY id DESC').all(id);
export const unscored   = ()   => db.prepare('SELECT * FROM lead WHERE scored_at IS NULL').all();

export function updateLead(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  db.prepare(`UPDATE lead SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`)
    .run(...keys.map((k) => fields[k]), id);
}

export const listSignals = () => db.prepare('SELECT * FROM signal ORDER BY id DESC').all();
export const getSignal   = (id) => db.prepare('SELECT * FROM signal WHERE id=?').get(id);

export function insertSignal(s) {
  const r = db.prepare(`INSERT INTO signal (created_at,title,platform,subreddits,keywords,geo_terms,window,enabled)
                        VALUES (?,?,?,?,?,?,?,?)`)
    .run(now(), s.title, s.platform ?? 'reddit', s.subreddits ?? '', s.keywords,
         s.geo_terms ?? '', s.window ?? 'week', s.enabled === false ? 0 : 1);
  return Number(r.lastInsertRowid);
}

export function markSignalRun(id, result) {
  db.prepare('UPDATE signal SET last_run_at=?, last_result=? WHERE id=?').run(now(), result, id);
}

export const stats = () => ({
  total: db.prepare('SELECT COUNT(*) c FROM lead').get().c,
  hot:   db.prepare("SELECT COUNT(*) c FROM lead WHERE temperature='hot'").get().c,
  warm:  db.prepare("SELECT COUNT(*) c FROM lead WHERE temperature='warm'").get().c,
  new:   db.prepare("SELECT COUNT(*) c FROM lead WHERE status='new'").get().c,
  appts: db.prepare("SELECT COUNT(*) c FROM lead WHERE status='appointment'").get().c,
});
