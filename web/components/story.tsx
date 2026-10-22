"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  FLAG_LEVEL,
  area,
  chatter,
  path,
  price,
  score,
  tChatter,
  tChatterPeak,
  tFlag,
  tPrice,
  tPricePeak,
} from "@/lib/curves";
import { heading } from "@/lib/ui";

const CAPTIONS = [
  { title: "Chatter builds first.", body: "New accounts start repeating the same pitch across finance boards." },
  { title: "Price follows, with no catalyst.", body: "Volume and price jump together. No filing and no headline explain the move." },
  { title: "Pumpwatch raises the flag.", body: "Chatter, trading and the missing news score as a pump risk before the price falls back." },
];

const THRESHOLD_Y = 100 - 8 - FLAG_LEVEL * 84;
const ORDINARY_NEWS = [0.06, 0.15, 0.22];
const TICKS = ["6h ago", "5h", "4h", "3h", "2h", "1h", "now"];
const GRID = [25, 50, 75];

const row = "md:grid md:grid-cols-[190px_1fr] md:gap-x-6";
const label = "flex flex-col justify-center py-2 md:py-0";
const dotY = (v: number) => `${8 + (1 - v) * 84}%`;

// A marker that rides its curve while the cursor sweeps. Its top is set from the timeline.
function Dot({ k, tone }: { k: string; tone: string }) {
  return (
    <span
      data-dot={k}
      aria-hidden
      className={`absolute hidden size-2 -translate-x-1/2 -translate-y-1/2 rounded-full md:block ${tone}`}
      style={{ left: "calc(var(--p, 1) * 100%)", top: "50%" }}
    />
  );
}

