import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { parsePackage } from "../../../lib/serialize";
import { currency } from "../../../lib/pricing";
import { contentFor } from "../../../lib/packageContent";
import NavBar from "../../../components/NavBar";
import PageFooter from "../../../components/PageFooter";
import JsonLd from "../../../components/JsonLd";
import {
  pageMetadata,
  slugForPackage,
  indexablePackages,
  packageJsonLd,
  breadcrumbJsonLd,
  PHONE_DISPLAY,
  PHONE_E164,
} from "../../../lib/seo";

export const revalidate = 1800;

// Only the slugs we know about are valid; anything else 404s rather than
// rendering an empty shell that Google could index as a soft 404.
export const dynamicParams = false;

export async function generateStaticParams() {
  const rows = await prisma.package.findMany({ orderBy: { sortOrder: "asc" } });
  return indexablePackages(rows).map((p) => ({ slug: slugForPackage(p.id) }));
}

async function loadPackage(slug) {
  const [rows, vessels] = await Promise.all([
    prisma.package.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.vessel.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const row = indexablePackages(rows).find((p) => slugForPackage(p.id) === slug);
  if (!row) return null;
  return { pkg: parsePackage(row), vessels };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const loaded = await loadPackage(slug);
  if (!loaded) return {};

  const { pkg } = loaded;
  const copy = contentFor(pkg.id);

  return pageMetadata({
    title: copy?.metaTitle || `${pkg.name} — Lake Conroe Boat Charter`,
    description:
      copy?.metaDescription ||
      `${pkg.name} on Lake Conroe, TX with The Nauti Yachti. ${pkg.blurb}`.slice(0, 300),
    path: `/packages/${slug}`,
    image: pkg.image && !pkg.image.startsWith("http") ? pkg.image : undefined,
  });
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8];

function PriceTable({ pkg, vessels }) {
  if (!pkg.hourlyByVessel) return null;

  const usable = vessels.filter((v) => pkg.hourlyByVessel[v.id]);
  if (!usable.length) return null;

  return (
    <div style={{ overflowX: "auto", marginTop: 18 }}>
      <table style={{ width: "100%", minWidth: 620, borderCollapse: "collapse", fontSize: 14 }}>
        <caption style={{ captionSide: "top", textAlign: "left", color: "var(--muted)", fontSize: 13.5, paddingBottom: 10 }}>
          Total price for the whole boat, not per person. Weekend rates apply on Saturdays and Sundays.
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(203,108,230,0.35)", color: "var(--purple)" }}>
              Boat
            </th>
            <th scope="col" style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(203,108,230,0.35)", color: "var(--purple)" }}>
              Day
            </th>
            {HOURS.map((h) => (
              <th key={h} scope="col" style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid rgba(203,108,230,0.35)", color: "var(--purple)", whiteSpace: "nowrap" }}>
                {h} hr
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {usable.map((v) =>
            ["weekday", "weekend"].map((dayType) => {
              const rates = pkg.hourlyByVessel[v.id]?.[dayType] || {};
              return (
                <tr key={`${v.id}-${dayType}`}>
                  {dayType === "weekday" ? (
                    <th
                      scope="rowgroup"
                      rowSpan={2}
                      style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "var(--text)", fontWeight: 700, verticalAlign: "top" }}
                    >
                      {v.name}
                      <div style={{ fontWeight: 400, fontSize: 12.5, color: "var(--muted)" }}>
                        up to {v.capacity} guests
                      </div>
                    </th>
                  ) : null}
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "var(--muted)", textTransform: "capitalize" }}>
                    {dayType}
                  </td>
                  {HOURS.map((h) => (
                    <td key={h} style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "right", color: "var(--text)", whiteSpace: "nowrap" }}>
                      {rates[h] != null ? currency(rates[h]) : "—"}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function TierTable({ pkg }) {
  if (!Array.isArray(pkg.tiers) || !pkg.tiers.length) return null;
  return (
    <div style={{ overflowX: "auto", marginTop: 18 }}>
      <table style={{ width: "100%", minWidth: 320, borderCollapse: "collapse", fontSize: 14 }}>
        <caption style={{ captionSide: "top", textAlign: "left", color: "var(--muted)", fontSize: 13.5, paddingBottom: 10 }}>
          Flat price for the whole {pkg.fixedHours}-hour session, by group size.
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(203,108,230,0.35)", color: "var(--purple)" }}>Group size</th>
            <th scope="col" style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid rgba(203,108,230,0.35)", color: "var(--purple)" }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {pkg.tiers.map((t, i) => {
            const prev = i === 0 ? 0 : Number(pkg.tiers[i - 1].max);
            const label = t.max == null ? `${prev + 1}+ guests` : `${prev + 1}–${t.max} guests`;
            return (
              <tr key={i}>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "var(--text)" }}>{label}</td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "right", color: "var(--text)" }}>{currency(t.price)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const SECTION = { maxWidth: 860, margin: "0 auto" };
const H2 = { fontSize: 26, color: "var(--text)", marginBottom: 10, marginTop: 0 };
const BODY = { fontSize: 16.5, color: "var(--text)", opacity: 0.88, lineHeight: 1.7, margin: "0 0 16px" };

export default async function PackagePage({ params }) {
  const { slug } = await params;
  const loaded = await loadPackage(slug);
  if (!loaded) notFound();

  const { pkg, vessels } = loaded;
  const copy = contentFor(pkg.id);
  const usableVessels = vessels.filter((v) => (pkg.vessels || []).includes(v.id));

  const jsonLd = [
    packageJsonLd(pkg, { vessels: usableVessels }),
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Packages", path: "/packages" },
      { name: pkg.name, path: `/packages/${slug}` },
    ]),
  ];

  return (
    <div>
      <NavBar />
      <JsonLd data={jsonLd} />

      {/* HERO */}
      <div style={{ background: "var(--ink)", padding: "50px 24px 30px" }}>
        <div style={SECTION}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
            <Link href="/" style={{ color: "var(--muted)" }}>Home</Link>
            {" / "}
            <Link href="/packages" style={{ color: "var(--muted)" }}>Packages</Link>
            {" / "}
            <span style={{ color: "var(--purple)" }}>{pkg.name}</span>
          </nav>

          <h1 className="display" style={{ fontSize: "clamp(30px, 5.5vw, 48px)", margin: 0, lineHeight: 1.05, fontWeight: 800, color: "var(--text)" }}>
            {copy?.h1 || `${pkg.name} on Lake Conroe`}
          </h1>

          {pkg.unit ? (
            <p style={{ ...BODY, marginTop: 18, marginBottom: 0, color: "var(--purple)", opacity: 1, fontSize: 15 }}>
              {pkg.unit}
            </p>
          ) : null}
        </div>
      </div>

      {/* INTRO */}
      <div style={{ background: "var(--ink-soft)", padding: "40px 24px" }}>
        <div style={SECTION}>
          {(copy?.intro || [pkg.blurb]).map((p, i) => (
            <p key={i} style={BODY}>{p}</p>
          ))}

          {copy && pkg.blurb ? (
            <p style={{ ...BODY, marginBottom: 0 }}>{pkg.blurb}</p>
          ) : null}

          {pkg.bullets?.length ? (
            <div style={{ marginTop: 20 }}>
              {pkg.bulletsIntro ? (
                <h2 style={{ ...H2, fontSize: 20 }}>{pkg.bulletsIntro}</h2>
              ) : null}
              <ul style={{ ...BODY, paddingLeft: 22 }}>
                {pkg.bullets.map((b, i) => (
                  <li key={i} style={{ marginBottom: 8 }}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {pkg.closing ? (
            <p style={{ ...BODY, marginTop: 14 }}>{pkg.closing}</p>
          ) : null}
        </div>
      </div>

      {/* HIGHLIGHTS */}
      {copy?.highlights?.length ? (
        <div style={{ background: "var(--ink)", padding: "40px 24px" }}>
          <div style={SECTION}>
            <h2 className="display" style={H2}>What makes this charter work</h2>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: 18 }}>
              {copy.highlights.map((h, i) => (
                <div key={i} style={{ background: "var(--ink-soft)", borderRadius: 8, padding: "18px 18px", border: "1px solid rgba(203,108,230,0.18)" }}>
                  <h3 style={{ fontSize: 16, color: "var(--purple)", margin: "0 0 8px" }}>{h.title}</h3>
                  <p style={{ fontSize: 14.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.6, margin: 0 }}>{h.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* PRICING */}
      <div style={{ background: "var(--ink-soft)", padding: "40px 24px" }}>
        <div style={SECTION}>
          <h2 className="display" style={H2}>{pkg.name} pricing on Lake Conroe</h2>
          <p style={{ ...BODY, marginBottom: 0 }}>
            These are the live rates — the same numbers the booking form quotes. Prices are for the
            entire boat for the whole charter, so splitting the cost across your group is usually the
            cheapest way onto the water.
          </p>
          <PriceTable pkg={pkg} vessels={vessels} />
          <TierTable pkg={pkg} />
        </div>
      </div>

      {/* VESSELS */}
      {usableVessels.length ? (
        <div style={{ background: "var(--ink)", padding: "40px 24px" }}>
          <div style={SECTION}>
            <h2 className="display" style={H2}>Which boat you can book</h2>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", marginTop: 16 }}>
              {usableVessels.map((v) => (
                <div key={v.id} style={{ background: "var(--ink-soft)", borderRadius: 8, padding: 18, border: "1px solid rgba(203,108,230,0.18)" }}>
                  <div className="mono" style={{ color: "var(--purple)", fontSize: 12, letterSpacing: "0.12em" }}>{v.slip}</div>
                  <h3 style={{ fontSize: 18, color: "var(--text)", margin: "6px 0 6px" }}>{v.name}</h3>
                  <div style={{ fontSize: 13.5, color: "var(--purple)", marginBottom: 8 }}>Up to {v.capacity} guests</div>
                  <p style={{ fontSize: 14.5, color: "var(--text)", opacity: 0.85, lineHeight: 1.6, margin: 0 }}>{v.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* PARTNER NOTE */}
      {copy?.partner ? (
        <div style={{ background: "var(--ink)", padding: "0 24px 40px" }}>
          <div style={SECTION}>
            <p style={{ ...BODY, marginBottom: 0, fontSize: 15 }}>{copy.partner.note}</p>
          </div>
        </div>
      ) : null}

      {/* BOOKING + POLICY */}
      <div style={{ background: "var(--ink-soft)", padding: "40px 24px" }}>
        <div style={SECTION}>
          <h2 className="display" style={H2}>How to book</h2>
          <p style={BODY}>
            Send an enquiry with your date, group size and how many hours you want, and you will get a
            quote back at the rates above. Availability for every boat is published on the site, so you
            can check your date before you enquire. You can also call or text{" "}
            <a href={`tel:${PHONE_E164}`} style={{ color: "var(--purple)" }}>{PHONE_DISPLAY}</a>.
          </p>
          <p style={BODY}>
            Cancel 24 hours or more before your charter and you get a full refund. A day-of
            cancellation with communication is refunded at 60%. If we cancel for weather, you choose
            between a full refund and a reschedule. The{" "}
            <Link href="/terms" style={{ color: "var(--purple)" }}>full terms and cancellation policy</Link>{" "}
            spell this out, and the <Link href="/faq" style={{ color: "var(--purple)" }}>FAQ</Link>{" "}
            covers what to bring, alcohol, age limits and Texas boater education rules.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
            {pkg.linkUrl ? (
              <a
                href={pkg.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-block", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", fontWeight: 700, padding: "13px 26px", borderRadius: 6, textDecoration: "none", fontSize: 15 }}
              >
                {pkg.linkLabel || "Book this experience"}
              </a>
            ) : (
              <Link
                href="/#inquire"
                style={{ display: "inline-block", background: "linear-gradient(135deg, var(--purple), var(--pink))", color: "#0A0612", fontWeight: 700, padding: "13px 26px", borderRadius: 6, textDecoration: "none", fontSize: 15 }}
              >
                Check availability &amp; book
              </Link>
            )}
            <Link
              href="/packages"
              style={{ display: "inline-block", border: "1px solid rgba(203,108,230,0.5)", color: "var(--text)", fontWeight: 600, padding: "13px 26px", borderRadius: 6, textDecoration: "none", fontSize: 15 }}
            >
              See all packages
            </Link>
          </div>
        </div>
      </div>

      <PageFooter />
    </div>
  );
}
