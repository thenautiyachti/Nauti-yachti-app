// Turning an exported earnings statement into rows.
//
// WHY THIS IS AN IMPORT AND NOT A SYNC. OnlyFans publishes no third-party
// management API, and its terms do not permit automating access to an account
// you do not own. Every "OnlyFans API" on offer is a browser session being
// driven with borrowed credentials, and the penalty when it is noticed lands on
// the creator's account, not on the tool — which in this business means
// somebody's whole income, deleted, over a convenience feature.
//
// So the money arrives the way the money actually arrives: a human exports the
// statement, uploads the file, and this reads it. Slower, and it is the only
// version that does not put every managed account at risk.
//
// EVERY IMPORT CARRIES A BATCH ID. Statements get re-exported, re-uploaded, and
// uploaded twice by two people on the same afternoon. A batch id makes an
// import undoable as a unit, which is the difference between a five-second fix
// and an evening reconstructing a month by hand.

const { parseMoneyToCents } = require("./money");

// A CSV parser that understands quotes.
//
// Splitting on commas works until the first description field containing one —
// and statement descriptions are free text written by fans, so that is row one
// of most real files. The symptom is columns shifting right for that row alone,
// which lands a date string in the amount column and imports as zero.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  const source = String(text || "").replace(/^\uFEFF/, ""); // Excel's byte-order mark

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }

  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Header names differ between platforms, between exports, and between years of
// the same export. Matching on a set of known spellings rather than a fixed
// position means a column moving does not silently import the wrong number.
const COLUMN_ALIASES = {
  date: ["date", "datetime", "createdat", "transactiondate", "earneddate", "when"],
  kind: ["type", "kind", "category", "source", "description", "transactiontype"],
  gross: ["gross", "grossamount", "amount", "total", "grossrevenue", "fanpaid"],
  fee: ["fee", "fees", "platformfee", "commission", "servicefee", "ofcommission"],
  net: ["net", "netamount", "earnings", "yourearnings", "payout", "netrevenue"],
  ref: ["id", "transactionid", "reference", "ref", "externalid"],
};

function mapColumns(headerRow) {
  const normalized = headerRow.map(normalizeHeader);
  const map = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = normalized.findIndex((h) => aliases.includes(h));
    if (index !== -1) map[field] = index;
  }
  return map;
}

// Free-text descriptions to the kinds AgencyEarning stores. Subscriptions are
// the residual and everything else is not, so getting this wrong changes what
// the business looks like even when the totals are right.
function classifyKind(raw) {
  const text = String(raw || "").toLowerCase();
  if (/subscri|renew|rebill/.test(text)) return "subscription";
  if (/\btip/.test(text)) return "tip";
  if (/ppv|pay.?per.?view|unlock/.test(text)) return "ppv";
  if (/message|dm\b/.test(text)) return "message";
  if (/stream|live/.test(text)) return "stream";
  if (/referr/.test(text)) return "referral";
  return "other";
}

function normalizeDate(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // US-style M/D/YYYY, which is what a spreadsheet hands back after someone
  // opens the export to "just check it" and saves.
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

// Read a statement into rows ready for AgencyEarning, plus the rows that could
// not be read.
//
// REJECTED ROWS ARE RETURNED, NOT DROPPED. An importer that silently skips what
// it cannot parse produces a clean-looking import that is quietly short by
// whatever it skipped, and the shortfall surfaces weeks later as a creator
// whose payout does not match their own screenshot. Every rejection carries its
// line number and its reason so the file can be fixed and re-run.
function parseStatement(text, { accountId, platformFeeBp = 2000, importBatch = null } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { entries: [], rejected: [], error: "The file has no data rows." };
  }

  const columns = mapColumns(rows[0]);
  const missing = ["date"].filter((f) => columns[f] === undefined);
  if (missing.length || (columns.gross === undefined && columns.net === undefined)) {
    return {
      entries: [],
      rejected: [],
      error:
        `Could not find the columns this needs. Wanted a date column and at least one of ` +
        `gross or net. Saw: ${rows[0].join(", ")}`,
    };
  }

  const entries = [];
  const rejected = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 1;
    const cell = (field) => (columns[field] === undefined ? null : row[columns[field]]);

    const earnedOn = normalizeDate(cell("date"));
    if (!earnedOn) {
      rejected.push({ line, reason: `Unreadable date: "${cell("date")}"`, row });
      continue;
    }

    let grossCents = parseMoneyToCents(cell("gross"));
    let netCents = parseMoneyToCents(cell("net"));
    let feeCents = parseMoneyToCents(cell("fee"));

    // Statements vary in which two of the three they print. Derive the third
    // from whichever pair is present, and take the fee rate as the fallback
    // only when the file gives a single figure.
    if (grossCents === null && netCents === null) {
      rejected.push({ line, reason: "No readable amount in this row.", row });
      continue;
    }
    if (grossCents !== null && netCents !== null && feeCents === null) {
      feeCents = grossCents - netCents;
    } else if (grossCents !== null && netCents === null) {
      if (feeCents === null) feeCents = Math.round((grossCents * platformFeeBp) / 10000);
      netCents = grossCents - feeCents;
    } else if (grossCents === null && netCents !== null) {
      if (feeCents === null) {
        // Net is what remained after the fee, so grossing up divides rather
        // than multiplies. Applying the rate to the net instead understates the
        // gross by the fee on the fee — about 4% at a 20% rate, which is small
        // enough to look plausible on every single row.
        grossCents = Math.round((netCents * 10000) / (10000 - platformFeeBp));
        feeCents = grossCents - netCents;
      } else grossCents = netCents + feeCents;
    }

    // A refund or chargeback is a real negative row and imports as one. A zero
    // row is not worth a database write.
    if (grossCents === 0 && netCents === 0) {
      rejected.push({ line, reason: "Row is zero on every amount.", row });
      continue;
    }

    entries.push({
      accountId,
      period: earnedOn.slice(0, 7),
      kind: classifyKind(cell("kind")),
      grossCents,
      platformFeeCents: feeCents,
      netCents,
      earnedOn,
      importBatch,
      externalRef: cell("ref") ? String(cell("ref")).trim() : null,
    });
  }

  return { entries, rejected, error: null };
}

module.exports = { parseCsv, parseStatement, classifyKind, normalizeDate, mapColumns };
