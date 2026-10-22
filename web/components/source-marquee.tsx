"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const SOURCES = ["Chatter", "Trades", "News", "Filings", "Volume", "Press releases"];

// The page's single marquee. It drifts on its own and speeds up with scroll velocity,
// so the band reads as many feeds arriving at once and reacts to the reader.
export function SourceMarquee() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const loop = gsap.to("[data-track]", { xPercent: -50, duration: 40, ease: "none", repeat: -1 });
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

  const row = SOURCES.map((name, i) => (
    <span
      key={name}
      className={`shrink-0 px-6 md:px-10 ${
        i % 2 ? "text-transparent [-webkit-text-stroke:2px_var(--paper)]" : ""
      }`}
    >
      {name}
    </span>
  ));

  return (
    <div
      ref={root}
      aria-label={`What Pumpwatch reads: ${SOURCES.join(", ")}`}
      className="overflow-hidden bg-ink py-6 text-paper md:py-10"
    >
      <div
        data-track
        aria-hidden
        className="flex w-max font-display text-[clamp(4rem,12vw,11rem)] font-black uppercase leading-[0.9]"
      >
        {row}
        {row}
      </div>
    </div>
  );
}
