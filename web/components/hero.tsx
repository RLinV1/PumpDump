"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { VantaBg } from "./vanta-bg";
import { MagneticLink } from "./magnetic-link";
import { Monitor } from "./monitor";
import { REPO_URL, keyBtn } from "@/lib/ui";

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, SplitText);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      // Entrance follows reading order: headline lines first, then the sentence, the monitor and the actions.
      SplitText.create("[data-split]", {
        type: "lines",
        mask: "lines",
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.lines, { yPercent: 105, duration: 0.9, ease: "power4.out", stagger: 0.12 }),
      });
      gsap.from("[data-intro]", {
        y: 20,
        autoAlpha: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.1,
        delay: 0.5,
      });

      // Leaving the hero, the windows lift away and the network recedes so the next section owns the screen.
      const leave = { trigger: root.current, start: "top top", end: "bottom top", scrub: true };
      gsap.to("[data-hero-content]", { yPercent: -8, autoAlpha: 0.1, ease: "none", scrollTrigger: leave });
      gsap.to("[data-vanta]", { autoAlpha: 0.1, ease: "none", scrollTrigger: leave });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="relative isolate overflow-hidden border-b border-line">
      <VantaBg />
      <div
        data-hero-content
        className="relative mx-auto grid min-h-[calc(100dvh-5.25rem)] max-w-[1600px] md:grid-cols-12"
      >
        <div className="flex flex-col md:col-span-7 md:border-r md:border-line">
          <div className="flex items-center justify-between bg-amber px-3 py-1 text-xs font-bold uppercase tracking-wide text-bg">
            <span>Pumpwatch</span>
            <span>Overview</span>
          </div>
          <div className="flex flex-1 flex-col justify-end gap-8 p-6 md:p-10">
            <h1
              data-split
              className="text-[clamp(1.9rem,4.2vw,4.25rem)] font-bold uppercase leading-[1.1] tracking-tight text-amber"
            >
              See the pump before it dumps.
              <span aria-hidden className="blink ml-1">
                _
              </span>
            </h1>
            <p data-intro className="max-w-[48ch] leading-relaxed">
              Pumpwatch reads social chatter, news and company filings next to live trades, and
              flags tickers moving on hype alone.
            </p>
            <div data-intro className="flex flex-wrap items-center gap-3">
              <MagneticLink
                href={REPO_URL}
                className={`${keyBtn} bg-amber text-bg hover:bg-text`}
              >
                View on GitHub
              </MagneticLink>
              <a href="#detector" className={`${keyBtn} text-amber hover:bg-amber hover:text-bg`}>
                Try the detector
              </a>
            </div>
          </div>
        </div>
        <div data-intro className="border-t border-line bg-panel md:col-span-5 md:border-t-0">
          <Monitor />
        </div>
      </div>
    </section>
  );
}
