import Link from "next/link";

const LINK = { color: "var(--purple)", textDecoration: "none" };

// The legal links live here rather than in the navigation bar.
//
// They used to sit in the nav, which became a problem when that bar was made
// genuinely sticky: "Privacy Policy" and "Terms & Cancellation Policy" are the
// two longest labels on the site, and holding them on screen permanently cost a
// whole wrapped row on every phone. The footer is also where a visitor looks
// for them, so this is the conventional home rather than a compromise.
//
// They must stay reachable from every page — the site takes card payments —
// and this component is rendered on every page, so they are.
export default function PageFooter() {
  return (
    <div
      style={{
        background: "var(--ink)", color: "var(--purple)", textAlign: "center",
        padding: "18px", fontSize: 12.5, borderTop: "1px solid rgba(203,108,230,0.2)",
        display: "flex", flexDirection: "column", gap: 8, alignItems: "center",
      }}
    >
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <Link href="/privacy-policy" style={LINK}>Privacy Policy</Link>
        <Link href="/terms" style={LINK}>Terms &amp; Cancellation Policy</Link>
        <Link href="/faq" style={LINK}>FAQ</Link>
      </div>
      <div>© {new Date().getFullYear()} The Nauti Yachti — Lake Conroe, TX</div>
    </div>
  );
}
