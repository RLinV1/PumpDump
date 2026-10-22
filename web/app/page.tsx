import { Detector } from "@/components/detector";
import { Hero, REPO_URL, keyBtn } from "@/components/hero";
import { MagneticLink } from "@/components/magnetic-link";
import { Panel } from "@/components/panel";
import { Pipeline, heading } from "@/components/pipeline";
import { Rise, SplitHeading } from "@/components/reveal";
import { ScrollProgress } from "@/components/scroll-progress";
import { SignalTimeline } from "@/components/signal-timeline";
import { Tape } from "@/components/tape";

const STATUS = [
  { name: "Ingestion pipeline", state: "Specified", done: true },
  { name: "News and filings", state: "Specified", done: true },
  { name: "Scoring model", state: "Not started", done: false },
  { name: "Alert app", state: "Not started", done: false },
];

const FKEYS = [
  { key: "F1", label: "How it works", href: "#how" },
  { key: "F2", label: "Detector", href: "#detector" },
  { key: "F3", label: "Status", href: "#status" },
];

export default function Home() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-bg">
        <nav className="mx-auto flex h-12 max-w-[1600px] items-center justify-between px-4 md:px-8">
          <a href="#" className="font-bold uppercase tracking-wide text-amber">
            Pumpwatch&gt;<span className="blink">_</span>
          </a>
          <div className="flex items-center gap-5 text-xs uppercase">
            {FKEYS.map((k) => (
              <a key={k.key} href={k.href} className="hidden items-center gap-2 transition hover:text-amber md:flex">
                <span className="bg-amber px-1 font-bold text-bg">{k.key}</span>
                {k.label}
              </a>
            ))}
            <a
              href={REPO_URL}
              className="inline-flex h-8 items-center border border-amber px-3 font-bold text-amber transition-colors hover:bg-amber hover:text-bg"
            >
              GitHub
            </a>
          </div>
        </nav>
        <ScrollProgress />
      </header>

      <main className="pt-12">
        <Tape />
        <Hero />
        <Pipeline />
        <SignalTimeline />
        <Detector />

        <section className="border-b border-line px-4 py-20 md:px-8 md:py-28">
          <div className="mx-auto max-w-[1600px]">
            <SplitHeading className={heading}>Not every spike is a pump.</SplitHeading>
            <div className="mt-10 grid gap-px bg-line md:grid-cols-2">
              <Rise>
                <Panel title="Hype only" tag="Scores high" barClassName="bg-down text-bg" className="h-full border-0">
                  <div className="p-5 md:p-8">
                    <p data-rise className="text-[clamp(1.5rem,3vw,2.5rem)] font-bold uppercase leading-tight text-down">
                      No filing. No headline.
                    </p>
                    <p data-rise className="mt-4 max-w-[44ch] text-sm leading-relaxed text-mute">
                      Posts surge from new accounts repeating one pitch. Volume jumps. Nothing
                      verifiable stands behind the move.
                    </p>
                  </div>
                </Panel>
              </Rise>
              <Rise delay={0.15}>
                <Panel title="Hype with a catalyst" tag="Scores low" barClassName="bg-up text-bg" className="h-full border-0">
                  <div className="p-5 md:p-8">
                    <p data-rise className="text-[clamp(1.5rem,3vw,2.5rem)] font-bold uppercase leading-tight text-up">
                      A filing lands. Wires confirm.
                    </p>
                    <p data-rise className="mt-4 max-w-[44ch] text-sm leading-relaxed text-mute">
                      An 8-K is filed and news stories confirm it. The same volume jump now has a
                      reason.
                    </p>
                  </div>
                </Panel>
              </Rise>
            </div>
          </div>
        </section>

        <section id="status" className="border-b border-line px-4 py-20 md:px-8 md:py-28">
          <div className="mx-auto max-w-[1600px]">
            <SplitHeading className={heading}>Built in the open.</SplitHeading>
            <Rise className="mt-10">
              <p data-rise className="max-w-[52ch] text-sm leading-relaxed text-mute">
                Each piece is written as a spec before any code. This is where they stand.
              </p>
              <div data-rise className="mt-6 max-w-3xl">
                <Panel title="Build status" tag="Live from the repo plan">
                  <dl>
                    {STATUS.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-baseline justify-between gap-4 border-t border-line px-4 py-3 first:border-t-0"
                      >
                        <dt className="font-bold uppercase">{item.name}</dt>
                        <dd className={`text-xs font-bold uppercase ${item.done ? "text-amber" : "text-mute"}`}>
                          [{item.state}]
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Panel>
              </div>
              <div data-rise className="mt-8">
                <MagneticLink href={REPO_URL} className={`${keyBtn} bg-amber text-bg hover:bg-text`}>
                  View on GitHub
                </MagneticLink>
              </div>
            </Rise>
          </div>
        </section>
      </main>

      <footer className="px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 text-xs text-mute">
          <p>Pumpwatch flags risk signals. It is not investment advice.</p>
          <p className="text-amber">
            PUMPWATCH&gt;<span className="blink">_</span>
          </p>
        </div>
      </footer>
    </>
  );
}
