"use client";

import Link from "next/link";
import { version as APP_VERSION } from "../package.json";

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
        {/* The version sits under the console button, matching the badge in the
            console itself so both places name the same release. Read from
            package.json, which VERSIONING.md makes the single source of truth
            and check-consistency.js asserts against the git tag and the release
            archive — so this can never drift on its own. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <Link
            href="/admin"
            style={{ background: "var(--purple)", color: "#0A0612", border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Owner console
          </Link>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: "0.04em" }}>
            v{APP_VERSION}
          </span>
        </div>
      </div>
      {/* nav-links: on a phone this row wrapped to three lines and made the bar
          151px tall — 19% of the screen, which is far too much to hold there
          permanently now that it actually sticks. Tighter gaps and type below
          600px bring it down without hiding any link. */}
      <div className="nav-links" style={{ display: "flex", gap: 16, fontSize: 14, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        {/* Points at the real /packages page rather than the /#packages anchor:
            an anchor is not a separate indexable URL, so the per-package pages
            need a genuine internal link from every page to be crawled. */}
        <Link href="/packages" style={LINK_STYLE}>Packages</Link>
        <Link href="/#availability" style={LINK_STYLE}>Availability</Link>
        <Link href="/#gallery" style={LINK_STYLE}>Gallery</Link>
        <Link href="/about" style={LINK_STYLE}>About</Link>
        <Link href="/faq" style={LINK_STYLE}>FAQ</Link>
        <Link href="/events" style={LINK_STYLE}>Events</Link>
        <Link href="/gift-certificates" style={LINK_STYLE}>Gift Cards</Link>
        {/* Highlighted while the glow party is the live campaign — it's the
            only dated, sellable event on the site and needs to be reachable
            from every page in one tap. */}
        <Link href="/glow" style={{ ...LINK_STYLE, color: "var(--pink)", fontWeight: 700 }}>Boatz &amp; Glowz</Link>
        <Link href="/#inquire" style={LINK_STYLE}>Book</Link>
        {/* Privacy Policy and Terms moved to PageFooter. They are the two
            longest labels on the site and cost a whole wrapped row on a phone,
            which is not a price worth paying in a bar that is now always on
            screen. The footer is where visitors look for them anyway, and it
            renders on every page, so they remain reachable site-wide. */}
      </div>
    </div>
  );
}
