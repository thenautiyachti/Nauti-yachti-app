import "./globals.css";
import JsonLd from "../components/JsonLd";
import {
  SITE_URL,
  SITE_NAME,
  localBusinessJsonLd,
  websiteJsonLd,
} from "../lib/seo";

// `metadataBase` lets every page below express its canonical and og:image as a
// relative path and still emit a fully-qualified URL. Without it, relative
// URL-based metadata fields are a build error in Next 16.
//
// The title `template` means each page supplies only its own distinctive part;
// `default` is the fallback for any route that forgets. Previously every route
// inherited one hardcoded title, so the whole site looked like a single
// duplicate page to Google.
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Boat Charters on Lake Conroe, TX | The Nauti Yachti",
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Private boat charters and party boat rentals on Lake Conroe, TX. Captained tubing, birthday, bachelorette and corporate charters for up to 14 guests, plus a self-drive pontoon option.",
  applicationName: SITE_NAME,
  // NOTE: deliberately NO `alternates.canonical` here. Metadata is merged down
  // the tree, so a canonical set on the root layout is INHERITED by every page
  // that does not override it — which would make /events, /terms and friends
  // all declare themselves duplicates of the homepage and drop out of the
  // index. Each route sets its own canonical via pageMetadata() instead.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: { telephone: true },
  // SEO TODO (owner): once Google Search Console is set up, paste the
  // verification token here as `verification: { google: "..." }` — or verify
  // via DNS, which does not need a code change.
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Orbitron / Share Tech Mono — used by the admin console's Jarvis
            HUD tab only, matching the standalone Jarvis-Voice-UI display font. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet" />
      </head>
      <body>
        {/* Sitewide business identity. Emitted once, in the server-rendered
            HTML, so crawlers that do not execute JavaScript still see it. */}
        <JsonLd data={[localBusinessJsonLd(), websiteJsonLd()]} />
        {children}
      </body>
    </html>
  );
}
