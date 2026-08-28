import "./globals.css";

export const metadata = {
  title: "The Nauti Yachti — Lake Conroe, TX",
  description: "Boat charters on Lake Conroe, Texas.",
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
      <body>{children}</body>
    </html>
  );
}
