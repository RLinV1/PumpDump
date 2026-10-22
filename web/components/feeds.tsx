import { heading } from "@/lib/ui";

const FEEDS = [
  {
    name: "Social posts",
    body: "Public posts from finance communities, collected as they appear.",
    extracts: ["Ticker mentions", "Account age", "Repeated text"],
  },
  {
    name: "Live trades",
    body: "Price and volume for a watchlist of tickers, in order, as they trade.",
    extracts: ["Price", "Volume", "Time of trade"],
  },
  {
    name: "News",
    body: "Headlines and company press releases, with the same story matched across outlets.",
    extracts: ["Headline", "Linked tickers", "Publication time"],
  },
  {
    name: "Company filings",
    body: "New 8-K reports, the official record that something material happened.",
    extracts: ["Filing type", "Item codes", "Filing time"],
  },
];

// A server component with CSS scroll-driven reveals: it ships no JavaScript of its own.
export function Feeds() {
  return (
    <section id="feeds" className="border-t border-line px-4 py-24 md:px-8 md:py-32">
      <div className="mx-auto max-w-[1400px]">
        <h2 className={`${heading} max-w-3xl`}>What it reads.</h2>
        <p className="mt-4 max-w-[56ch] leading-relaxed text-mute">
          Four feeds, matched to the same ticker and the same clock. Every record keeps the time it
          really happened, so any past day can be replayed through the same code as live data.
        </p>

        <div className="mt-12">
          {FEEDS.map((f) => (
            <div key={f.name} className="vr group relative grid gap-3 py-7 md:grid-cols-[220px_1fr_1.1fr] md:gap-10 md:py-8">
              <span className="vline absolute inset-x-0 top-0 h-px bg-line-strong transition-colors duration-200 group-hover:bg-amber" />
              <h3 className="text-xl font-semibold tracking-tight">{f.name}</h3>
              <p className="max-w-[44ch] leading-relaxed text-mute">{f.body}</p>
              <ul className="flex flex-wrap content-start gap-2">
                {f.extracts.map((e) => (
                  <li key={e} className="border border-line-strong px-2 py-1 font-mono text-xs text-mute transition-colors duration-200 group-hover:border-amber/60 group-hover:text-text">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="h-px bg-line-strong" />
        </div>
      </div>
    </section>
  );
}
