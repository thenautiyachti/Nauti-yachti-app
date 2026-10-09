"use client";
// "Add time" on a booked website or direct charter (lib/extendBooking.js).
// Asks how many extra hours, creates the separate charge, then offers the
// ready-made text with its /pay link: tap to text on a phone, copy elsewhere.
import { useState } from "react";
import { smsHref } from "../lib/reviews";

const PLATFORM_ONLY = ["Boatsetter", "GetMyBoat", "GetmyBoat"];

export default function AddTimeButton({ row, canSendSms, onCreated }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  if (!row || row.status !== "booked" || PLATFORM_ONLY.includes(row.platform)) return null;

  async function add() {
    const answer = window.prompt(`Add how many hours to ${row.guestName || "this charter"}? (now ${row.hours || "?"} h)`, "1");
    if (answer == null) return;
    const extra = Number(answer);
    if (!Number.isInteger(extra) || extra < 1) { window.alert("Please enter a whole number of hours, 1 or more."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/extend-booking", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, extraHours: extra }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { window.alert(d.error || "Could not add time."); return; }
      setResult(d);
      if (onCreated) onCreated();
    } finally { setBusy(false); }
  }

  const btn = { background: "transparent", color: "#4ff3ff", border: "1px solid rgba(79,243,255,0.6)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" };
  if (result) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "#4ff3ff", whiteSpace: "nowrap" }}>+${result.amount} charge ready</span>
        {result.phone && canSendSms
          ? <a href={smsHref(result.phone, result.text)} style={{ ...btn, textDecoration: "none" }}>Text pay link</a>
          : <button type="button" style={btn} onClick={() => { navigator.clipboard?.writeText(result.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? "Copied" : "Copy text + link"}
            </button>}
      </span>
    );
  }
  return (
    <button type="button" onClick={add} disabled={busy} style={btn}
      title="Extend this charter and charge only the difference, through its own pay link">
      {busy ? "Working…" : "Add time"}
    </button>
  );
}
