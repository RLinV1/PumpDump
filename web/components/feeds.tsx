import { TRACES, TRACE_BOX } from "@/lib/traces";
import { heading } from "@/lib/ui";

const FEEDS = [
  {
    name: "Social posts",
    kind: "posts",
    body: "Public posts from finance communities, collected as they appear. Pumpwatch keeps the ticker mentioned, the age of the account and any text that repeats.",
  },
  {
    name: "Live trades",
    kind: "trades",
    body: "Price and volume for a watchlist of tickers, in order, as they trade, each with the exact time of the trade.",
  },
  {
    name: "News",
    kind: "news",
    body: "Headlines and company press releases. The same story from several outlets is matched into one, with its linked tickers and publication time.",
  },
  {
    name: "Company filings",
    kind: "filings",
    body: "New 8-K reports, the official record that something material happened. Pumpwatch keeps the filing type, its item codes and the filing time.",
  },
] as const;

// A server component with CSS scroll-driven reveals: it ships no JavaScript of its own.
// Each feed carries a trace of its own character: many small posts, a price walk, sparse headlines, a rare filing.
export function Feeds() {
  const { W, H } = TRACE_BOX;
  return (
    <section id="feeds" className="px-4 py-24 md:px-8 md:py-32">
      <div className="mx-auto max-w-[1400px]">
        <h2 className={`${heading} max-w-3xl`}>What it reads.</h2>
        <p className="mt-4 max-w-[56ch] text-pretty leading-relaxed text-mute">
          Four feeds, matched to the same ticker and the same clock. Every record keeps the time it
          really happened, so any past day can be replayed through the same code as live data.
        </p>

        <div className="mt-12">
          {FEEDS.map((f) => (
            <div
              key={f.name}
              className="vr group relative grid items-center gap-4 py-8 md:grid-cols-[190px_1fr_260px] md:gap-10"
            >
              <span className="vline absolute inset-x-0 top-0 h-px bg-line-strong transition-colors duration-200 group-hover:bg-amber" />
              <h3 className="text-xl font-semibold tracking-tight">{f.name}</h3>
              <p className="max-w-[52ch] text-pretty leading-relaxed text-mute">{f.body}</p>
              <svg
                aria-hidden
                viewBox={`0 0 ${W} ${H}`}
                className="h-14 w-full max-w-[260px] md:justify-self-end"
              >
                {[0, 1, 2].map((i) => (
                  <path
                    key={i}
                    d={TRACES[f.kind](i + 1)}
                    fill="none"
                    stroke="var(--text)"
                    strokeOpacity={0.18 + i * 0.12}
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    className="transition-[stroke,stroke-opacity] duration-200 group-hover:stroke-amber group-hover:[stroke-opacity:0.9]"
                    transform={`translate(0 ${(i - 1) * 4})`}
                  />
                ))}
              </svg>
            </div>
          ))}
          <div className="h-px bg-line-strong" />
        </div>
      </div>
    </section>
  );
}
