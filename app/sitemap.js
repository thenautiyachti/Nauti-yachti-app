// app/sitemap.js — Next 16 metadata file convention. Served at /sitemap.xml.
//
// The package URLs are read from the live database rather than hardcoded, so
// adding a package in the owner console puts it in the sitemap automatically.
// Revalidated on the same 30-minute cadence as the public pages.
import { prisma } from "../lib/db";
import { SITE_URL, slugForPackage, indexablePackages } from "../lib/seo";

export const revalidate = 1800;

export default async function sitemap() {
  const now = new Date();

  const staticRoutes = [
    { path: "/", changeFrequency: "weekly", priority: 1.0 },
    { path: "/packages", changeFrequency: "weekly", priority: 0.9 },
    { path: "/faq", changeFrequency: "monthly", priority: 0.8 },
    { path: "/about", changeFrequency: "monthly", priority: 0.7 },
    { path: "/events", changeFrequency: "weekly", priority: 0.7 },
    { path: "/glow", changeFrequency: "weekly", priority: 0.7 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
    { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  ];

  let packageRoutes = [];
  try {
    const rows = await prisma.package.findMany({ orderBy: { sortOrder: "asc" } });
    packageRoutes = indexablePackages(rows).map((p) => ({
      url: `${SITE_URL}/packages/${slugForPackage(p.id)}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    }));
  } catch (err) {
    // A sitemap that is missing the package URLs still beats a 500 that leaves
    // crawlers with no sitemap at all.
    console.error("[sitemap] could not load packages:", err);
  }

  return [
    ...staticRoutes.map((r) => ({
      url: `${SITE_URL}${r.path === "/" ? "" : r.path}`,
      lastModified: now,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...packageRoutes,
  ];
}
