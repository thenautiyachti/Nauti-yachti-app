"use client";

// The agency console's front door.
//
// Behind the same admin session as everything else, and not only because the
// figures are private. Clause 10 of the Inner Wifi Sales Agreement forbids
// making the licensed material publicly available, and the records this console
// reads include performers' compliance status and payout details. There is no
// version of this page that is safe to serve to an unauthenticated visitor, so
// it checks first and renders nothing until it knows.

import { useState, useEffect } from "react";
import AgencyConsole from "../../../components/AgencyConsole";

export default function AgencyPage() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" })
      .then((res) => setAuthed(res.ok))
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ink)", color: "var(--muted)", display: "grid", placeItems: "center" }}>
        Checking…
      </div>
    );
  }

  // Sent to the existing login rather than given a second passcode form. One
  // session, one place to sign in — a console with its own login is a console
  // whose logout nobody remembers to wire up.
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--ink)", color: "var(--text)", display: "grid", placeItems: "center", gap: 14, textAlign: "center", padding: 24 }}>
        <div>
          <p style={{ marginBottom: 14 }}>This console needs an admin session.</p>
          <a className="console-btn" href="/admin">Sign in</a>
        </div>
      </div>
    );
  }

  return <AgencyConsole />;
}
