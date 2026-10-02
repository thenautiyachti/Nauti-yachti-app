// Markdown -> printable HTML for the operations manual.
//
//   node build-manual-v2.js <manual.md> <out.html>
//
// Handles exactly what the manual uses: a cover (the first # heading and the
// paragraph under it), parts (# headings, each on a new page), chapters (##),
// sections (###), a generated, clickable table of contents at [[TOC]], tables,
// bullet and numbered lists, fenced or indented code, callouts (> lines), links,
// bold, italics and inline code. No dependencies, on purpose.
const fs = require("fs");
const md = fs.readFileSync(process.argv[2], "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[`*_]/g, "")
  .replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, h) => `<a href="${h}">${t}</a>`);

const lines = md.split(/\r?\n/);
const out = [];
const toc = [];
let i = 0, titleDone = false;
const isBlockStart = (l) => /^(#{1,4}\s|\||>|```|\s*[-*]\s|\s*\d+\.\s|\[\[TOC\]\]|---+$)/.test(l);

while (i < lines.length) {
  const l = lines[i];
  if (l.trim() === "[[TOC]]") { out.push("<!--TOC-->"); i++; continue; }
  if (/^```/.test(l)) {
    const buf = []; i++;
    while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
    i++;
    out.push(`<pre>${esc(buf.join("\n"))}</pre>`);
    continue;
  }
  if (/^ {4}\S/.test(l) && (i === 0 || lines[i - 1].trim() === "")) {
    const buf = [];
    while (i < lines.length && (/^ {4}/.test(lines[i]) || (lines[i].trim() === "" && /^ {4}\S/.test(lines[i + 1] || "")))) buf.push(lines[i++].slice(4));
    out.push(`<pre>${esc(buf.join("\n"))}</pre>`);
    continue;
  }
  if (/^\|/.test(l) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || "")) {
    const head = l.split("|").slice(1, -1).map((c) => c.trim());
    i += 2;
    const rows = [];
    while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++].split("|").slice(1, -1).map((c) => c.trim()));
    out.push("<table><thead><tr>" + head.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table>");
    continue;
  }
  const h = l.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    const n = h[1].length, text = h[2], id = slug(text);
    if (n === 1 && !titleDone) {
      titleDone = true; i++;
      const sub = [];
      while (i < lines.length && !isBlockStart(lines[i])) { if (lines[i].trim()) sub.push(lines[i]); i++; }
      out.push(`<section class="cover"><div class="mark">Operations manual</div><h1 class="title">${inline(text)}</h1>` +
        sub.map((p) => `<p>${inline(p)}</p>`).join("") + `</section>`);
      continue;
    }
    if (n <= 2) toc.push({ n, text, id });
    out.push(`<h${n} id="${id}"${n === 1 ? ' class="part"' : ""}>${inline(text)}</h${n}>`);
    i++; continue;
  }
  if (/^---+$/.test(l)) { out.push("<hr>"); i++; continue; }
  if (/^>/.test(l)) {
    const buf = [];
    while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
    const paras = buf.join("\n").split(/\n\s*\n/).map((p) => `<p>${inline(p.replace(/\n/g, " "))}</p>`);
    out.push(`<aside class="note">${paras.join("")}</aside>`);
    continue;
  }
  const listRe = /^\s*([-*]|\d+\.)\s+/;
  if (listRe.test(l)) {
    const ordered = /^\s*\d+\./.test(l);
    const items = [];
    while (i < lines.length && listRe.test(lines[i]) && /^\s*\d+\./.test(lines[i]) === ordered) {
      let t = lines[i].replace(listRe, ""); i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !listRe.test(lines[i])) { t += " " + lines[i].trim(); i++; }
      items.push(`<li>${inline(t)}</li>`);
    }
    out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
    continue;
  }
  if (l.trim() === "") { i++; continue; }
  let para = l; i++;
  while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i]) && !/^ {4}\S/.test(lines[i])) para += " " + lines[i++].trim();
  out.push(`<p>${inline(para)}</p>`);
}

const tocHtml = `<nav class="toc"><h2 class="toch">Contents</h2><ul>` + toc.map((t) =>
  t.n === 1 ? `</ul><div class="tocpart"><a href="#${t.id}">${inline(t.text)}</a></div><ul>`
            : `<li><a href="#${t.id}">${inline(t.text)}</a></li>`).join("") + `</ul></nav>`;
const body = out.join("\n").replace("<!--TOC-->", tocHtml).replace(/<ul><\/ul>/g, "");

fs.writeFileSync(process.argv[3], `<!doctype html><meta charset="utf-8"><title>Operations manual</title><style>
@page { size: Letter; margin: 18mm 16mm; }
:root { --ink:#16202a; --muted:#5d6b78; --navy:#0f3b5f; --sea:#1f7a8c; --line:#d9e2ea; --wash:#eef4f8; --sand:#fbf6ea; }
body { font: 10.5pt/1.55 "Segoe UI", Roboto, Arial, sans-serif; color: var(--ink); }
.cover { height: 235mm; display:flex; flex-direction:column; justify-content:center; border-left: 6px solid var(--sea); padding-left: 14mm; page-break-after: always; }
.cover .mark { text-transform: uppercase; letter-spacing: .18em; font-size: 9pt; color: var(--sea); font-weight: 600; }
.cover .title { font-size: 30pt; line-height: 1.15; color: var(--navy); margin: 6pt 0 14pt; border: 0; }
.cover p { color: var(--muted); font-size: 11.5pt; max-width: 120mm; margin: 0 0 6pt; }
nav.toc { page-break-after: always; }
nav.toc .toch { border: 0; font-size: 18pt; }
nav.toc .tocpart { margin: 10pt 0 2pt; font-weight: 700; }
nav.toc .tocpart a { color: var(--navy); }
nav.toc ul { list-style: none; padding-left: 12pt; margin: 0; columns: 1; }
nav.toc li { margin: 1.5pt 0; }
nav.toc a { color: var(--ink); text-decoration: none; }
h1.part { page-break-before: always; font-size: 22pt; color: var(--navy); border-bottom: 3px solid var(--sea); padding-bottom: 4pt; margin: 0 0 10pt; }
h2 { font-size: 15pt; color: var(--navy); margin: 20pt 0 6pt; page-break-after: avoid; border-bottom: 1px solid var(--line); padding-bottom: 2pt; }
h3 { font-size: 12pt; margin: 14pt 0 4pt; page-break-after: avoid; color: var(--ink); }
h4 { font-size: 10.5pt; margin: 10pt 0 2pt; page-break-after: avoid; color: var(--sea); text-transform: uppercase; letter-spacing: .05em; }
p { margin: 0 0 7pt; }
ul, ol { margin: 0 0 8pt; padding-left: 18pt; }
li { margin-bottom: 3pt; }
ol li::marker { font-weight: 700; color: var(--sea); }
table { border-collapse: collapse; width: 100%; margin: 0 0 10pt; font-size: 9.5pt; page-break-inside: avoid; }
th { background: var(--wash); text-align: left; padding: 5pt 7pt; border: 1px solid var(--line); color: var(--navy); }
td { padding: 5pt 7pt; border: 1px solid var(--line); vertical-align: top; }
code { background: #f1f3f5; padding: 0 3px; border-radius: 3px; font: 9pt Consolas, "Courier New", monospace; }
pre { background: #f4f6f8; border: 1px solid var(--line); border-radius: 4px; padding: 7pt 9pt; font: 9pt/1.45 Consolas, "Courier New", monospace; white-space: pre-wrap; page-break-inside: avoid; }
aside.note { background: var(--sand); border-left: 4px solid #d9a441; padding: 7pt 10pt; margin: 0 0 10pt; page-break-inside: avoid; }
aside.note p { margin: 0 0 4pt; } aside.note p:last-child { margin: 0; }
a { color: var(--sea); }
hr { border: 0; border-top: 1px solid var(--line); margin: 14pt 0; }
</style>` + body);
console.log(`html written: ${toc.filter((t) => t.n === 1).length} parts, ${toc.filter((t) => t.n === 2).length} chapters`);

// Usage:
//   node scripts/build-manual-pdf.js owner-console-manual.md <out.html>
//   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
//     --headless=new --disable-gpu --no-pdf-header-footer \
//     --print-to-pdf=<out.pdf> "file:///<ABSOLUTE WINDOWS PATH TO out.html>"
//
// The file:// URL must be a real Windows path. Handing Edge a Git Bash path
// like /tmp/x.html silently produces a 14-word PDF instead of failing, which
// is exactly the sort of quiet wrong answer worth writing down.