function Grid() {
  return (
    <>
      {GRID.map((y) => (
        <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
    </>
  );
}

// The scroll position is the time axis. One cursor sweeps every feed at once, so the order of events
// (chatter, then price, then the flag) is felt, and the lanes stay aligned because they share one series.
export function Story() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia(root);

    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
      const lanes = root.current!.querySelector<HTMLElement>("[data-lanes]")!;
      const reveals = gsap.utils.toArray<SVGElement>("[data-reveal]");
      const caps = gsap.utils.toArray<HTMLElement>("[data-cap]");
      const read = (k: string) => root.current!.querySelector<HTMLElement>(`[data-read="${k}"]`)!;
      const dot = (k: string) => root.current!.querySelector<HTMLElement>(`[data-dot="${k}"]`)!;
      const state = { p: 0 };

      const apply = () => {
        const p = state.p;
        const clip = `inset(0 ${(1 - p) * 100}% 0 0)`;
        reveals.forEach((el) => (el.style.clipPath = clip));
        lanes.style.setProperty("--p", String(p));

        const c = chatter(p);
        const pr = price(p);
        const s = score(p);
        dot("chatter").style.top = dotY(c);
        dot("price").style.top = dotY(pr);
        dot("score").style.top = dotY(s);

        read("chatter").textContent = `x${(1 + c * 13).toFixed(0)} normal`;
        const pct = ((pr - 0.14) / 0.66) * 92;
        const priceEl = read("price");
        priceEl.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
        priceEl.style.color = pct >= 0 ? "var(--up)" : "var(--down)";
        read("news").textContent = p < tChatter ? "Routine headlines" : "Nothing new";
        read("score").textContent = String(Math.round(s * 100));
      };

      gsap.set(caps.slice(1), { autoAlpha: 0, y: 8 });
      gsap.set("[data-a]", { autoAlpha: 0, y: 4 });
      apply();

      const T = (p: number) => p * 10;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: "top top", end: "+=2400", pin: true, scrub: 0.6 },
      });

      tl.to(state, { p: 1, duration: 10, ease: "none", onUpdate: apply }, 0)
        .to('[data-a="chatter"]', { autoAlpha: 1, y: 0, duration: 0.35 }, T(tChatter + 0.04))
        .to('[data-a="price"]', { autoAlpha: 1, y: 0, duration: 0.35 }, T(tPrice))
        .to('[data-a="news"]', { autoAlpha: 1, y: 0, duration: 0.35 }, T(tPrice + 0.02))
        .to('[data-a="flag"]', { autoAlpha: 1, y: 0, duration: 0.35 }, T(tFlag))
        .to(caps[0], { autoAlpha: 0, y: -8, duration: 0.3 }, T(tPrice - 0.06))
        .to(caps[1], { autoAlpha: 1, y: 0, duration: 0.3 }, T(tPrice - 0.06))
        .to(caps[1], { autoAlpha: 0, y: -8, duration: 0.3 }, T(tFlag))
        .to(caps[2], { autoAlpha: 1, y: 0, duration: 0.3 }, T(tFlag))
        .to({}, { duration: 1 });

      return () => {
        reveals.forEach((el) => (el.style.clipPath = ""));
      };
    });

    return () => mm.revert();
  }, []);

  return (
    <section id="how" ref={root} className="border-t border-line">
      <div className="mx-auto flex min-h-[100dvh] max-w-[1400px] flex-col justify-center gap-8 px-4 pb-12 pt-24 md:px-8">
        <div>
          <h2 className={`${heading} max-w-3xl`}>A pump has a shape.</h2>
          <div className="cap-stack mt-4 grid gap-3">
            {CAPTIONS.map((c) => (
              <p key={c.title} data-cap className="max-w-[60ch] text-lg leading-snug">
                <span className="font-medium">{c.title}</span>{" "}
                <span className="text-mute">{c.body}</span>
              </p>
            ))}
          </div>
        </div>

        <div data-lanes className="relative">
          <div
            data-cursor
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-10 hidden w-px bg-text/70 md:block"
            style={{ left: "calc(190px + 1.5rem + (100% - 190px - 1.5rem) * var(--p, 1))" }}
          />

          {/* Social posts */}
          <div className={`${row} border-t border-line`}>
            <div className={label}>
              <p className="text-sm font-medium">Social posts</p>
              <p className="font-mono text-xs text-mute">Finance boards, all day</p>
              <p data-read="chatter" className="mt-1 hidden font-mono text-sm tabular-nums text-amber md:block" />
            </div>
            <div className="relative h-24 md:h-28">
              <svg data-reveal viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <Grid />
                <path d={area(chatter)} fill="var(--amber)" fillOpacity="0.12" />
                <path d={path(chatter)} fill="none" stroke="var(--amber)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
              <Dot k="chatter" tone="bg-amber" />
              <p
                data-a="chatter"
                className="absolute top-1 font-mono text-xs text-amber"
                style={{ left: `calc(${tChatterPeak * 100}% + 12px)` }}
              >
                Same pitch, new accounts
              </p>
            </div>
          </div>

          {/* Live trades */}
          <div className={`${row} border-t border-line`}>
            <div className={label}>
              <p className="text-sm font-medium">Live trades</p>
              <p className="font-mono text-xs text-mute">Price for the ticker</p>
              <p data-read="price" className="mt-1 hidden font-mono text-sm tabular-nums md:block" />
            </div>
            <div className="relative h-24 md:h-28">
              <svg data-reveal viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <Grid />
                <path d={path(price)} fill="none" stroke="var(--text)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
              <Dot k="price" tone="bg-text" />
              <p
                data-a="price"
                className="absolute top-1 font-mono text-xs text-text"
                style={{ left: `calc(${tPricePeak * 100}% + 12px)` }}
              >
                Price follows
              </p>
            </div>
          </div>

          {/* News and filings */}
          <div className={`${row} border-t border-line`}>
            <div className={label}>
              <p className="text-sm font-medium">News and filings</p>
              <p className="font-mono text-xs text-mute">Headlines and 8-K reports</p>
              <p data-read="news" className="mt-1 hidden font-mono text-sm text-mute md:block" />
            </div>
            <div className="relative h-14 md:h-16">
              <svg data-reveal viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <line x1="0" x2="1000" y1="50" y2="50" stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                {ORDINARY_NEWS.map((t) => (
                  <line key={t} x1={t * 1000} x2={t * 1000} y1="34" y2="66" stroke="var(--mute)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
              <div
                data-a="news"
                className="absolute inset-y-2 flex items-center justify-center border border-dashed border-amber/60 font-mono text-xs text-amber"
                style={{ left: `${tChatter * 100}%`, right: "6%" }}
              >
                No news. No filing.
              </div>
            </div>
          </div>

          {/* Risk score */}
          <div className={`${row} border-y border-line`}>
            <div className={label}>
              <p className="text-sm font-medium">Risk score</p>
              <p className="font-mono text-xs text-mute">Chatter and price, minus any catalyst</p>
              <p data-read="score" className="mt-1 hidden font-mono text-sm tabular-nums text-amber md:block" />
            </div>
            <div className="relative h-24 md:h-28">
              <svg data-reveal viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <line x1="0" x2="1000" y1={THRESHOLD_Y} y2={THRESHOLD_Y} stroke="var(--line-strong)" strokeDasharray="4 6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <path d={area(score)} fill="var(--amber)" fillOpacity="0.08" />
                <path d={path(score)} fill="none" stroke="var(--amber)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              </svg>
              <Dot k="score" tone="bg-amber" />
              <p className="absolute right-0 font-mono text-xs text-mute" style={{ top: `calc(${THRESHOLD_Y}% - 18px)` }}>
                Flag level
              </p>
              <div data-a="flag" className="absolute inset-y-0" style={{ left: `${tFlag * 100}%` }}>
                <span className="absolute inset-y-0 w-px bg-amber" />
                <span className="absolute left-2 top-1 bg-amber px-1.5 py-0.5 font-mono text-xs font-medium uppercase text-bg">
                  Flag raised
                </span>
              </div>
            </div>
          </div>

          <div className={`${row} mt-2`}>
            <span />
            <div className="flex justify-between font-mono text-xs text-mute">
              {TICKS.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>
        </div>

        <p className="font-mono text-xs text-mute">Illustrative shape, not market data.</p>
      </div>
    </section>
  );
}
