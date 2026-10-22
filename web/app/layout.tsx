import type { Metadata } from "next";
import { Geist, Geist_Mono, Big_Shoulders } from "next/font/google";
import { SmoothScroll } from "@/components/smooth-scroll";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bigShoulders = Big_Shoulders({
  variable: "--font-bigshoulders",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pumpwatch",
  description:
    "Real-time detection of coordinated pump-and-dump activity, built from social chatter, news, company filings and live trades.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bigShoulders.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
