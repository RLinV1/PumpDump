import { Contrast } from "@/components/contrast";
import { Detector } from "@/components/detector";
import { Feeds } from "@/components/feeds";
import { Hero } from "@/components/hero";
import { RidgeDivider } from "@/components/ridge-divider";
import { RidgeField } from "@/components/ridge-field";
import { ScrollProgress } from "@/components/scroll-progress";
import { Story } from "@/components/story";
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
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line material">
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
        <RidgeDivider seed={2} />
        <Story />
        <Detector />
        <RidgeDivider seed={5} hot />
        <Contrast />

        <section id="status" className="relative isolate overflow-hidden border-t border-line pb-72 pt-24 md:pb-80 md:pt-32">
          <RidgeField variant="calm" />
          <div data-hero-copy className="relative mx-auto max-w-[1400px] px-4 md:px-8">
            <h2 className={`${heading} max-w-3xl`}>The scorer is next.</h2>
            <p className="vr mt-4 max-w-[52ch] text-pretty leading-relaxed text-mute">
              Each piece is written as a spec before any code. Two are specified. Next is training the
              scorer on labelled pump cases, then wiring alerts.
            </p>
            <div className="vr mt-8 grid grid-cols-4 gap-[3px]" aria-hidden>
              {STATUS.map((s) => (
                <span key={s.name} className={`h-1.5 ${s.done ? "bg-accent" : "bg-line-strong"}`} />
              ))}
            </div>
            <dl className="vr mt-4 grid gap-6 md:grid-cols-4">
              {STATUS.map((s) => (
                <div key={s.name}>
                  <dt className="font-medium">{s.name}</dt>
                  <dd className={`text-sm ${s.done ? "text-accent" : "text-mute"}`}>{s.state}</dd>
                </div>
              ))}
            </dl>
            <div className="vr mt-10">
              <a href={REPO_URL} className={btnPrimary}>
                View on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8">
        <div className="mx-auto grid max-w-[1400px] gap-2 px-4 text-sm md:px-8 text-mute md:grid-cols-2">
          <p>BYND is an example ticker only. Every price, post count and score on this page is simulated and says nothing about real trading.</p>
          <p className="md:text-right">
            Pumpwatch flags risk signals. It is not investment advice, and it connects to no broker.
          </p>
        </div>
      </footer>
    </>
  );
}
