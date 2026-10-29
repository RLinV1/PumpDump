import type { Metadata } from "next";
import Link from "next/link";
import { LiveView } from "@/components/live-view";

export const metadata: Metadata = {
  title: "Live | Pumpwatch",
  description: "Live risk scores, score timelines and flags from the Pumpwatch API. Risk signal only, not investment advice.",
};

// Operate surface: the shell is static and paints immediately; LiveView fetches after first paint.
export default function LivePage() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line material">
        <nav className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 md:px-8">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Pumpwatch
          </Link>
          <span className="font-mono text-xs uppercase text-mute">Live</span>
        </nav>
      </header>
      <main className="pt-14">
        <LiveView />
      </main>
    </>
  );
}
