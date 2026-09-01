/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

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
