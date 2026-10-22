"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { area, chatter, path, price, tChatter } from "@/lib/curves";
import { heading } from "@/lib/ui";
import { verdictOf } from "@/lib/verdict";
import { SplitHeading } from "./reveal";

const CASES = [
  {
    title: "Hype only",
    catalyst: false,
    body: "Posts surge from new accounts repeating one pitch. Volume jumps. Nothing verifiable stands behind the move.",
    news: "None found",
    score: 72,
  },
  {
    title: "Hype with a catalyst",
    catalyst: true,
    body: "An 8-K is filed and news stories confirm it. The same volume jump now has a reason.",
    news: "8-K filed before the spike",
    score: 36,
  },
];

function Lanes({ catalyst }: { catalyst: boolean }) {
  return (
    <div className="border border-line bg-surface">
      <svg
        data-clip
        viewBox="0 0 1000 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={
          catalyst
            ? "Illustrative chart: chatter and price rise after an 8-K filing."
            : "Illustrative chart: chatter and price rise with no filing or news."
        }
        className="block h-36 w-full"
      >
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 7" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area(chatter)} fill="var(--amber)" fillOpacity="0.1" />
        <path d={path(price)} fill="none" stroke="var(--text)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={path(chatter)} fill="none" stroke="var(--amber)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative h-10 border-t border-line">
        {[0.06, 0.15, 0.22].map((t) => (
          <span key={t} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-mute" style={{ left: `${t * 100}%` }} />
        ))}
        {catalyst ? (
          <>
            <span className="absolute inset-y-0 w-px bg-amber" style={{ left: `${(tChatter - 0.06) * 100}%` }} />
            <span
              className="absolute top-1/2 -translate-y-1/2 font-mono text-xs text-amber"
              style={{ left: `calc(${(tChatter - 0.06) * 100}% + 8px)` }}
            >
              8-K filed
            </span>
          </>
        ) : (
          <span
            className="absolute inset-y-1.5 flex items-center justify-center border border-dashed border-amber/60 font-mono text-xs text-amber"
            style={{ left: `${tChatter * 100}%`, right: "6%" }}
          >
            No news. No filing.
          </span>
        )}
      </div>
    </div>
  );
}

export function Contrast() {
  const root = useRef<HTMLElement>(null);

  // The charts draw in once as they enter, left to right, the same direction time runs in the story above.
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.utils.toArray<SVGElement>("[data-clip]").forEach((el, i) => {
        gsap.fromTo(
          el,
          { clipPath: "inset(0 100% 0 0)" },
          {
            clipPath: "inset(0 0% 0 0)",
            duration: 1.1,
            ease: "power3.out",
            delay: i * 0.12,
            scrollTrigger: { trigger: el, start: "top 85%", once: true },
          },
        );
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="border-t border-line px-4 py-24 md:px-8 md:py-32">
      <div className="mx-auto max-w-[1400px]">
        <SplitHeading className={`${heading} max-w-3xl`}>Not every spike is a pump.</SplitHeading>
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
                <p className="mt-2 max-w-[46ch] leading-relaxed text-mute">{c.body}</p>
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
