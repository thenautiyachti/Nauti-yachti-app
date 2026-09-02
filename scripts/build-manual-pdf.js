// Minimal markdown -> styled HTML for the owner manual. Not a general renderer:
// it handles exactly the constructs the manual uses (headings, tables, lists,
// bold, code, rules), which is cheaper and more predictable than pulling in a
// dependency for one document.
const fs = require("fs");
const md = fs.readFileSync(process.argv[2], "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

const out = [];
const lines = md.split(/\r?\n/);
let i = 0;
while (i < lines.length) {
  const l = lines[i];
  if (/^\|/.test(l) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || "")) {
    const head = l.split("|").slice(1, -1).map((c) => c.trim());
    i += 2;
    const rows = [];
    while (i < lines.length && /^\|/.test(lines[i])) {
      rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
      i++;
    }
    out.push("<table><thead><tr>" + head.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>"
      + rows.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("")
      + "</tbody></table>");
    continue;
  }
  const h = l.match(/^(#{1,4})\s+(.*)$/);
  if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
  if (/^---+$/.test(l)) { out.push("<hr>"); i++; continue; }
  if (/^\s*[-*]\s+/.test(l)) {
    const items = [];
    while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
      let t = lines[i].replace(/^\s*[-*]\s+/, "");
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i])) { t += " " + lines[i].trim(); i++; }
      items.push(`<li>${inline(t)}</li>`);
    }
    out.push("<ul>" + items.join("") + "</ul>");
    continue;
  }
  if (l.trim() === "") { i++; continue; }
  let para = l;
  i++;
  while (i < lines.length && lines[i].trim() !== "" && !/^[#|>-]/.test(lines[i]) && !/^\s*[-*]\s/.test(lines[i])) { para += " " + lines[i]; i++; }
  out.push(`<p>${inline(para)}</p>`);
}

fs.writeFileSync(process.argv[3], `<!doctype html><meta charset="utf-8"><style>
@page { margin: 16mm 14mm; }
body { font: 10.5pt/1.5 -apple-system,Segoe UI,Roboto,sans-serif; color:#1a1a1a; }
h1 { font-size:20pt; margin:0 0 4pt; color:#5b2a86; }
h1+p { color:#666; margin-top:0; }
h2 { font-size:14pt; margin:20pt 0 6pt; color:#5b2a86; border-bottom:1.5px solid #e0d0ec; padding-bottom:3pt; page-break-after:avoid; }
h3 { font-size:11.5pt; margin:14pt 0 4pt; color:#111; page-break-after:avoid; }
p { margin:0 0 7pt; }
ul { margin:0 0 8pt; padding-left:16pt; }
li { margin-bottom:3pt; }
table { border-collapse:collapse; width:100%; margin:0 0 10pt; font-size:9.5pt; page-break-inside:avoid; }
th { background:#f4eefa; text-align:left; padding:5pt 7pt; border:1px solid #ddd; }
td { padding:5pt 7pt; border:1px solid #ddd; vertical-align:top; }
code { background:#f3f3f3; padding:1px 4px; border-radius:3px; font-size:9pt; }
hr { border:0; border-top:1px solid #e6e6e6; margin:14pt 0; }
strong { color:#000; }
</style>` + out.join("\n"));
console.log("html written");

// Usage:
//   node scripts/build-manual-pdf.js owner-console-manual.md <out.html>
//   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
//     --headless=new --disable-gpu --no-pdf-header-footer \
//     --print-to-pdf=<out.pdf> "file:///<ABSOLUTE WINDOWS PATH TO out.html>"
//
// The file:// URL must be a real Windows path. Handing Edge a Git Bash path
// like /tmp/x.html silently produces a 14-word PDF instead of failing, which
// is exactly the sort of quiet wrong answer worth writing down.
