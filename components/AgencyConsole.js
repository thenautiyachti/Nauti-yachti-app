"use client";

// The agency console.
//
// A SEPARATE SCREEN FROM THE OWNER CONSOLE, deliberately. The charter business
// and the agency share a login and nothing else, and the one thing that must
// never happen is a figure from one appearing in a total belonging to the
// other: clause 4 of the Inner Wifi Sales Agreement takes 2.5% of agency
// revenue, so a charter dollar that wandered into an agency total is 2.5 cents
// handed over forever. Two consoles make that mistake hard to make by accident.
//
// Everything here reads from a single /api/agency/report call. One request
// rather than eight, because every number on this page comes out of the same
// settlement — fetching them separately would let the payout run and the
// royalty disagree on screen, computed moments apart from a table that changed
// in between.

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatCents, formatBp } from "../lib/agency/money";

const TABS = [
  ["month", "The month"],
  ["media", "Media owed"],
  ["creators", "Creators"],
  ["payouts", "Payouts"],
  ["compliance", "Compliance"],
  ["royalty", "InnerWifi"],
];

const panel = {
  background: "var(--card)",
  border: "1px solid rgba(203,108,230,0.18)",
  borderRadius: 10,
  padding: 16,
};
const th = {
  textAlign: "left",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--muted)",
  padding: "6px 10px",
  borderBottom: "1px solid rgba(203,108,230,0.18)",
  whiteSpace: "nowrap",
};
const td = { padding: "8px 10px", borderBottom: "1px solid rgba(203,108,230,0.08)", fontSize: 14 };
const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

function Money({ cents, bold }) {
  const negative = cents < 0;
  return (
    <span style={{ color: negative ? "var(--pink)" : "inherit", fontWeight: bold ? 700 : 500 }}>
      {formatCents(cents)}
    </span>
  );
}

