// Runs before anything else, because it has to happen before Turbopack opens
// its cache. Google Drive drops a desktop.ini into the cache directory and
// Turbopack parses every filename there as a number, so the build dies on
// "invalid digit found in string" -- always on the build after a successful one,
// since a successful build is what creates the folder for Drive to decorate.
// See scripts/clean-drive-junk.js. On Vercel this finds nothing and costs a
// single failed readdir.
try {
  require("./scripts/clean-drive-junk.js").cleanBuildCache(__dirname);
} catch (e) {
  // A janitor that throws is worse than a dirty cache.
}

// The console links to a PDF of the manual, and every edit is made to the
// markdown. Nothing connected the two, so it drifted -- at commissioning the
// served PDF was fourteen hours stale and still contained a line that was
// false. This surfaces that at build time. It only warns: the PDF is built by
// headless Edge, which does not exist on a build server, so failing here would
// break deploys for a documentation problem.
try {
  const { check } = require("./scripts/check-manual-fresh.js");
  const r = check();
  if (!r.ok) console.warn("[manual] PDF may be out of date -- " + r.reason + " (node scripts/check-manual-fresh.js)");
} catch (e) {
  // Never let a documentation check stop a build.
}

// --- local secrets -----------------------------------------------------------
//
// The real secrets live OUTSIDE this folder, in C:/Users/immex/.secrets/, and
// are loaded here before anything else runs.
//
// WHY: this project sits under C:/Users/immex/Documents, which syncs to Google
// Drive. A .env in here put the live Stripe secret key, the database password,
// the session secret and the admin passcode into that Google account. It was
// never in git -- .gitignore has always covered it -- so this was a Drive
// exposure rather than a public one, but anyone with the Google login had the
// business. Google Drive has no per-file exclusion, so the only fix is for the
// file not to be in the folder at all.
//
// Same trick already used for .git, which is a pointer file aimed at
// C:/Users/immex/dev/ for exactly this reason.
//
// PRODUCTION IS UNAFFECTED. Vercel reads its own environment variables and
// never sees this file; it matters only for local dev, local builds and the
// crew scripts.
//
// Parsed inline rather than with dotenv: this package does not depend on
// dotenv, and requiring one here means the build dies if it is ever missing.
// Twelve KEY=VALUE lines do not need a library.
const SECRETS = "C:/Users/immex/.secrets/nauti-yachti.env";
try {
  const nodeFs = require("fs");
  if (nodeFs.existsSync(SECRETS)) {
    const lines = nodeFs.readFileSync(SECRETS, "utf8").split("\n");
    for (const raw of lines) {
      const line = raw.replace("\r", "");
      if (!line || line.trim().startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      // An existing environment variable wins, so a shell export or Vercel's
      // own configuration still overrides this file.
      if (process.env[key] === undefined) {
        process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  } else if (!process.env.VERCEL) {
    // Loud on purpose: a silent miss here presents as a database outage.
    console.warn("[env] " + SECRETS + " not found - local secrets are not loaded.");
  }
} catch (e) {
  console.warn("[env] could not read " + SECRETS + ": " + e.message);
}

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
  // There is deliberately no Content-Security-Policy here yet, but NOT for the
  // reason this comment used to give. It claimed a wrong CSP would silently
  // break payment. It would not: the Checkout Session is created server-side in
  // app/api/checkout/route.js and the browser is navigated to session.url on
  // checkout.stripe.com, so the card form runs on Stripe's origin under Stripe's
  // own policy. Stripe.js is never loaded on our pages, and CSP does not govern
  // top-level navigation.
  //
  // What a wrong CSP would actually break is this app. Next injects inline
  // bootstrap scripts, so a script-src without 'unsafe-inline' or a per-request
  // nonce leaves every page rendering and returning 200 while nothing
  // interactive works -- the booking form, the date picker, the console login.
  // No exception, no log line, nothing in Vercel. That is the failure worth
  // being careful about, and it argues for Content-Security-Policy-Report-Only
  // first: the browser reports what it WOULD have blocked and enforces nothing.
  //
  // Origins a real policy has to admit: embed.windy.com (frame-src, the radar
  // map on the site page), fonts.googleapis.com (style-src) and
  // fonts.gstatic.com (font-src).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The admin console holds guest contact details and the ledger.
          // Framing it elsewhere is the setup for a clickjacking attack, and
          // nothing here is meant to be embedded on another site.
          // Content-Security-Policy, in REPORT-ONLY mode. Nothing is blocked.
          // The browser evaluates this, posts what it WOULD have blocked to
          // /api/csp-report, and renders the page exactly as before.
          //
          // It is report-only because getting script-src wrong does not throw:
          // every page still renders and returns 200 while nothing interactive
          // works -- no booking form, no date picker, no console login -- and
          // nothing appears in any log. A guest who cannot book is how you find
          // out. So: watch the Vercel logs for "[csp]" for a week of real
          // traffic, add whatever legitimately appears, and only then rename
          // this header to Content-Security-Policy.
          //
          // Note what is NOT here: Stripe. Checkout is created server-side and
          // the browser is navigated to checkout.stripe.com, so the card form
          // runs on Stripe's origin under Stripe's own policy, and Stripe.js
          // never loads on our pages. The note that used to sit in this file
          // claimed a wrong policy would break payment. It would not.
          {
            key: "Content-Security-Policy-Report-Only",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; frame-src https://embed.windy.com; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; report-uri /api/csp-report",
          },
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
