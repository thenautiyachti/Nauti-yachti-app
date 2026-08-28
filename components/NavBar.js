"use client";

import Link from "next/link";

const LINK_STYLE = { color: "var(--text)", textDecoration: "none" };

export default function NavBar() {
  return (
    <div
      style={{
        position: "sticky", top: 0, zIndex: 20, background: "rgba(10,6,18,0.94)", backdropFilter: "blur(4px)",
        color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", borderBottom: "1px solid rgba(203,108,230,0.25)", flexWrap: "wrap", gap: 12,
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <img src="/small-logo.jpg" alt="" style={{ width: 32, height: 32, borderRadius: 6 }} />
        <div className="display" style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>THE NAUTI YACHTI</div>
      </Link>
      <div style={{ display: "flex", gap: 16, fontSize: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/#packages" style={LINK_STYLE}>Packages</Link>
        <Link href="/#availability" style={LINK_STYLE}>Availability</Link>
        <Link href="/#gallery" style={LINK_STYLE}>Gallery</Link>
        <Link href="/about" style={LINK_STYLE}>About</Link>
        <Link href="/events" style={LINK_STYLE}>Events</Link>
        <Link href="/#inquire" style={LINK_STYLE}>Book</Link>
        <Link href="/privacy-policy" style={LINK_STYLE}>Privacy Policy</Link>
        <Link
          href="/admin"
          style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}
        >
          Owner console
        </Link>
      </div>
    </div>
  );
}
