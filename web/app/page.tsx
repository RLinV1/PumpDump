import { Contrast } from "@/components/contrast";
import { Detector } from "@/components/detector";
import { Feeds } from "@/components/feeds";
import { Hero } from "@/components/hero";
import { Rise, SplitHeading } from "@/components/reveal";
import { ScrollProgress } from "@/components/scroll-progress";
import { Story } from "@/components/story";
import { VantaBg } from "@/components/vanta-bg";
import { REPO_URL, btnPrimary, heading } from "@/lib/ui";

const STATUS = [
  { name: "Ingestion pipeline", state: "Spec written", done: true },
  { name: "News and filings", state: "Spec written", done: true },
  { name: "Scoring model", state: "Not started", done: false },
  { name: "Alert app", state: "Not started", done: false },
];

export default function Home() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 md:px-8">
          <a href="#" className="text-lg font-semibold tracking-tight">
            Pumpwatch
          </a>
          <div className="flex items-center gap-5 text-sm">
            <a href="#how" className="hidden text-mute transition-colors duration-150 hover:text-text sm:inline">
              How it works
            </a>
            <a href="#detector" className="text-mute transition-colors duration-150 hover:text-text">
              Detector
            </a>
            <a
              href={REPO_URL}
              className="inline-flex h-9 items-center border border-line-strong px-3 font-medium transition-colors duration-150 hover:border-text"
            >
              GitHub
            </a>
          </div>
        </nav>
        <ScrollProgress />
      </header>

      <main>
        <Hero />
        <Feeds />
        <Story />
        <Detector />
        <Contrast />

        <section id="status" className="relative isolate overflow-hidden border-t border-line px-4 py-24 md:px-8 md:py-40">
          <VantaBg />
          <div className="relative mx-auto max-w-[1400px]">
            <SplitHeading className={`${heading} max-w-3xl`}>The scorer is next.</SplitHeading>
            <Rise className="mt-10">
              <p data-rise className="max-w-[52ch] leading-relaxed text-mute">
                Each piece is written as a spec before any code. Two are specified, two are still to
                build.
              </p>
              <div data-rise className="mt-8 grid grid-cols-4 gap-[3px]" aria-hidden>
                {STATUS.map((s) => (
                  <span key={s.name} className={`h-1.5 ${s.done ? "bg-amber" : "bg-line-strong"}`} />
                ))}
              </div>
              <dl data-rise className="mt-4 grid gap-6 md:grid-cols-4">
                {STATUS.map((s) => (
                  <div key={s.name}>
                    <dt className="font-medium">{s.name}</dt>
                    <dd className={`font-mono text-xs ${s.done ? "text-amber" : "text-mute"}`}>{s.state}</dd>
                  </div>
                ))}
              </dl>
              <div data-rise className="mt-10">
                <a href={REPO_URL} className={btnPrimary}>
                  View on GitHub
                </a>
              </div>
            </Rise>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-8 md:px-8">
        <div className="mx-auto grid max-w-[1400px] gap-2 text-xs text-mute md:grid-cols-2">
          <p>All symbols, prices and scores on this page are invented.</p>
          <p className="md:text-right">
            Pumpwatch flags risk signals. It is not investment advice, and it connects to no broker.
          </p>
        </div>
      </footer>
    </>
  );
}
