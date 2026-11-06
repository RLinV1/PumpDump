"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// A quiet hairline grid behind the hero that drifts slowly as the page scrolls, like a chart scale moving under the
// price. Reuse the page's scroll engine and hold still for reduced motion.
export function HeroBackground() {
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.to(grid.current, {
        y: -70,
        ease: "none",
        scrollTrigger: { start: 0, end: 700, scrub: true },
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,black_55%,transparent)]"
    >
      <div
        ref={grid}
        className="absolute inset-x-0 -top-20 h-[130%]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--line) 1px, transparent 1px), linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          opacity: 0.45,
        }}
      />
    </div>
  );
}
