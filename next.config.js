/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The waiver PDF lives outside public/ and is read at runtime by the
  // admin-gated route, so Next must trace it into that function bundle.
  outputFileTracingIncludes: {
    "/api/admin/documents/waiver": ["./private/legal/**"],
  },

// Vercel already sends HSTS. These four cover the gaps, and none of them
  // change how the site renders.
  //
  // There is deliberately no Content-Security-Policy here. A useful one has to
  // enumerate every script and frame origin the site loads -- Stripe checkout,
  // Google Fonts, the embedded map -- and getting it slightly wrong silently
  // breaks payment rather than showing an error. That is worth doing carefully
  // and testing, not bolting on blind.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The admin console holds guest contact details and the ledger.
          // Framing it elsewhere is the setup for a clickjacking attack, and
          // nothing here is meant to be embedded on another site.
          { key: "X-Frame-Options", value: "DENY" },
          // Stop a browser from second-guessing a declared Content-Type, which
          // is how an uploaded file gets treated as a script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Send the origin to other sites but never the full path, so an
          // admin URL never leaks in a Referer header.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The site asks for none of these. Denying them means an injected
          // script cannot ask on our behalf.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },

  // Three URLs from an earlier version of the site are still in Google's index
  // and were returning a bare 404, so every bit of accumulated link equity was
  // being thrown away and users were landing on an error page.
  //
  // `permanent: true` emits a 308, which tells Google to transfer ranking
  // signals to the destination and to drop the old URL from the index.
  async redirects() {
    return [
      // Pricing lived on its own page; per-package pricing tables now live
      // under /packages, which is the closest real equivalent.
      { source: "/pricing", destination: "/packages", permanent: true },

      // There has never been a standalone contact page in this codebase — the
      // inquiry form is the #inquire section of the home page.
      { source: "/contact-us", destination: "/#inquire", permanent: true },

      // "Feeling Nauti" was the old name for the packages listing.
      { source: "/feeling-nauti", destination: "/packages", permanent: true },
    ];
  },
};

module.exports = nextConfig;
