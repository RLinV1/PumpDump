import { FLAG_LEVEL, area, chatter, explained, path, price, score, tChatter, tFiling } from "@/lib/curves";
import { heading } from "@/lib/ui";
import { verdictOf } from "@/lib/verdict";

const HYPE = { chatter, price, score };

const CASES = [
  {
    title: "Hype only",
    catalyst: false,
    body: "Posts surge from new accounts repeating one pitch. Volume jumps. Nothing verifiable stands behind the move, so the score crosses the flag level.",
    news: "None found",
    score: 72,
  },
  {
    title: "Hype with a catalyst",
    catalyst: true,
    body: "An 8-K is filed first, and news stories confirm it. The same ticker moves, but the chatter is calmer and the filing explains it, so the score stays well below the flag level.",
    news: "8-K filed before the move",
    score: 36,
  },
] as const;

const SCORE_Y = 100 - 8 - FLAG_LEVEL * 84;

// A server component: the charts wipe in with CSS scroll-driven animation and ship no JavaScript.
function Lanes({ catalyst }: { catalyst: boolean }) {
  const s = catalyst ? explained : HYPE;
  return (
    <div className="border border-line bg-surface">
      <svg
        viewBox="0 0 1000 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={
          catalyst
            ? "Illustrative chart: after an 8-K filing, chatter and price rise less, and the score stays below the flag level."
            : "Illustrative chart: with no filing or news, chatter and price rise sharply and the score crosses the flag level."
        }
        className="vclip block h-36 w-full"
      >
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 7" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area(s.chatter)} fill="var(--text)" fillOpacity="0.1" />
        <path d={path(s.price)} fill="none" stroke="var(--text)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={path(s.chatter)} fill="none" stroke="var(--text)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="relative h-10 border-t border-line">
        {[0.06, 0.15].map((t) => (
          <span key={t} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-mute" style={{ left: `${t * 100}%` }} />
        ))}
        {catalyst ? (
          <>
            <span className="absolute inset-y-0 w-px bg-accent" style={{ left: `${tFiling * 100}%` }} />
            <span
              className="absolute top-1/2 -translate-y-1/2 text-xs text-accent"
              style={{ left: `calc(${tFiling * 100}% + 8px)` }}
            >
              8-K filed
            </span>
          </>
        ) : (
          <span
            className="absolute inset-y-1.5 flex items-center justify-center border border-dashed border-accent/60 text-xs text-accent"
            style={{ left: `${tChatter * 100}%`, right: "6%" }}
          >
            No news. No filing.
          </span>
        )}
      </div>

      <svg
        aria-hidden
        viewBox="0 0 1000 100"
        preserveAspectRatio="none"
        className="vclip block h-16 w-full border-t border-line"
      >
        <line x1="0" x2="1000" y1={SCORE_Y} y2={SCORE_Y} stroke="var(--line-strong)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        <path d={area(s.score)} fill="var(--text)" fillOpacity="0.08" />
        <path d={path(s.score)} fill="none" stroke="var(--text)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function Contrast() {
  return (
    <section className="py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        <h2 className={`${heading} max-w-3xl`}>Not every spike is a pump.</h2>
        <div className="mt-12 grid gap-12 md:grid-cols-2 md:gap-16">
          {CASES.map((c) => {
            const verdict = verdictOf(c.score);
            return (
              <article key={c.title}>
                <Lanes catalyst={c.catalyst} />
                <div className="mt-5 flex items-start justify-between gap-6">
                  <h3 className="text-xl font-semibold tracking-tight">{c.title}</h3>
                  <span className={`shrink-0 px-2.5 py-1 font-mono text-xs font-medium uppercase tracking-wide ${verdict.style}`}>
                    {verdict.label}
                  </span>
                </div>
                <p className="mt-2 max-w-[46ch] text-pretty leading-relaxed text-mute">{c.body}</p>
                <dl className="mt-4 grid max-w-sm gap-1 font-mono text-xs text-mute">
                  <div className="flex justify-between">
                    <dt>News or filing</dt>
                    <dd className="text-text">{c.news}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Risk score, toy model</dt>
                    <dd className="tabular-nums text-text">{c.score}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
