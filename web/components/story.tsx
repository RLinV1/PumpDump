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
  { title: "Pumpwatch raises the flag.", body: "It fires while the price is still high, well before the price falls back." },
];

const THRESHOLD_Y = 100 - 8 - FLAG_LEVEL * 84;
const ORDINARY_NEWS = [0.06, 0.15, 0.22];
const TICKS = ["6h ago", "5h", "4h", "3h", "2h", "1h", "now"];
const GRID = [25, 50, 75];

// The cursor stops just after the flag. The curves keep drawing, so the visitor sees the price fall back
// after the warning, and the readouts stay frozen at the moment that matters.
const STOP = tFlag + 0.05;

const row = "md:grid md:grid-cols-[190px_1fr] md:gap-x-6";
const label = "flex flex-col justify-center py-2 md:py-0";
const yFrac = (v: number) => 0.08 + (1 - v) * 0.84;

// A marker that rides its curve while the cursor sweeps. It is positioned with transform only.
function Dot({ k, tone }: { k: string; tone: string }) {
  return (
    <span
      data-dot={k}
      aria-hidden
      className={`absolute left-0 top-0 z-[3] hidden size-2 rounded-full ${tone}`}
    />
  );
}

// Slides across a lane to uncover it as time passes. Transform only, so scrolling never repaints the lane.
function Cover() {
  return <span data-cover aria-hidden className="absolute inset-0 z-[1] hidden bg-bg" />;
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
      const r = root.current!;
      const lanes = r.querySelector<HTMLElement>("[data-lanes]")!;
      const cursor = r.querySelector<HTMLElement>("[data-cursor]")!;
      const covers = gsap.utils.toArray<HTMLElement>("[data-cover]", r);
      const dots = gsap.utils.toArray<HTMLElement>("[data-dot]", r);
      const caps = gsap.utils.toArray<HTMLElement>("[data-cap]", r);
      const read = (k: string) => r.querySelector<HTMLElement>(`[data-read="${k}"]`)!;
      const readouts = { chatter: read("chatter"), price: read("price"), news: read("news"), score: read("score") };
      const fns: Record<string, (t: number) => number> = { chatter, price, score };
      const shown: Record<string, string> = {};
      const state = { p: 0 };

      // Measured once and on refresh, so a scroll frame does no layout reads.
      let laneW = 0;
      let off = 0;
      const heights = new Map<HTMLElement, number>();
      const measure = () => {
        const cell = covers[0].parentElement!;
        laneW = cell.clientWidth;
        off = cell.getBoundingClientRect().left - lanes.getBoundingClientRect().left;
        dots.forEach((d) => heights.set(d, d.parentElement!.clientHeight));
      };

      const setText = (key: string, el: HTMLElement, text: string, color?: string) => {
        if (shown[key] !== text) {
          el.textContent = text;
          shown[key] = text;
        }
        if (color) el.style.color = color;
      };

      const apply = () => {
        const p = state.p;
        const pc = Math.min(p, STOP);
        const cover = `translate3d(${p * 100}%,0,0)`;
        covers.forEach((c) => (c.style.transform = cover));
        cursor.style.transform = `translate3d(${off + laneW * pc}px,0,0)`;
        dots.forEach((d) => {
          const v = fns[d.dataset.dot!](pc);
          d.style.transform = `translate3d(${laneW * pc - 4}px,${heights.get(d)! * yFrac(v) - 4}px,0)`;
        });

        const c = chatter(pc);
        const pr = price(pc);
        const pct = ((pr - 0.14) / 0.66) * 92;
        setText("chatter", readouts.chatter, `x${(1 + c * 13).toFixed(0)} normal`);
        setText("price", readouts.price, `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, pct >= 0 ? "var(--up)" : "var(--down)");
        setText("news", readouts.news, pc < tChatter ? "Routine headlines" : "Nothing new");
        setText("score", readouts.score, String(Math.round(score(pc) * 100)));
      };

      covers.forEach((c) => (c.style.display = "block"));
      dots.forEach((d) => (d.style.display = "block"));
      cursor.style.display = "block";
      measure();
      ScrollTrigger.addEventListener("refresh", measure);

      gsap.set(caps.slice(1), { autoAlpha: 0, y: 8 });
      gsap.set("[data-a]", { autoAlpha: 0, y: 4 });
      apply();

      const T = (p: number) => p * 10;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: r, start: "top top", end: "+=2400", pin: true, scrub: 0.6 },
      });

      tl.to(state, { p: 1, duration: 10, ease: "none", onUpdate: apply }, 0)
        .to('[data-a="chatter"]', { autoAlpha: 1, y: 0, duration: 0.35 }, T(tChatter + 0.04))
        .to('[data-a="price"]', { autoAlpha: 1, y: 0, duration: 0.35 }, T(tPrice))
        .to('[data-a="news"]', { autoAlpha: 1, y: 0, duration: 0.35 }, T(tPrice + 0.02))
        .to('[data-a="flag"]', { autoAlpha: 1, y: 0, duration: 0.35 }, T(tFlag))
        // Each caption fully leaves before the next arrives, so two never overlap on screen.
        .to(caps[0], { autoAlpha: 0, y: -8, duration: 0.15 }, T(tPrice - 0.06))
        .to(caps[1], { autoAlpha: 1, y: 0, duration: 0.2 }, T(tPrice - 0.06) + 0.15)
        .to(caps[1], { autoAlpha: 0, y: -8, duration: 0.15 }, T(tFlag))
        .to(caps[2], { autoAlpha: 1, y: 0, duration: 0.2 }, T(tFlag) + 0.15)
        .to({}, { duration: 0.6 });

      return () => {
        ScrollTrigger.removeEventListener("refresh", measure);
        covers.forEach((c) => (c.style.display = "none"));
        dots.forEach((d) => (d.style.display = "none"));
        cursor.style.display = "none";
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
              <p key={c.title} data-cap className="max-w-[60ch] text-pretty text-lg leading-snug">
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
            className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-px bg-text/70"
          />

          {/* Social posts */}
          <div className={`${row} border-t border-line`}>
            <div className={label}>
              <p className="text-sm font-medium">Social posts</p>
              <p className="text-xs text-mute">Finance boards, all day</p>
              <p data-read="chatter" className="mt-1 hidden font-mono text-sm tabular-nums text-text md:block" />
            </div>
            <div className="relative h-24 overflow-hidden md:h-28">
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <Grid />
                <path d={area(chatter)} fill="var(--text)" fillOpacity="0.12" />
                <path d={path(chatter)} fill="none" stroke="var(--text)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
              <Cover />
              <Dot k="chatter" tone="bg-text" />
              <p
                data-a="chatter"
                className="absolute top-1 z-[2] whitespace-nowrap text-xs text-accent"
                style={{ right: `calc(${(1 - tChatterPeak) * 100}% + 40px)` }}
              >
                Same pitch, new accounts
              </p>
            </div>
          </div>

          {/* Live trades */}
          <div className={`${row} border-t border-line`}>
            <div className={label}>
              <p className="text-sm font-medium">Live trades</p>
              <p className="text-xs text-mute">Price for the ticker</p>
              <p data-read="price" className="mt-1 hidden font-mono text-sm tabular-nums md:block" />
            </div>
            <div className="relative h-24 overflow-hidden md:h-28">
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <Grid />
                <path d={path(price)} fill="none" stroke="var(--text)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
              <Cover />
              <Dot k="price" tone="bg-text" />
              <p
                data-a="price"
                className="absolute bottom-1 z-[2] whitespace-nowrap text-xs text-text"
                style={{ right: `calc(${(1 - tPricePeak) * 100}% + 40px)` }}
              >
                Price follows
              </p>
            </div>
          </div>

          {/* News and filings */}
          <div className={`${row} border-t border-line`}>
            <div className={label}>
              <p className="text-sm font-medium">News and filings</p>
              <p className="text-xs text-mute">Headlines and 8-K reports</p>
              <p data-read="news" className="mt-1 hidden font-mono text-sm text-mute md:block" />
            </div>
            <div className="relative h-14 overflow-hidden md:h-16">
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <line x1="0" x2="1000" y1="50" y2="50" stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                {ORDINARY_NEWS.map((t) => (
                  <line key={t} x1={t * 1000} x2={t * 1000} y1="34" y2="66" stroke="var(--mute)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
              <Cover />
              <div
                data-a="news"
                className="absolute inset-y-2 z-[2] flex items-center justify-start border border-dashed border-accent/60 pl-3 text-xs text-accent"
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
              <p className="text-xs text-mute">Chatter and price, minus any catalyst</p>
              <p data-read="score" className="mt-1 hidden font-mono text-sm tabular-nums text-text md:block" />
            </div>
            <div className="relative h-24 overflow-hidden md:h-28">
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <line x1="0" x2="1000" y1={THRESHOLD_Y} y2={THRESHOLD_Y} stroke="var(--line-strong)" strokeDasharray="4 6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <path d={area(score)} fill="var(--text)" fillOpacity="0.08" />
                <path d={path(score)} fill="none" stroke="var(--text)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              </svg>
              <Cover />
              <Dot k="score" tone="bg-text" />
              <p className="absolute left-0 z-[2] text-xs text-mute" style={{ top: `calc(${THRESHOLD_Y}% - 18px)` }}>
                Flag level
              </p>
              <div data-a="flag" className="absolute inset-y-0 z-[2]" style={{ left: `${tFlag * 100}%` }}>
                <span className="absolute inset-y-0 w-px bg-down" />
                <span className="absolute right-2 top-1 whitespace-nowrap bg-down px-1.5 py-0.5 font-mono text-xs font-medium uppercase text-bg">
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

        <p className="text-xs text-mute">Illustrative shape, not market data.</p>
      </div>
    </section>
  );
}
