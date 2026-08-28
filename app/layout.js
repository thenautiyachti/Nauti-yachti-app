import "./globals.css";

export const metadata = {
  title: "The Nauti Yachti — Lake Conroe, TX",
  description: "Boat charters on Lake Conroe, Texas.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
