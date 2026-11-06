import { Contrast } from "@/components/contrast";
import { Detector } from "@/components/detector";
import { Feeds } from "@/components/feeds";
import { Hero } from "@/components/hero";
import { ScrollProgress } from "@/components/scroll-progress";
import { Story } from "@/components/story";
import { REPO_URL, btnPrimary, heading } from "@/lib/ui";

const STATUS = [
  { name: "Ingestion pipeline", state: "Implemented" },
  { name: "News and filings", state: "Implemented" },
  { name: "Risk scoring", state: "Rules scorer available" },
  { name: "API and alerts", state: "Implemented" },
];

const NAV = [
  { key: "1", label: "How it works", href: "#how" },
  { key: "2", label: "Detector", href: "#detector" },
  { key: "3", label: "Terminal", href: "/live" },
  { key: "4", label: "GitHub", href: REPO_URL },
];

export default function Home() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-accent bg-bg">
        <nav aria-label="Primary" className="mx-auto flex h-12 max-w-[1500px] items-stretch justify-between px-4 md:px-8">
          <a href="#" className="flex items-center font-display text-3xl font-black uppercase leading-none tracking-wide text-accent">
            Pumpwatch
          </a>
          <ul className="flex items-stretch text-xs">
            {NAV.map((n) => (
              <li key={n.key} className="flex">
                <a href={n.href} className={`flex min-w-11 items-center gap-1.5 px-2 uppercase text-white hover:bg-accent hover:text-bg sm:px-3.5 ${n.key === "1" || n.key === "4" ? "max-sm:hidden" : ""}`}>
                  <span className="text-yellow [a:hover_&]:text-bg">{n.key}</span>
                  <span>{n.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <ScrollProgress />
      </header>

      <main>
        <Hero />
        <Feeds />
        <Story />
        <Detector />
        <Contrast />

        <section id="status" className="pb-14 pt-10 md:pb-20 md:pt-14">
          <div className="mx-auto max-w-[1500px] px-4 md:px-8">
            <h2 className={`${heading} max-w-5xl`}>From signals to evidence.</h2>
            <p className="mt-4 max-w-[62ch] text-pretty leading-relaxed text-mute">
              Ingestion, a versioned rules scorer, the read API and webhook alerts are implemented.
              Learned scoring and volatility forecasts still need validation before they can replace the baselines.
            </p>
            <table className="mt-8 w-full max-w-4xl border-y border-line-strong text-left text-sm">
              <caption className="sr-only">Build status</caption>
              <tbody>
                {STATUS.map((s, i) => (
                  <tr key={s.name} className="border-b border-line last:border-b-0">
                    <th scope="row" className="w-10 py-3 font-semibold text-yellow">{i + 1}</th>
                    <td className="py-3 font-semibold text-accent">{s.name}</td>
                    <td className="py-3 text-right text-white">{s.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-8">
              <a href={REPO_URL} className={btnPrimary}>
                View on GitHub &lt;GO&gt;
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-accent py-6">
        <div className="mx-auto grid max-w-[1500px] gap-2 px-4 text-xs text-mute md:grid-cols-2 md:px-8">
          <p>The market panel is labeled live, mock or simulated. Interactive examples elsewhere on this page use invented data.</p>
          <p className="md:text-right">
            Risk signal only. Not investment advice. Pumpwatch connects to no broker and is a non-commercial project.
          </p>
        </div>
      </footer>
    </>
  );
}
