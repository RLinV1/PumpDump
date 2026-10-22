"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

// A labelled, simulated readout. The numbers drift so the hero feels like a live feed,
// but they are plainly marked as an example and never claim to be market data.
export function LiveReadout() {
  const chatter = useRef<HTMLSpanElement>(null);
  const score = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const state = { chatter: 1240, score: 94 };
    const draw = () => {
      if (chatter.current)
        chatter.current.textContent = `+${Math.round(state.chatter).toLocaleString("en-US")}%`;
      if (score.current) score.current.textContent = String(Math.round(state.score));
    };
    const id = window.setInterval(() => {
      gsap.to(state, {
        chatter: 1100 + Math.random() * 380,
        score: 90 + Math.random() * 8,
        duration: 0.8,
        ease: "power2.inOut",
        onUpdate: draw,
      });
    }, 1600);

    return () => {
      window.clearInterval(id);
      gsap.killTweensOf(state);
    };
  }, []);

  return (
    <div
      data-intro
      className="w-full border-2 border-ink bg-ink p-4 font-mono text-sm text-paper md:w-80"
    >
      <p className="flex items-center justify-between text-xs uppercase tracking-wide text-accent">
        <span>Simulated signal</span>
        <span className="blink" aria-hidden>
          LIVE
        </span>
      </p>
      <dl className="mt-4 grid gap-2">
        <div className="flex justify-between">
          <dt className="text-mute-ink">Ticker</dt>
          <dd>XXXX</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-mute-ink">Chatter</dt>
          <dd ref={chatter}>+1,240%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-mute-ink">News or 8-K</dt>
          <dd>None found</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-mute pt-3">
          <dt className="text-mute-ink">Risk score</dt>
          <dd className="font-display text-5xl font-black leading-none text-accent">
            <span ref={score}>94</span>
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-mute-ink">Illustrative values, not market data.</p>
    </div>
  );
}
