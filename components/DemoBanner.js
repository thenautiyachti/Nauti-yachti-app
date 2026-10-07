// Shown on every page of the demo deployment only (app/layout.js). It says
// plainly that nothing here is real, so a prospect never mistakes a sample
// guest or a sample price for this business's.
export default function DemoBanner() {
  return (
    <div
      role="note"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        background: "#E8934A",
        color: "#10151c",
        textAlign: "center",
        font: "600 13px/1.4 'Work Sans', system-ui, sans-serif",
        padding: "6px 12px",
        letterSpacing: "0.02em",
      }}
    >
      DEMO SITE · every name, price, booking and figure here is invented · payments use Stripe test cards only (4242 4242 4242 4242)
    </div>
  );
}
