import Link from "next/link";
import { prisma } from "../../lib/db";
import { parsePackage } from "../../lib/serialize";
import { currency } from "../../lib/pricing";
import { contentFor } from "../../lib/packageContent";
import NavBar from "../../components/NavBar";
import PageFooter from "../../components/PageFooter";
import JsonLd from "../../components/JsonLd";
import {
  pageMetadata,
  slugForPackage,
  indexablePackages,
  priceRange,
  breadcrumbJsonLd,
  absoluteUrl,
  PHONE_DISPLAY,
  PHONE_E164,
} from "../../lib/seo";

export const revalidate = 1800;

export const metadata = pageMetadata({
  title: "Boat Charter Packages & Pricing — Lake Conroe, TX",
  description:
    "All Lake Conroe boat charter packages and live pricing: tubing and wakeboarding, birthday parties, bachelorette charters, night cruises, Party Cove and corporate outings. From $120 an hour.",
  path: "/packages",
});

const SECTION = { maxWidth: 1100, margin: "0 auto" };

// Columns for the "what's included" comparison. Each one reads the package's
// own `unit` text (the line the owner edits in the console) rather than a
// hard-coded list, so the table follows the data instead of drifting from it.
// A package that stops including wakeboards loses its tick automatically.
const unitOf = (p) => (p.unit || "").toLowerCase();
const INCLUSION_COLUMNS = [
  { label: "Fuel", test: (p) => unitOf(p).includes("fuel") },
  { label: "Ice chest", test: (p) => unitOf(p).includes("ice chest") },
  { label: "Tube & wakeboards", test: (p) => unitOf(p).includes("tube") || unitOf(p).includes("wakeboard") },
  { label: "Decorations", test: (p) => unitOf(p).includes("decoration") },
  { label: "Dinner", test: (p) => unitOf(p).includes("dinner") },
  { label: "Glow gear", test: (p) => unitOf(p).includes("glow") },
];

