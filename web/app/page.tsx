import { Detector } from "@/components/detector";
import { Hero, REPO_URL } from "@/components/hero";
import { MagneticLink } from "@/components/magnetic-link";
import { Pipeline } from "@/components/pipeline";
import { Rise, SplitHeading } from "@/components/reveal";
import { ScrollProgress } from "@/components/scroll-progress";
import { SignalTimeline } from "@/components/signal-timeline";
import { SourceMarquee } from "@/components/source-marquee";

const STATUS = [
  { name: "Ingestion pipeline", state: "Specified" },
  { name: "News and filings", state: "Specified" },
  { name: "Scoring model", state: "Not started" },
  { name: "Alert app", state: "Not started" },
];

const display = "font-display font-black uppercase leading-[0.9] tracking-tight";
const heading = `${display} text-6xl md:text-8xl`;

export default function Home() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b-2 border-ink bg-paper">
        <nav className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 md:px-8">
          <a href="#" className="font-display text-3xl font-black uppercase leading-none tracking-tight">
            Pumpwatch
          </a>
          <div className="flex items-center gap-6 font-mono text-xs uppercase tracking-wide">
            <a href="#how" className="hidden transition hover:text-accent md:inline">
              How it works
            </a>
            <a href="#detector" className="hidden transition hover:text-accent md:inline">
              Try it
            </a>
            <a href="#status" className="hidden transition hover:text-accent md:inline">
              Status
            </a>
            <a
              href={REPO_URL}
              className="inline-flex h-9 items-center border-2 border-ink px-3 transition-colors hover:bg-ink hover:text-paper"
            >
              GitHub
            </a>
          </div>
        </nav>
        <ScrollProgress />
      </header>

      <main>
        <Hero />
        <SourceMarquee />
        <Pipeline />
        <SignalTimeline />
        <Detector />

        <section className="bg-paper">
          <div className="mx-auto max-w-[1600px] px-4 pt-24 md:px-8 md:pt-32">
            <SplitHeading className={`${heading} max-w-5xl`}>Not every spike is a pump.</SplitHeading>
          </div>
          <div className="mt-14 grid md:grid-cols-2">
            <Rise className="bg-ink px-4 py-14 text-paper md:px-8 md:py-20">
              <p data-rise className={`${display} text-[clamp(3rem,8vw,7rem)]`}>
                Hype only
              </p>
              <p data-rise className="mt-5 max-w-[40ch] leading-relaxed text-mute-ink">
                Posts surge from new accounts repeating one pitch. Volume jumps. There is no filing
                and no headline behind it.
              </p>
              <p data-rise className="mt-8 font-display text-4xl font-black uppercase text-accent">
                Scores high
              </p>
            </Rise>
            <Rise delay={0.15} className="bg-accent px-4 py-14 text-ink md:px-8 md:py-20">
              <p data-rise className={`${display} text-[clamp(3rem,8vw,7rem)]`}>
                Hype with a catalyst
              </p>
              <p data-rise className="mt-5 max-w-[40ch] leading-relaxed">
                An 8-K lands and wire stories confirm it. The same volume jump now has a reason.
              </p>
              <p data-rise className="mt-8 font-display text-4xl font-black uppercase">
                Scores low
              </p>
            </Rise>
          </div>
        </section>

        <section id="status" className="border-t-2 border-ink bg-paper px-4 py-24 md:px-8 md:py-32">
          <div className="mx-auto max-w-[1600px]">
            <SplitHeading className={heading}>Built in the open.</SplitHeading>
            <Rise className="mt-10">
              <p data-rise className="max-w-[48ch] leading-relaxed text-mute">
                Each piece is written as a spec before any code. This is where they stand.
              </p>
              <dl className="mt-10 border-t-2 border-ink">
                {STATUS.map((item) => (
                  <div
                    key={item.name}
                    data-rise
                    className="flex items-baseline justify-between gap-6 border-b-2 border-ink py-4 transition-colors hover:bg-ink hover:text-paper md:px-4"
                  >
                    <dt className="font-display text-3xl font-black uppercase leading-none md:text-5xl">
                      {item.name}
                    </dt>
                    <dd className="font-mono text-sm uppercase">[{item.state}]</dd>
                  </div>
                ))}
              </dl>
              <div data-rise className="mt-10">
                <MagneticLink
                  href={REPO_URL}
                  className="inline-flex h-14 items-center border-2 border-ink bg-ink px-8 font-mono text-sm uppercase tracking-wide text-paper transition-[background-color,color,scale] hover:bg-accent hover:text-ink active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                >
                  View on GitHub
                </MagneticLink>
              </div>
            </Rise>
          </div>
        </section>
      </main>

      <footer className="overflow-hidden bg-ink text-paper">
        <p className="mx-auto max-w-[1600px] px-4 pt-10 font-mono text-sm text-mute-ink md:px-8">
          Pumpwatch flags risk signals. It is not investment advice.
        </p>
        <p
          aria-hidden
          className={`${display} select-none px-4 pt-6 text-[clamp(4rem,19vw,22rem)] leading-[0.78] md:px-8`}
        >
          Pumpwatch
        </p>
      </footer>
    </>
  );
}
