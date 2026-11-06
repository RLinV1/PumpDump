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
// Rendered as a numbered menu, the way a terminal lists its functions. Each feed carries a trace of its own character:
// many small posts, a price walk, sparse headlines, a rare filing.
export function Feeds() {
  const { W, H } = TRACE_BOX;
  return (
    <section id="feeds" className="border-b border-line py-12 md:py-16">
      <div className="mx-auto grid max-w-[1500px] gap-8 px-4 md:px-8 lg:grid-cols-[4fr_8fr] lg:gap-14">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <h2 className={heading}>What it reads.</h2>
          <p className="mt-4 max-w-[44ch] text-pretty leading-relaxed text-mute">
            Four feeds, matched to the same ticker and the same clock. Every record keeps the time it
            really happened, so any past day can be replayed through the same code as live data.
          </p>
        </div>

        <ol className="border-y border-line-strong">
          {FEEDS.map((f, i) => (
            <li
              key={f.name}
              className="vr group grid items-center gap-x-5 gap-y-2 border-b border-line py-5 last:border-b-0 md:grid-cols-[2.25rem_9rem_1fr_150px]"
            >
              <span className="font-mono text-sm font-semibold text-yellow">{i + 1}</span>
              <h3 className="font-display text-2xl font-extrabold uppercase leading-none text-accent">{f.name}</h3>
              <p className="max-w-[52ch] text-pretty text-[13px] leading-relaxed text-text">{f.body}</p>
              <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="hidden h-10 w-full md:block">
                {[0, 1, 2].map((t) => (
                  <path
                    key={t}
                    d={TRACES[f.kind](t + 1)}
                    fill="none"
                    stroke="var(--cyan)"
                    strokeOpacity={0.35 + t * 0.25}
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    transform={`translate(0 ${(t - 1) * 4})`}
                  />
                ))}
              </svg>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
