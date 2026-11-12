import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Display: a condensed, industrial face for headlines. Data and body: a monospace, so columns line up.
// Served from the @fontsource packages so builds never fetch Google Fonts (that fetch flaked CI twice).
const display = localFont({
  variable: "--font-display",
  src: "../node_modules/@fontsource-variable/big-shoulders/files/big-shoulders-latin-wght-normal.woff2",
  weight: "100 900",
  adjustFontFallback: false,
});

const data = localFont({
  variable: "--font-data",
  src: [
    { path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
    { path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2", weight: "600" },
  ],
});

export const metadata: Metadata = {
  title: "Pumpwatch",
  description:
    "Real-time detection of coordinated pump-and-dump activity, built from social chatter, news, company filings and live trades.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${data.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
