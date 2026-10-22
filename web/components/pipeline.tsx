"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { Panel } from "./panel";
import { SplitHeading } from "./reveal";

export const heading =
  "max-w-5xl text-[clamp(1.75rem,4vw,3.5rem)] font-bold uppercase leading-[1.1] tracking-tight text-amber";

const FEEDS = [
  { name: "Social posts", note: "Account age and repeated text" },
  { name: "Live trades", note: "Price and volume per ticker" },
  { name: "News", note: "Headlines and press releases" },
  { name: "Company filings", note: "Official 8-K reports" },
];

const ROW_Y = [75, 185, 295, 405];
const MID_Y = 240;

// The product in motion: feeds pulse in, meet at the ticker join, the score climbs and a flag is stamped.
// Everything below the stamp is the resting state, so reduced motion shows the finished picture.
export function Pipeline() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const running: gsap.core.Animation[] = [];

      gsap.set("[data-line]", { strokeDashoffset: 1 });
      gsap.set("[data-stamp]", { autoAlpha: 0 });
      gsap.set("[data-pulse]", { autoAlpha: 0 });

      // Lines draw in once, then the pulses start travelling along them.
      gsap.to("[data-line]", {
        strokeDashoffset: 0,
        duration: 1,
        ease: "power2.out",
        stagger: 0.12,
        scrollTrigger: { trigger: root.current, start: "top 70%", once: true },
      });

      gsap.utils.toArray<SVGPathElement>("[data-feed]").forEach((path, i) => {
        const dot = root.current!.querySelector<SVGElement>(`[data-pulse="${i}"]`)!;
        running.push(
          gsap.to(dot, {
            motionPath: { path, align: path, alignOrigin: [0.5, 0.5] },
            duration: 1.8,
            ease: "none",
            repeat: -1,
            delay: i * 0.45,
            onStart: () => gsap.set(dot, { autoAlpha: 1 }),
          }),
        );
      });

      const chainDot = root.current!.querySelector<SVGElement>("[data-pulse='chain']")!;
      const chainPath = root.current!.querySelector<SVGPathElement>("[data-chain]")!;
      running.push(
        gsap.to(chainDot, {
          motionPath: { path: chainPath, align: chainPath, alignOrigin: [0.5, 0.5] },
          duration: 1.4,
          ease: "none",
          repeat: -1,
          repeatDelay: 2.6,
          delay: 1.6,
          onStart: () => gsap.set(chainDot, { autoAlpha: 1 }),
        }),
      );

      // The score counts up, then the flag slams in. This is the loop that explains the product.
      const score = { v: 0 };
      const scoreEl = root.current!.querySelector<SVGTextElement>("[data-score]")!;
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 0.4 });
      loop
        .set(score, { v: 0 })
        .to(score, {
          v: 94,
          duration: 1.8,
          ease: "power2.out",
          onUpdate: () => {
            scoreEl.textContent = String(Math.round(score.v));
          },
        })
        .fromTo(
          "[data-stamp]",
          { scale: 2.2, autoAlpha: 0, svgOrigin: "1095 332" },
          { scale: 1, autoAlpha: 1, duration: 0.3, ease: "back.out(2.2)", svgOrigin: "1095 332" },
          1.9,
        )
        .to("[data-stamp]", { autoAlpha: 0, duration: 0.3 }, 5.2);
      running.push(loop);

      // Only spend frames while the section is on screen.
      ScrollTrigger.create({
        trigger: root.current,
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => running.forEach((a) => (self.isActive ? a.play() : a.pause())),
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section id="how" ref={root} className="overflow-x-clip border-b border-line px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1600px]">
        <SplitHeading className={heading}>Four feeds in. One flag out.</SplitHeading>

        <Panel title="Data flow" tag="Simulated" className="mt-10">
          {/* Desktop: the animated diagram. */}
          <svg
            viewBox="0 0 1200 460"
            role="img"
            aria-label="Four feeds, social posts, live trades, news and company filings, are joined by ticker, scored, and flagged."
            className="hidden w-full overflow-visible p-6 md:block"
          >
            {FEEDS.map((feed, i) => (
              <g key={feed.name}>
                <path
                  data-line
                  data-feed
                  d={`M300 ${ROW_Y[i]} C 420 ${ROW_Y[i]}, 430 ${MID_Y}, 520 ${MID_Y}`}
                  pathLength={1}
                  strokeDasharray="1"
                  fill="none"
                  stroke="var(--amber-dim)"
                  strokeWidth="2"
                />
                <rect x="0" y={ROW_Y[i] - 42} width="300" height="84" fill="var(--bg)" stroke="var(--amber-dim)" strokeWidth="1.5" />
                <text x="18" y={ROW_Y[i] - 6} className="font-mono" fontSize="24" fontWeight="700" fill="var(--amber)" style={{ textTransform: "uppercase" }}>
                  {feed.name}
                </text>
                <text x="18" y={ROW_Y[i] + 22} className="font-mono" fontSize="13" fill="var(--mute)">
                  {feed.note}
                </text>
                <circle data-pulse={i} r="7" fill="var(--amber)" cx="0" cy="0" />
              </g>
            ))}

            <path d={`M690 ${MID_Y} H760`} stroke="var(--amber-dim)" strokeWidth="2" fill="none" data-line pathLength={1} strokeDasharray="1" />
            <path d={`M950 ${MID_Y} H990`} stroke="var(--amber-dim)" strokeWidth="2" fill="none" data-line pathLength={1} strokeDasharray="1" />
            <path data-chain d={`M520 ${MID_Y} H1010`} fill="none" stroke="none" />

            <rect x="520" y="185" width="170" height="110" fill="var(--amber)" />
            <text x="540" y="228" className="font-mono" fontSize="26" fontWeight="700" fill="var(--bg)">JOIN BY</text>
            <text x="540" y="262" className="font-mono" fontSize="26" fontWeight="700" fill="var(--bg)">TICKER</text>

            <rect x="760" y="185" width="190" height="110" fill="var(--bg)" stroke="var(--amber)" strokeWidth="1.5" />
            <text x="778" y="215" className="font-mono" fontSize="13" fill="var(--mute)">RISK SCORE</text>
            <text data-score x="778" y="276" className="font-mono" fontSize="64" fontWeight="700" fill="var(--amber)">94</text>

            <rect x="990" y="150" width="210" height="180" fill="var(--bg)" stroke="var(--amber-dim)" strokeWidth="1.5" />
            <text x="1008" y="184" className="font-mono" fontSize="13" fill="var(--mute)">ALERT</text>
            <text x="1008" y="226" className="font-mono" fontSize="34" fontWeight="700" fill="var(--text)">XXXX</text>
            <text x="1008" y="256" className="font-mono" fontSize="13" fill="var(--down)">Chatter up, no filing</text>
            <text x="1008" y="280" className="font-mono" fontSize="13" fill="var(--mute)">Simulated example</text>

            <g data-stamp>
              <rect x="1000" y="304" width="190" height="56" fill="var(--down)" />
              <text x="1095" y="342" textAnchor="middle" className="font-mono" fontSize="30" fontWeight="700" fill="var(--bg)">FLAGGED</text>
            </g>

            <circle data-pulse="chain" r="8" fill="var(--text)" cx="0" cy="0" />
          </svg>

          {/* Mobile: the same story as a stack, since the diagram text would be too small. */}
          <ol className="grid gap-px bg-line md:hidden">
            {[
              ...FEEDS.map((f) => ({ name: f.name, note: f.note })),
              { name: "Join by ticker", note: "Feeds meet on one clock" },
              { name: "Risk score", note: "Chatter, trading and news together" },
              { name: "Flagged", note: "A pump signal with its evidence" },
            ].map((step) => (
              <li key={step.name} className="bg-bg p-4">
                <p className="font-bold uppercase text-amber">{step.name}</p>
                <p className="mt-1 text-sm text-mute">{step.note}</p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </section>
  );
}