export default async function PackagesIndexPage() {
  const [rows, vessels] = await Promise.all([
    prisma.package.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.vessel.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const packages = indexablePackages(rows).map(parsePackage);

  // An ItemList tells Google these are the members of one collection, which
  // helps it treat /packages as the hub and each package page as a spoke.
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Lake Conroe boat charter packages",
    itemListElement: packages.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      url: absoluteUrl(`/packages/${slugForPackage(p.id)}`),
    })),
  };

  const crumbs = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Packages", path: "/packages" },
  ]);

  return (
    <div>
      <NavBar />
      <JsonLd data={[itemList, crumbs]} />

      <div style={{ background: "var(--ink)", padding: "56px 24px 26px" }}>
        <div style={{ ...SECTION, maxWidth: 820 }}>
          <div className="mono" style={{ color: "var(--purple)", fontSize: 13, letterSpacing: "0.15em", marginBottom: 14 }}>
            PACKAGES &amp; PRICING
          </div>
          <h1 className="display" style={{ fontSize: "clamp(30px, 5.5vw, 50px)", margin: 0, lineHeight: 1.05, fontWeight: 800, color: "var(--text)" }}>
            Lake Conroe boat charter packages
          </h1>
          <p style={{ fontSize: 16.5, color: "var(--text)", opacity: 0.88, lineHeight: 1.7, marginTop: 20 }}>
            Every charter is private — you book the whole boat, not a seat, and the price covers the
            group rather than each person. Fuel and an ice chest loaded with ice and water are included
            across the board, and most packages also include the tube and wakeboards. Rates start at
            $120 an hour on the Nauti Islander and run up to a full eight-hour day on the fourteen-seat
            Nauti Explorer.
          </p>
          <p style={{ fontSize: 16.5, color: "var(--text)", opacity: 0.88, lineHeight: 1.7 }}>
            Pick the package that matches the occasion below — each one has its own page with the full
            price table for all three boats, weekday and weekend. Not sure which fits? Call or text{" "}
            <a href={`tel:${PHONE_E164}`} style={{ color: "var(--purple)" }}>{PHONE_DISPLAY}</a>.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--ink-soft)", padding: "40px 24px 56px" }}>
        <div style={SECTION}>
          <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {packages.map((p) => {
              const range = priceRange(p);
              const copy = contentFor(p.id);
              const slug = slugForPackage(p.id);
              return (
                <Link
                  key={p.id}
                  href={`/packages/${slug}`}
                  style={{
                    display: "block", background: "var(--ink)", borderRadius: 10, padding: 22,
                    border: "1px solid rgba(203,108,230,0.2)", textDecoration: "none",
                  }}
                >
                  <h2 style={{ fontSize: 19, color: "var(--text)", margin: "0 0 8px" }}>{p.name}</h2>
                  {range ? (
                    <div style={{ color: "var(--purple)", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                      From {currency(range.low)}
                    </div>
                  ) : null}
                  <p style={{ fontSize: 14.5, color: "var(--text)", opacity: 0.82, lineHeight: 1.6, margin: 0 }}>
                    {copy?.intent || p.blurb?.slice(0, 150)}
                  </p>
                  <div style={{ marginTop: 14, color: "var(--pink)", fontSize: 14, fontWeight: 700 }}>
                    See pricing &amp; details →
                  </div>
                </Link>
              );
            })}
          </div>

          {/* What's included, side by side.
              Every competitor on Lake Conroe publishes this and we did not,
              which left the strongest thing about our pricing invisible: fuel
              is in the price. Several operators quote a lower hourly rate and
              then bill fuel at the end, so a straight rate comparison makes us
              look more expensive than we are.

              The rows are derived from each Package's own `unit` text rather
              than hand-written, so editing a package in the owner console
              updates this table and it can never quietly go stale. */}
          <div style={{ marginTop: 34 }}>
            <h2 className="display" style={{ fontSize: 24, color: "var(--text)", marginBottom: 6 }}>
              What&rsquo;s included in every charter
            </h2>
            <p style={{ fontSize: 15, color: "var(--text)", opacity: 0.82, lineHeight: 1.6, margin: "0 0 16px", maxWidth: 760 }}>
              Fuel is included in every package we run — there is no refuelling bill at the end and no
              fuel deposit. Worth checking when you compare quotes, because a lower hourly rate with
              fuel billed on top is not the cheaper trip.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5, minWidth: 620 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--muted)", fontWeight: 600, borderBottom: "1px solid rgba(203,108,230,0.25)" }}>Package</th>
                    {INCLUSION_COLUMNS.map((c) => (
                      <th key={c.label} style={{ textAlign: "center", padding: "10px 8px", color: "var(--muted)", fontWeight: 600, borderBottom: "1px solid rgba(203,108,230,0.25)", whiteSpace: "nowrap" }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Only packages that actually declare inclusions. Wake
                      Surfing is a partner-run coaching session rather than a
                      boat hire, so its `unit` lists no inclusions — showing it
                      as a row of dashes would read as "you get nothing", which
                      is false. It gets a line underneath instead. */}
                  {packages.filter((p) => INCLUSION_COLUMNS.some((c) => c.test(p))).map((p) => (
                    <tr key={p.id}>
                      <td style={{ padding: "10px 12px", color: "var(--text)", borderBottom: "1px solid rgba(203,108,230,0.12)" }}>{p.name}</td>
                      {INCLUSION_COLUMNS.map((c) => (
                        <td key={c.label} style={{ textAlign: "center", padding: "10px 8px", borderBottom: "1px solid rgba(203,108,230,0.12)", color: c.test(p) ? "var(--pink)" : "rgba(255,255,255,0.22)" }}>
                          {c.test(p) ? "✓" : "–"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--text)", opacity: 0.7, lineHeight: 1.6, marginTop: 12, maxWidth: 760 }}>
              Every charter also comes with a licensed captain unless you book the self-drive Nauti
              Islander, and the Nauti Explorer now carries a full sound system, TV connections, a
              3,000-watt inverter and an on-board electric grill.
            </p>
            {packages.some((p) => !INCLUSION_COLUMNS.some((c) => c.test(p))) && (
              <p style={{ fontSize: 13.5, color: "var(--text)", opacity: 0.7, lineHeight: 1.6, marginTop: 6, maxWidth: 760 }}>
                Wake Surfing Lessons is a private coaching session run with a partner rather than a
                boat hire, so it is quoted on its own terms — see its page for what the session covers.
              </p>
            )}
          </div>

          {/* The glow party is sold by the seat, not by the boat, so it sits
              outside the package grid and points at its own landing page. */}
          <div style={{ marginTop: 30, background: "var(--ink)", borderRadius: 10, padding: 22, border: "1px solid rgba(232,106,168,0.35)" }}>
            <h2 style={{ fontSize: 19, color: "var(--pink)", margin: "0 0 8px" }}>Boatz &amp; Glowz</h2>
            <p style={{ fontSize: 14.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.6, margin: "0 0 12px" }}>
              Our twice-yearly glow party at Party Cove, sold per seat rather than per boat. The whole
              fleet and crew go out and the seats are split across all three vessels.
            </p>
            <Link href="/glow" style={{ color: "var(--pink)", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
              See the next date →
            </Link>
          </div>

          <div style={{ marginTop: 34, maxWidth: 820 }}>
            <h2 className="display" style={{ fontSize: 24, color: "var(--text)", marginBottom: 10 }}>
              Meet the fleet
            </h2>
            <p style={{ fontSize: 15.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.7 }}>
              Three boats cover every package. The one you pick sets the price and the guest limit.
            </p>
            <ul style={{ fontSize: 15.5, color: "var(--text)", opacity: 0.88, lineHeight: 1.7, paddingLeft: 22 }}>
              {vessels.map((v) => (
                <li key={v.id} style={{ marginBottom: 8 }}>
                  <strong>{v.name}</strong> ({v.slip}) — up to {v.capacity} guests. {v.note}
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 15.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.7 }}>
              Questions about deposits, weather, alcohol or what to bring are answered on the{" "}
              <Link href="/faq" style={{ color: "var(--purple)" }}>FAQ page</Link>.
            </p>
          </div>
        </div>
      </div>

      <PageFooter />
    </div>
  );
}
