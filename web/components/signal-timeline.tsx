"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Panel } from "./panel";
import { heading } from "./pipeline";

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
      className="flex min-h-[100dvh] w-full flex-col justify-center gap-10 border-b border-line px-4 py-20 md:grid md:grid-cols-[5fr_7fr] md:items-center md:gap-12 md:px-8"
    >
      <div>
        <h2 className={heading}>A pump has a shape.</h2>
        <div data-cap-list className="relative mt-8 h-52 md:h-48">
          {STEPS.map((step) => (
            <div key={step.title} data-cap className="absolute inset-x-0 top-0">
              <h3 className="font-bold uppercase tracking-wide text-text">{step.title}</h3>
              <p className="mt-3 max-w-[44ch] text-sm leading-relaxed text-mute">{step.body}</p>
            </div>
          ))}
        </div>
      </div>

      <Panel title="Chatter vs price" tag="Illustrative">
        <figure className="p-4">
          <svg
            viewBox="0 0 800 400"
            role="img"
            aria-label="Illustrative chart: social chatter rises first, then price rises with no news, then both fall."
            className="w-full overflow-visible"
          >
            {[100, 200, 300].map((y) => (
              <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="var(--line)" strokeDasharray="3 7" />
            ))}
            <line x1="0" y1="380" x2="800" y2="380" stroke="var(--amber-dim)" strokeWidth="1.5" />
            <path
              data-line
              data-price
              d="M0 310 C140 308 250 300 330 290 S470 130 560 105 S650 250 800 345"
              pathLength={1}
              fill="none"
              stroke="var(--up)"
              strokeWidth="3"
              strokeDasharray="1"
            />
            <path
              data-line
              data-chatter
              d="M0 345 C120 340 210 330 270 285 S400 85 480 60 S610 170 800 255"
              pathLength={1}
              fill="none"
              stroke="var(--amber)"
              strokeWidth="3"
              strokeDasharray="1"
            />
            <g data-flag>
              <line x1="560" y1="40" x2="560" y2="380" stroke="var(--down)" strokeWidth="1.5" strokeDasharray="4 6" />
              <rect x="572" y="34" width="170" height="30" fill="var(--down)" />
              <text x="584" y="55" fill="var(--bg)" fontSize="17" className="font-mono" fontWeight="700">
                FLAG RAISED
              </text>
            </g>
          </svg>
          <figcaption className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
            <span className="text-amber">CHATTER</span>
            <span className="text-up">PRICE</span>
            <span className="text-mute">Illustrative shape, not market data.</span>
          </figcaption>
        </figure>
      </Panel>
    </section>
  );
}
