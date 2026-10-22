"use client";

import { LazyMotion, domAnimation, m, useReducedMotion, useScroll, useTransform } from "motion/react";

// Deterministic price paths in a 1000 x 300 box. Same output on server and client.
function walk(seed: number, drift: number, pump: boolean) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let y = 200;
  const pts: string[] = [];
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const spike = pump ? 150 * Math.max(0, Math.min(1, (t - 0.55) / 0.2)) * (1 - Math.max(0, (t - 0.78) / 0.22)) : 0;
    y += (rnd() - 0.5) * 9 + drift;
    pts.push(`${i === 0 ? "M" : "L"}${(t * 1000).toFixed(1)} ${(Math.min(280, Math.max(20, y - spike))).toFixed(1)}`);
  }
  return pts.join(" ");
}

const LINES = [
  { d: walk(11, -0.2, false), color: "var(--mute)", opacity: 0.25, delay: 0, dur: 11 },
  { d: walk(29, 0.1, false), color: "var(--mute)", opacity: 0.2, delay: 3, dur: 13 },
  { d: walk(5, -0.05, true), color: "var(--amber)", opacity: 0.55, delay: 1, dur: 9 },
];

// A quiet price board behind the hero: hairline grid that drifts with scroll, and three price lines that draw
// themselves in turn. Motion drives it with transforms and path length only, and it holds still for reduced motion.
export function HeroBackground() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const gridY = useTransform(scrollY, [0, 700], [0, -70]);
  const linesY = useTransform(scrollY, [0, 700], [0, -140]);

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
        <m.svg
          viewBox="0 0 1000 300"
          preserveAspectRatio="none"
          className="absolute inset-x-0 top-[22%] h-[60%] w-full"
          style={{ y: reduce ? 0 : linesY }}
        >
          {LINES.map((l, i) => (
            <m.path
              key={i}
              d={l.d}
              fill="none"
              stroke={l.color}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ opacity: l.opacity }}
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={reduce ? { pathLength: 1 } : { pathLength: [0, 1, 1], opacity: [0, l.opacity, 0] }}
              transition={
                reduce
                  ? undefined
                  : { duration: l.dur, delay: l.delay, repeat: Infinity, ease: "easeInOut", times: [0, 0.65, 1] }
              }
            />
          ))}
        </m.svg>
      </div>
    </LazyMotion>
  );
}
