"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const STEPS = [
  {
    title: "Chatter builds first",
    body: "New accounts start repeating the same pitch across finance boards. Mentions climb well above the ticker's normal level.",
  },
  {
    title: "Price follows with no catalyst",
    body: "Volume and price jump together. No 8-K, no wire story, nothing that explains the move.",
  },
  {
    title: "Pumpwatch raises the flag",
    body: "Chatter, trading and the missing news score as a pump risk before the price falls back.",
  },
];

// The scroll position is the time axis: the pinned chart draws as the reader scrolls,
// so the order of events (chatter, then price, then the flag) is felt, not just read.
export function SignalTimeline() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia(root);

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const caps = gsap.utils.toArray<HTMLElement>("[data-cap]");
      gsap.set("[data-line]", { strokeDashoffset: 1 });
      gsap.set("[data-flag]", { autoAlpha: 0 });
      gsap.set(caps.slice(1), { autoAlpha: 0, y: 14 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "+=2200",
          pin: true,
          scrub: 1,
        },
      });

      tl.to("[data-chatter]", { strokeDashoffset: 0, ease: "none", duration: 4 }, 0)
        .to("[data-price]", { strokeDashoffset: 0, ease: "none", duration: 4 }, 2)
        .to(caps[0], { autoAlpha: 0, y: -14, duration: 0.4 }, 1.8)
        .to(caps[1], { autoAlpha: 1, y: 0, duration: 0.4 }, 2)
        .to(caps[1], { autoAlpha: 0, y: -14, duration: 0.4 }, 4.8)
        .to(caps[2], { autoAlpha: 1, y: 0, duration: 0.4 }, 5)
        .to("[data-flag]", { autoAlpha: 1, duration: 0.4 }, 5)
        .to({}, { duration: 1 });
    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set("[data-cap-list]", { height: "auto" });
      gsap.set("[data-cap]", { position: "relative", autoAlpha: 1 });
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      ref={root}
      className="flex min-h-[100dvh] w-full flex-col justify-center gap-10 px-4 py-20 md:grid md:grid-cols-[5fr_7fr] md:items-center md:gap-14 md:px-8"
    >
      <div>
        <h2 className="font-display text-6xl font-black uppercase leading-[0.9] tracking-tight md:text-8xl">
          A pump has a shape.
        </h2>
        <div data-cap-list className="relative mt-8 h-48 md:h-44">
          {STEPS.map((step) => (
            <div key={step.title} data-cap className="absolute inset-x-0 top-0">
              <h3 className="font-display text-3xl font-black uppercase leading-none">{step.title}</h3>
              <p className="mt-3 max-w-[44ch] leading-relaxed text-mute">{step.body}</p>
            </div>
          ))}
        </div>
      </div>

      <figure>
        <div className="border-2 border-ink p-4">
          <svg
            viewBox="0 0 800 400"
            role="img"
            aria-label="Illustrative chart: social chatter rises first, then price rises with no news, then both fall."
            className="w-full overflow-visible"
          >
            {[100, 200, 300].map((y) => (
              <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="var(--ink)" strokeOpacity="0.15" strokeDasharray="3 7" />
            ))}
            <line x1="0" y1="380" x2="800" y2="380" stroke="var(--ink)" strokeWidth="3" />
            <path
              data-line
              data-price
              d="M0 310 C140 308 250 300 330 290 S470 130 560 105 S650 250 800 345"
              pathLength={1}
              fill="none"
              stroke="var(--ink)"
              strokeWidth="5"
              strokeDasharray="1"
            />
            <path
              data-line
              data-chatter
              d="M0 345 C120 340 210 330 270 285 S400 85 480 60 S610 170 800 255"
              pathLength={1}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="5"
              strokeDasharray="1"
            />
            <g data-flag>
              <line x1="560" y1="40" x2="560" y2="380" stroke="var(--ink)" strokeWidth="2" strokeDasharray="4 6" />
              <rect x="572" y="34" width="150" height="34" fill="var(--ink)" />
              <text x="584" y="58" fill="var(--paper)" fontSize="20" className="font-display" fontWeight="900">
                FLAG RAISED
              </text>
            </g>
          </svg>
        </div>
        <figcaption className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-sm">
          <span className="text-accent">Chatter</span>
          <span>Price</span>
          <span className="text-mute">Illustrative shape, not market data.</span>
        </figcaption>
      </figure>
    </section>
  );
}
