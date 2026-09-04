// Warns when the manual PDF no longer matches the markdown it was built from.
//
// WHY THIS EXISTS. The Manual button in the console serves
// public/owner-console-manual.pdf, but every edit is made to
// owner-console-manual.md. Nothing connected the two, so the PDF drifted: at
// commissioning it was fourteen hours behind and still contained the line
// "Nothing is ever posted automatically" -- which is false, and false in the
// direction that costs money. The markdown had been corrected the night before.
// The owner would have read the wrong thing and had no way to know.
//
// WHY NOT COMPARE TIMESTAMPS. On Vercel every file is checked out at the same
// moment, so mtimes are identical and prove nothing. A content hash of the
// markdown is written beside the PDF when it is built, and compared here, which
// works the same locally and in CI.
//
// WHY NOT REBUILD AUTOMATICALLY. The PDF is produced by headless Edge, which
// exists on the owner's PC and not on a build server. A hook that silently
// failed there would be worse than this warning.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const APP = path.join(__dirname, "..");
const MD = path.join(APP, "owner-console-manual.md");
const PDF = path.join(APP, "public", "owner-console-manual.pdf");
const STAMP = path.join(APP, "public", "owner-console-manual.sha");

const hashOf = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16);

function check({ quiet = false } = {}) {
  if (!fs.existsSync(MD)) return { ok: true, reason: "no manual source" };
  if (!fs.existsSync(PDF)) return { ok: false, reason: "the PDF the console links to does not exist" };
  const now = hashOf(MD);
  const built = fs.existsSync(STAMP) ? fs.readFileSync(STAMP, "utf8").trim() : "";
  if (!built) return { ok: false, reason: "no build stamp — the PDF's provenance is unknown" };
  if (built !== now) return { ok: false, reason: "the markdown has changed since the PDF was built" };
  return { ok: true, reason: "PDF matches the markdown" };
}

// Called by the build script after a successful PDF build.
function stamp() {
  fs.writeFileSync(STAMP, hashOf(MD) + "\n");
  return hashOf(MD);
}

module.exports = { check, stamp };

if (require.main === module) {
  if (process.argv.includes("--stamp")) {
    console.log("stamped " + stamp());
  } else {
    const r = check();
    console.log((r.ok ? "  manual: ok — " : "  MANUAL IS STALE — ") + r.reason);
    if (!r.ok) {
      console.log("\n  Rebuild it:");
      console.log("    node scripts/build-manual-pdf.js owner-console-manual.md <out.html>");
      console.log('    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new \\');
      console.log("      --disable-gpu --no-pdf-header-footer --print-to-pdf=public/owner-console-manual.pdf \\");
      console.log('      "file:///<ABSOLUTE WINDOWS PATH TO out.html>"');
      console.log("    node scripts/check-manual-fresh.js --stamp");
      process.exitCode = 1;
    }
  }
}
