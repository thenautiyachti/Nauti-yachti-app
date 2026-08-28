export default function PageFooter() {
  return (
    <div style={{ background: "var(--ink)", color: "var(--purple)", textAlign: "center", padding: "18px", fontSize: 12.5, borderTop: "1px solid rgba(203,108,230,0.2)" }}>
      © {new Date().getFullYear()} The Nauti Yachti — Lake Conroe, TX
    </div>
  );
}
