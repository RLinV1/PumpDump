"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Invented symbols and changes, labelled as a simulated feed. Flagged rows show what Pumpwatch would raise.
const ITEMS = [
  { sym: "NRVX", chg: 212.4, flag: true },
  { sym: "QLMT", chg: -1.8 },
  { sym: "BRZO", chg: 0.6 },
  { sym: "HLXR", chg: -3.1 },
  { sym: "PRVD", chg: 87.9, flag: true },
  { sym: "KTNO", chg: 0.2 },
  { sym: "ZEFA", chg: -0.9 },
  { sym: "MRLN", chg: 1.4 },
  { sym: "OXTR", chg: -5.7 },
  { sym: "DYNQ", chg: 34.5, flag: true },
];

// The page's single marquee. It drifts on its own and speeds up with scroll velocity,
// so the tape reads as a live feed and reacts to the reader.
export function Tape() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const loop = gsap.to("[data-track]", { xPercent: -50, duration: 45, ease: "none", repeat: -1 });
      ScrollTrigger.create({
        onUpdate: (self) => {
          const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 250, 6);
          gsap.to(loop, { timeScale: boost, duration: 0.2, overwrite: true });
          gsap.to(loop, { timeScale: 1, duration: 1.2, delay: 0.2 });
        },
      });
    }, root);
    return () => ctx.revert();
  }, []);

  const row = ITEMS.map((item) => (
    <span key={item.sym} className="flex shrink-0 items-center gap-2 px-5 text-sm tabular-nums">
      <b className="text-text">{item.sym}</b>
      <span className={item.chg >= 0 ? "text-up" : "text-down"}>
        {item.chg >= 0 ? "+" : ""}
        {item.chg.toFixed(1)}%
      </span>
      {item.flag ? <span className="bg-amber px-1 text-xs font-bold text-bg">PUMP?</span> : null}
    </span>
  ));

  return (
    <div
      ref={root}
      aria-label="Simulated ticker tape of invented symbols, with pump flags"
      className="relative overflow-hidden border-b border-line bg-panel py-2"
    >
      <span className="absolute inset-y-0 left-0 z-10 flex items-center bg-amber px-3 text-xs font-bold text-bg">
        SIM FEED
      </span>
      <div data-track aria-hidden className="flex w-max pl-24">
        {row}
        {row}
      </div>
    </div>
  );
}
