"use client";

// The console's last line of defence.
//
// WHY THIS FILE EXISTS. On 20 Sep 2026 one type error in one panel —
// daysSince() handed a string where it wanted a Date — threw on every render of
// the overview tab. React retried, threw again, and Chrome killed the tab
// outright: "This page couldn't load", on his phone and then on his desktop.
//
// That message is indistinguishable from a network fault or a dead server, so
// the morning went on the wrong things: the passcode, the session cookie, the
// deployment, whether the database was up. Every one of those was healthy. The
// console had simply crashed and had no way to say so.
//
// A route-level error boundary turns that into a sentence. The fault still has
// to be fixed, but it is now legible from the screen it happened on instead of
// requiring the Vercel log, the browser console and a good guess.
//
// Deliberately plain: no data, no fetches, nothing that could itself throw.
export default function AdminError({ error, reset }) {
  return (
    <div
      style={{
        minHeight: "100vh", background: "var(--ink)", color: "var(--text)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: 24, textAlign: "center",
      }}
    >
      <div className="display" style={{ fontSize: 24, marginBottom: 10 }}>
        The console hit an error
      </div>
      <p style={{ color: "var(--muted)", fontSize: 14.5, maxWidth: "46ch", lineHeight: 1.6, margin: "0 0 4px" }}>
        Nothing is lost and nothing is broken on the boats — this screen failed
        to draw. The bookings, the money and the calendar are all still there.
      </p>
      <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: "52ch", lineHeight: 1.6, margin: "0 0 18px" }}>
        Send the line below to Claude and it can be fixed properly.
      </p>

      {/* The actual message, which is the entire point of this screen. */}
      <code
        style={{
          display: "block", maxWidth: "min(92vw, 640px)", overflowX: "auto",
          background: "rgba(255,92,138,0.10)", border: "1px solid var(--pink)",
          borderRadius: 8, padding: "12px 14px", fontSize: 12.5, lineHeight: 1.5,
          color: "var(--text)", textAlign: "left", whiteSpace: "pre-wrap",
        }}
      >
        {String((error && error.message) || "Unknown error")}
        {error && error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </code>

      <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => reset()}
          style={{
            background: "var(--purple)", color: "#0A0612", border: "none",
            borderRadius: 6, padding: "10px 20px", fontWeight: 700, cursor: "pointer",
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            border: "1px solid rgba(203,108,230,0.35)", color: "var(--muted)",
            borderRadius: 6, padding: "10px 20px", fontWeight: 600, textDecoration: "none",
          }}
        >
          Back to site
        </a>
      </div>
    </div>
  );
}
