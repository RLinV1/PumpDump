"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { VantaBg } from "./vanta-bg";
import { MagneticLink } from "./magnetic-link";
import { LiveReadout } from "./live-readout";

export const REPO_URL = "https://github.com/RLinV1/PumpDump";

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, SplitText);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      // Entrance follows reading order: headline lines rise out of a mask, then sentence, readout and actions.
      SplitText.create("[data-split]", {
        type: "lines",
        mask: "lines",
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.lines, { yPercent: 105, duration: 1.1, ease: "power4.out", stagger: 0.14 }),
      });
      gsap.from("[data-intro]", {
        y: 24,
        autoAlpha: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
        delay: 0.6,
      });

      // Leaving the hero, the copy lifts away and the network recedes so the next section owns the screen.
      const leave = { trigger: root.current, start: "top top", end: "bottom top", scrub: true };
      gsap.to("[data-hero-content]", { yPercent: -10, autoAlpha: 0.1, ease: "none", scrollTrigger: leave });
      gsap.to("[data-vanta]", { autoAlpha: 0.1, ease: "none", scrollTrigger: leave });
    }, root);

    return () => ctx.revert();
  }, []);

  const button =
    "inline-flex h-14 items-center border-2 border-ink px-8 font-mono text-sm uppercase tracking-wide transition-[background-color,color,scale] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";

  return (
    <section
      ref={root}
      className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-paper pt-14"
    >
      <VantaBg />
      <div
        data-hero-content
        className="relative mx-auto flex w-full max-w-[1600px] flex-1 flex-col justify-end gap-8 px-4 pb-10 pt-12 md:px-8"
      >
        <h1
          data-split
          className="font-display text-[clamp(3.75rem,12.5vw,12rem)] font-black uppercase leading-[0.88] tracking-tight"
        >
          See the pump before it dumps.
        </h1>
        <div className="grid items-end gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <p data-intro className="max-w-[46ch] text-lg leading-relaxed">
              Pumpwatch reads social chatter, news and company filings next to live trades, and
              flags tickers moving on hype alone.
            </p>
            <div data-intro className="mt-6 flex flex-wrap items-center gap-3">
              <MagneticLink
                href={REPO_URL}
                className={`${button} bg-ink text-paper hover:bg-accent hover:text-ink`}
              >
                View on GitHub
              </MagneticLink>
              <a href="#detector" className={`${button} hover:bg-ink hover:text-paper`}>
                Try the detector
              </a>
            </div>
          </div>
          <LiveReadout />
        </div>
      </div>
    </section>
  );
}
