"use client";

import Link from "next/link";

const LINK_STYLE = { color: "var(--text)", textDecoration: "none" };

export default function NavBar() {
  return (
    <div
      style={{
        position: "sticky", top: 0, zIndex: 20, background: "rgba(10,6,18,0.94)", backdropFilter: "blur(4px)",
        color: "var(--text)", borderBottom: "1px solid rgba(203,108,230,0.25)",
        padding: "14px 24px", display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <img src="/small-logo.jpg" alt="" style={{ width: 32, height: 32, borderRadius: 6 }} />
          <div className="display" style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>THE NAUTI YACHTI</div>
        </Link>
        <Link
          href="/admin"
          style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          Owner console
        </Link>
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 14, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/#packages" style={LINK_STYLE}>Packages</Link>
        <Link href="/#availability" style={LINK_STYLE}>Availability</Link>
        <Link href="/#gallery" style={LINK_STYLE}>Gallery</Link>
        <Link href="/about" style={LINK_STYLE}>About</Link>
        <Link href="/events" style={LINK_STYLE}>Events</Link>
        {/* Highlighted while the glow party is the live campaign — it's the
            only dated, sellable event on the site and needs to be reachable
            from every page in one tap. */}
        <Link href="/glow" style={{ ...LINK_STYLE, color: "var(--pink)", fontWeight: 700 }}>Boatz &amp; Glowz</Link>
        <Link href="/#inquire" style={LINK_STYLE}>Book</Link>
        <Link href="/privacy-policy" style={LINK_STYLE}>Privacy Policy</Link>
        <Link href="/terms" style={LINK_STYLE}>Terms & Cancellation Policy</Link>
      </div>
    </div>
  );
}
