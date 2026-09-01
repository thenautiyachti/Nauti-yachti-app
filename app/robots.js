// app/robots.js — Next 16 metadata file convention. Served at /robots.txt.
// Before this existed, /robots.txt returned a 404, which leaves crawlers with
// no sitemap pointer at all.
const { SITE_URL } = require("../lib/seo");

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",            // JSON endpoints — nothing indexable, some auth-gated
          "/admin",           // owner console
          "/glow/crew",       // per-booking crew list, reached by link only
          "/booking-success", // post-checkout confirmation, unique per booking
          "/owner-console-manual.pdf",   // internal operations manual
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