function Tag({ tone, children }) {
  const tones = {
    good: ["rgba(90,200,140,0.15)", "#7FD9A6"],
    warn: ["rgba(240,180,85,0.15)", "#F0C05A"],
    bad: ["rgba(240,85,156,0.15)", "var(--pink)"],
    flat: ["rgba(203,108,230,0.12)", "var(--muted)"],
  };
  const [bg, fg] = tones[tone] || tones.flat;
  return (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: "2px 9px", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Empty({ children }) {
  return <p style={{ color: "var(--muted)", fontSize: 14, margin: "10px 2px" }}>{children}</p>;
}

// --- the waterfall -----------------------------------------------------------

// Every step from what the fans paid to what the two partners draw, as one
// column you read downward. Shown as a ladder rather than four summary tiles
// because the ORDER is the thing people get wrong — the royalty comes out
// before the partners, not after, and a tile grid lets you forget that.
function Waterfall({ settlement }) {
  const { royalty } = settlement;
  const fanGross = settlement.perCreator.reduce((s, c) => s + c.grossCents, 0);
  const platformFee = settlement.perCreator.reduce((s, c) => s + c.platformFeeCents, 0);

  const steps = [
    ["Fans paid", fanGross, null],
    ["Platform fees", -platformFee, "OnlyFans' cut, before anything here"],
    ["Creators' share", -settlement.creatorOwedCents, "what they keep, per their deal"],
    ["Agency commission", settlement.agencyGrossCents, null, true],
    ["Agency costs", -settlement.agencyExpenseCents, "chatters, ads, software"],
    ["Agency net profit", settlement.agencyNetProfitCents, null, true],
    ["InnerWifi royalty", -royalty.amountCents, `clause 4 — ${formatBp(royalty.rateBp)} of ${royalty.basis === "net_profit" ? "net profit" : "revenue"}`],
    ["Left to divide", settlement.distributableCents, null, true],
  ];

  return (
    <div style={panel}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Where the money went</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {steps.map(([label, cents, hint, emphasis]) => (
            <tr key={label} style={emphasis ? { background: "rgba(203,108,230,0.06)" } : undefined}>
              <td style={{ ...td, fontWeight: emphasis ? 700 : 400 }}>
                {label}
                {hint && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{hint}</div>}
              </td>
              <td style={{ ...num, fontWeight: emphasis ? 700 : 500 }}>
                <Money cents={cents} bold={emphasis} />
              </td>
            </tr>
          ))}
          {settlement.partnerDraws.map((draw) => (
            <tr key={draw.partner}>
              <td style={{ ...td, paddingLeft: 26, color: "var(--muted)" }}>
                {draw.name} · {formatBp(draw.shareBp)}
              </td>
              <td style={num}><Money cents={draw.amountCents} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The dollar cost of six ambiguous words, every month.
//
// This panel exists to make an abstract contract problem concrete. "2.5% Net
// Profit Share Of Agency Revenue" names two different numbers, and the gap
// between them is not a drafting curiosity — it is a figure, it recurs monthly,
// and it compounds for as long as the clause stands, which as signed is
// forever. Putting it on the dashboard is the difference between a note in a
// review document and somebody actually calling a lawyer.
function AmbiguityPanel({ royalty }) {
  if (!royalty) return null;
  const chosen = royalty.basis === "net_profit" ? "net profit" : "gross revenue";
  const other = royalty.basis === "net_profit" ? "gross revenue" : "net profit";

  return (
    <div style={{ ...panel, borderColor: royalty.ambiguityCents > 0 ? "rgba(240,192,90,0.4)" : panel.border }}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Clause 4 is unresolved</h3>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 12px", lineHeight: 1.5 }}>
        The agreement says &ldquo;2.5% Net Profit Share Of Agency Revenue&rdquo;, which names
        two different numbers. We are paying on <strong style={{ color: "var(--text)" }}>{chosen}</strong>.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={td}>On {chosen} <Tag tone="flat">paying</Tag></td>
            <td style={num}><Money cents={royalty.amountCents} bold /></td>
          </tr>
          <tr>
            <td style={td}>On {other}</td>
            <td style={num}><Money cents={royalty.alternateAmountCents} /></td>
          </tr>
          <tr>
            <td style={{ ...td, fontWeight: 700 }}>Difference this month</td>
            <td style={num}><Money cents={royalty.ambiguityCents} bold /></td>
          </tr>
          <tr>
            <td style={{ ...td, color: "var(--muted)" }}>At this rate, a year</td>
            <td style={{ ...num, color: "var(--muted)" }}>{formatCents(royalty.ambiguityCents * 12)}</td>
          </tr>
        </tbody>
      </table>
      <p style={{ color: "var(--muted)", fontSize: 12, margin: "12px 0 0", lineHeight: 1.5 }}>
        Clause 19 means this only changes in a writing signed by both sides. See
        <code style={{ margin: "0 4px" }}>docs/inner-wifi-agreement-review.md</code>, item 1.
      </p>
    </div>
  );
}

// --- the month ---------------------------------------------------------------

function MonthTab({ report }) {
  const { settlement, counts } = report;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {settlement.warnings.length > 0 && (
        <div style={{ ...panel, borderColor: "rgba(240,85,156,0.4)" }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Worth looking at</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
            {settlement.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <Waterfall settlement={settlement} />
        <AmbiguityPanel royalty={settlement.royalty} />
      </div>

      <div style={panel}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>By creator</h3>
        {settlement.perCreator.length === 0 ? (
          <Empty>No earnings imported for this month yet.</Empty>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={th}>Creator</th>
                  <th style={th}>Deal</th>
                  <th style={{ ...th, textAlign: "right" }}>Fans paid</th>
                  <th style={{ ...th, textAlign: "right" }}>Reached account</th>
                  <th style={{ ...th, textAlign: "right" }}>Creator keeps</th>
                  <th style={{ ...th, textAlign: "right" }}>Agency keeps</th>
                </tr>
              </thead>
              <tbody>
                {settlement.perCreator.map((row) => (
                  <tr key={row.creatorId}>
                    <td style={td}>{row.stageName}</td>
                    <td style={td}>
                      <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
                        {formatBp(row.creatorShareBp)} of {row.splitBasis}
                      </span>
                    </td>
                    <td style={num}>{formatCents(row.grossCents)}</td>
                    <td style={num}>{formatCents(row.netCents)}</td>
                    <td style={num}>{formatCents(row.creatorCents)}</td>
                    <td style={num}><Money cents={row.agencyCents} bold /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", color: "var(--muted)", fontSize: 13 }}>
        <span>{counts.activeCreators} active of {counts.creators} creators</span>
        <span>{counts.liveAccounts} live of {counts.accounts} accounts</span>
        <span>{counts.openRequests} open content requests</span>
        {counts.blockedCreators > 0 && <Tag tone="bad">{counts.blockedCreators} blocked on paperwork</Tag>}
      </div>
    </div>
  );
}

// --- media owed --------------------------------------------------------------

function MediaTab({ report }) {
  const { chase, cadence } = report;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={panel}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Who we are waiting on</h3>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 14px" }}>
          One row per person, most overdue first. Send the message yourself —
          this list does not chase anybody automatically.
        </p>
        {chase.length === 0 ? (
          <Empty>Nothing outstanding. Every open request is inside its due date.</Empty>
        ) : (
          chase.map((entry) => (
            <div key={entry.creatorId} style={{ padding: "12px 0", borderTop: "1px solid rgba(203,108,230,0.12)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 15 }}>{entry.stageName || entry.creatorId}</strong>
                {entry.worstDaysLate > 0 && (
                  <Tag tone={entry.worstDaysLate > 7 ? "bad" : "warn"}>
                    {entry.worstDaysLate} day{entry.worstDaysLate === 1 ? "" : "s"} late
                  </Tag>
                )}
                {entry.urgentCount > 0 && <Tag tone="bad">{entry.urgentCount} urgent</Tag>}
                {entry.inReview.length > 0 && <Tag tone="flat">{entry.inReview.length} waiting on us</Tag>}
              </div>
              <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                {entry.overdue.map((item) => (
                  <div key={item.id} style={{ fontSize: 13.5 }}>
                    <span style={{ color: "var(--pink)" }}>●</span>{" "}
                    {item.quantity}× {item.title}
                    <span style={{ color: "var(--muted)" }}> — due {item.dueOn}, {item.daysLate}d late</span>
                  </div>
                ))}
                {entry.dueSoon.map((item) => (
                  <div key={item.id} style={{ fontSize: 13.5 }}>
                    <span style={{ color: "#F0C05A" }}>●</span>{" "}
                    {item.quantity}× {item.title}
                    <span style={{ color: "var(--muted)" }}> — due {item.dueOn}</span>
                  </div>
                ))}
                {entry.inReview.map((item) => (
                  <div key={item.id} style={{ fontSize: 13.5, color: "var(--muted)" }}>
                    <span>○</span> {item.quantity}× {item.title} — delivered, waiting on our review
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={panel}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Posting cadence</h3>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 12px" }}>
          Approved content over the last 28 days against what the cadence implies.
        </p>
        {cadence.length === 0 ? (
          <Empty>No live accounts yet.</Empty>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Account</th>
                <th style={{ ...th, textAlign: "right" }}>Expected</th>
                <th style={{ ...th, textAlign: "right" }}>Delivered</th>
                <th style={{ ...th, textAlign: "right" }}>Short by</th>
              </tr>
            </thead>
            <tbody>
              {cadence.map((row) => (
                <tr key={row.accountId}>
                  <td style={td}>@{row.handle}</td>
                  <td style={num}>{row.expected}</td>
                  <td style={num}>{row.actual}</td>
                  <td style={num}>
                    {row.deficit > 0 ? <Tag tone={row.deficit > row.expected / 2 ? "bad" : "warn"}>{row.deficit}</Tag> : <Tag tone="good">on track</Tag>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- payouts -----------------------------------------------------------------

function PayoutsTab({ report, onAction, busy }) {
  const { payoutPlan } = report;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        {[
          ["Ready to send", payoutPlan.readyCents, "good"],
          ["Held on paperwork", payoutPlan.heldCents, payoutPlan.heldCents > 0 ? "bad" : "flat"],
          ["Carried to next month", payoutPlan.deferredCents, "flat"],
          ["Already sent", payoutPlan.sentCents, "flat"],
        ].map(([label, cents, tone]) => (
          <div key={label} style={panel}>
            <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
              <Money cents={cents} bold />
            </div>
            {tone === "bad" && <div style={{ marginTop: 6 }}><Tag tone="bad">{payoutPlan.heldCount} to clear</Tag></div>}
          </div>
        ))}
      </div>

      <div style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>The run for {report.period}</h3>
          <button className="console-btn" disabled={busy} onClick={() => onAction("payouts")}>
            Write this run
          </button>
        </div>
        {payoutPlan.rows.length === 0 ? (
          <Empty>Nothing to pay for this month.</Empty>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={th}>Creator</th>
                  <th style={{ ...th, textAlign: "right" }}>Earned</th>
                  <th style={{ ...th, textAlign: "right" }}>Carried in</th>
                  <th style={{ ...th, textAlign: "right" }}>Due</th>
                  <th style={th}>State</th>
                </tr>
              </thead>
              <tbody>
                {payoutPlan.rows.map((row) => (
                  <tr key={row.creatorId}>
                    <td style={td}>
                      {row.stageName}
                      {row.method && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{row.method} · {row.handle}</div>}
                    </td>
                    <td style={num}>{formatCents(row.earnedCents)}</td>
                    <td style={num}>{row.carriedCents ? formatCents(row.carriedCents) : "—"}</td>
                    <td style={num}><Money cents={row.dueCents} bold /></td>
                    <td style={td}>
                      <Tag tone={{ ready: "good", held: "bad", deferred: "warn", sent: "flat" }[row.status]}>
                        {row.status}
                      </Tag>
                      {row.reason && (
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, maxWidth: 380, lineHeight: 1.45 }}>
                          {row.reason}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- compliance --------------------------------------------------------------

function ComplianceTab({ report }) {
  const blocked = report.compliance.filter((c) => !c.payable);
  const clear = report.compliance.filter((c) => c.payable);
  const expiring = report.compliance.filter((c) => c.expiringSoon && c.expiringSoon.length);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ ...panel, borderColor: blocked.length ? "rgba(240,85,156,0.35)" : panel.border }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Blocked</h3>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 12px", lineHeight: 1.5 }}>
          Nothing publishes and nobody is paid without a verified ID, a signed release
          and a tax form. 18 U.S.C. § 2257 puts the record-keeping duty on the producer,
          which here is this business, not the creator.
        </p>
        {blocked.length === 0 ? (
          <Empty>Everyone&rsquo;s paperwork is in order.</Empty>
        ) : (
          blocked.map((c) => (
            <div key={c.creatorId} style={{ padding: "10px 0", borderTop: "1px solid rgba(203,108,230,0.12)" }}>
              <strong style={{ fontSize: 14.5 }}>{c.stageName}</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>
                {c.payBlockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          ))
        )}
      </div>

      {expiring.length > 0 && (
        <div style={{ ...panel, borderColor: "rgba(240,192,90,0.35)" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Lapsing within 30 days</h3>
          {expiring.map((c) => (
            <div key={c.creatorId} style={{ fontSize: 13.5, padding: "4px 0" }}>
              <strong>{c.stageName}</strong>
              {c.expiringSoon.map((e) => (
                <span key={e.kind} style={{ color: "var(--muted)" }}> — {e.label} expires {e.expiresOn} ({e.days}d)</span>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={panel}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Cleared ({clear.length})</h3>
        {clear.length === 0 ? <Empty>Nobody yet.</Empty> : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {clear.map((c) => <Tag key={c.creatorId} tone="good">{c.stageName}</Tag>)}
          </div>
        )}
      </div>
    </div>
  );
}

// --- creators ----------------------------------------------------------------

function CreatorsTab({ report }) {
  const byId = useMemo(
    () => new Map(report.settlement.perCreator.map((c) => [c.creatorId, c])),
    [report]
  );

  return (
    <div style={panel}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Everybody on the books</h3>
      {report.compliance.length === 0 ? (
        <Empty>No creators yet.</Empty>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr>
                <th style={th}>Creator</th>
                <th style={th}>Status</th>
                <th style={th}>Paperwork</th>
                <th style={{ ...th, textAlign: "right" }}>Earned this month</th>
              </tr>
            </thead>
            <tbody>
              {report.compliance.map((c) => {
                const line = byId.get(c.creatorId);
                return (
                  <tr key={c.creatorId}>
                    <td style={td}>{c.stageName}</td>
                    <td style={td}><Tag tone={c.status === "active" ? "good" : "flat"}>{c.status}</Tag></td>
                    <td style={td}>
                      {c.payable
                        ? <Tag tone="good">clear</Tag>
                        : <Tag tone="bad">{c.payBlockers.length} outstanding</Tag>}
                    </td>
                    <td style={num}>{line ? formatCents(line.creatorCents) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- InnerWifi ---------------------------------------------------------------

function RoyaltyTab({ report, royalty, onAction, busy }) {
  const s = report.settlement.royalty;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>What {report.period} owes</h3>
          <button className="console-btn" disabled={busy} onClick={() => onAction("royalty")}>
            Close this month
          </button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={td}>Revenue the royalty attaches to</td><td style={num}>{formatCents(s.coveredRevenueCents)}</td></tr>
            <tr><td style={td}>Its share of costs</td><td style={num}>{formatCents(s.coveredExpenseCents)}</td></tr>
            <tr><td style={td}>Profit on that revenue</td><td style={num}><Money cents={s.coveredProfitCents} /></td></tr>
            <tr style={{ background: "rgba(203,108,230,0.06)" }}>
              <td style={{ ...td, fontWeight: 700 }}>Owed at {formatBp(s.rateBp)}</td>
              <td style={num}><Money cents={s.amountCents} bold /></td>
            </tr>
          </tbody>
        </table>
        {s.expired && (
          <p style={{ marginTop: 10 }}><Tag tone="good">The royalty has ended — an addendum put a date on it.</Tag></p>
        )}
      </div>

      <div style={panel}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Months closed</h3>
        {!royalty || royalty.remittances.length === 0 ? (
          <Empty>No month has been closed yet.</Empty>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Month</th>
                  <th style={th}>Basis</th>
                  <th style={{ ...th, textAlign: "right" }}>Paid</th>
                  <th style={{ ...th, textAlign: "right" }}>Other reading</th>
                  <th style={th}>State</th>
                </tr>
              </thead>
              <tbody>
                {royalty.remittances.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{r.period}</td>
                    <td style={td}><span style={{ color: "var(--muted)", fontSize: 12.5 }}>{r.basis.replace("_", " ")}</span></td>
                    <td style={num}>{formatCents(r.amountCents)}</td>
                    <td style={{ ...num, color: "var(--muted)" }}>{formatCents(r.alternateAmountCents)}</td>
                    <td style={td}><Tag tone={r.status === "sent" ? "good" : "warn"}>{r.status}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 14, lineHeight: 1.6 }}>
              Outstanding: <strong style={{ color: "var(--text)" }}>{formatCents(royalty.owedCents)}</strong>.
              The two readings of clause 4 have differed by{" "}
              <strong style={{ color: "var(--text)" }}>{formatCents(royalty.ambiguityToDateCents)}</strong> across
              every month closed so far.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// --- the console -------------------------------------------------------------

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options && options.headers) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed: ${path} (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function monthsAround(count) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function AgencyConsole() {
  const months = useMemo(() => monthsAround(13), []);
  const [period, setPeriod] = useState(months[0]);
  const [tab, setTab] = useState("month");
  const [report, setReport] = useState(null);
  const [royalty, setRoyalty] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (which) => {
    setError("");
    try {
      const [r, roy] = await Promise.all([
        api(`/api/agency/report?period=${encodeURIComponent(which)}`),
        api("/api/agency/royalty").catch(() => null),
      ]);
      setReport(r);
      setRoyalty(roy);
    } catch (e) {
      // A 401 here means the admin session went, not that the agency is broken.
      // Saying so is the difference between signing back in and filing a bug.
      setError(e.status === 401 ? "Your session has expired. Sign in again." : e.message);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const act = useCallback(async (what) => {
    setBusy(true);
    setError("");
    try {
      if (what === "payouts") await api("/api/agency/payouts", { method: "POST", body: JSON.stringify({ period }) });
      if (what === "royalty") await api("/api/agency/royalty", { method: "POST", body: JSON.stringify({ period }) });
      await load(period);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [period, load]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink)", color: "var(--text)" }}>
      <div style={{ background: "var(--ink-soft)", padding: "14px 24px", borderBottom: "1px solid rgba(203,108,230,0.2)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div className="display" style={{ fontSize: 20, fontWeight: 700 }}>AGENCY CONSOLE</div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="mono"
          style={{ background: "var(--card)", color: "var(--text)", border: "1px solid rgba(203,108,230,0.3)", borderRadius: 6, padding: "7px 10px", fontSize: 13 }}
        >
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <a className="console-btn" href="/admin">← Charter console</a>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "12px 24px 0", flexWrap: "wrap" }}>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="console-btn"
            style={{
              background: tab === key ? "rgba(203,108,230,0.22)" : "transparent",
              border: "1px solid rgba(203,108,230,0.25)",
              color: "var(--text)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: 24 }}>
        {error && (
          <div style={{ ...panel, borderColor: "rgba(240,85,156,0.5)", marginBottom: 16 }}>{error}</div>
        )}
        {!report ? (
          <p style={{ color: "var(--muted)" }}>Loading {period}…</p>
        ) : (
          <>
            {tab === "month" && <MonthTab report={report} />}
            {tab === "media" && <MediaTab report={report} />}
            {tab === "creators" && <CreatorsTab report={report} />}
            {tab === "payouts" && <PayoutsTab report={report} onAction={act} busy={busy} />}
            {tab === "compliance" && <ComplianceTab report={report} />}
            {tab === "royalty" && <RoyaltyTab report={report} royalty={royalty} onAction={act} busy={busy} />}
          </>
        )}
      </div>
    </div>
  );
}
