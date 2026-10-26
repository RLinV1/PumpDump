"use client";

import { LazyMotion, domAnimation, m, useReducedMotion, useScroll, useTransform } from "motion/react";

// A quiet hairline grid behind the hero that drifts slowly as the page scrolls, like a chart scale moving under the
// price. Motion drives it with a transform only, and it holds still for reduced motion.
export function HeroBackground() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const gridY = useTransform(scrollY, [0, 700], [0, -70]);
  return (
    <LazyMotion features={domAnimation} strict>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,black_55%,transparent)]"
      >
        <m.div
          className="absolute inset-x-0 -top-20 h-[130%]"
          style={{
            y: reduce ? 0 : gridY,
            backgroundImage:
              "linear-gradient(to right, var(--line) 1px, transparent 1px), linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
            backgroundSize: "96px 96px",
            opacity: 0.45,
          }}
        />
      </div>
    </LazyMotion>
  );
}
