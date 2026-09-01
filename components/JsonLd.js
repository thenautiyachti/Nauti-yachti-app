// Renders a JSON-LD <script> tag.
//
// The `<` -> `<` replacement is the XSS guard recommended by the Next.js
// JSON-LD guide (node_modules/next/dist/docs/01-app/02-guides/json-ld.md):
// JSON.stringify does not escape HTML, and some of this payload comes from
// owner-editable database columns (package blurbs, vessel notes), so a stray
// "</script>" in the admin console must not be able to break out of the tag.
//
// A native <script> is correct here rather than next/script — this is
// structured data, not executable code, and it has to be in the server-
// rendered HTML for crawlers that do not run JavaScript.
export default function JsonLd({ data }) {
  const payload = Array.isArray(data) ? data : [data];
  return (
    <>
      {payload.filter(Boolean).map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(item).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  );
}
