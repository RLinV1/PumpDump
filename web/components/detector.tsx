"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { SplitHeading } from "./reveal";

const CONTROLS = [
  { key: "accounts", label: "Posts from new accounts", hint: "Accounts made in the last 30 days" },
  { key: "dupes", label: "Copy-paste posts", hint: "Near-identical text across boards" },
  { key: "volume", label: "Volume spike", hint: "Trading volume against normal" },
] as const;

type Key = (typeof CONTROLS)[number]["key"];

const SEGMENTS = 20;

// Toy weights for illustration only. The real scorer is a trained model and is not built yet.
function scoreOf(v: Record<Key, number>, explained: boolean) {
  const raw = 0.35 * v.accounts + 0.25 * v.dupes + 0.4 * v.volume;
  return Math.round(explained ? raw * 0.25 : raw);
}

function verdictOf(score: number) {
  if (score >= 65) return { label: "Pump likely", style: "bg-accent text-ink border-ink" };
  if (score >= 35) return { label: "Watch", style: "bg-paper text-ink border-paper" };
  return { label: "Looks organic", style: "bg-ink text-paper border-paper" };
}

export function Detector() {
  const [values, setValues] = useState<Record<Key, number>>({ accounts: 70, dupes: 60, volume: 80 });
  const [explained, setExplained] = useState(false);

  const score = scoreOf(values, explained);
  const verdict = verdictOf(score);

  const numberEl = useRef<HTMLSpanElement>(null);
  const segs = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLDivElement>(null);
  const shown = useRef({ v: 0 });
  const lastLabel = useRef("");

  // The number counts to the new score and the segments follow it; the stamp slams in when the verdict changes.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paint = () => {
      if (numberEl.current) numberEl.current.textContent = String(Math.round(shown.current.v));
      segs.current?.querySelectorAll<HTMLElement>(".seg").forEach((s, i) => {
        s.dataset.on = i < shown.current.v / (100 / SEGMENTS) ? "1" : "0";
      });
    };

    if (reduce) {
      shown.current.v = score;
      paint();
      return;
    }

    const target = shown.current;
    gsap.to(target, { v: score, duration: 0.6, ease: "power3.out", onUpdate: paint });
    if (lastLabel.current !== verdict.label && stamp.current) {
      gsap.fromTo(
        stamp.current,
        { scale: 2.2, rotation: -14, autoAlpha: 0 },
        { scale: 1, rotation: -4, autoAlpha: 1, duration: 0.35, ease: "back.out(2.2)" },
      );
    }
    lastLabel.current = verdict.label;
    return () => {
      gsap.killTweensOf(target);
    };
  }, [score, verdict.label]);

  return (
    <section id="detector" className="bg-ink px-4 py-24 text-paper md:px-8 md:py-32">
      <div className="mx-auto grid max-w-[1600px] gap-14 md:grid-cols-2 md:gap-20">
        <div>
          <SplitHeading className="font-display text-6xl font-black uppercase leading-[0.9] tracking-tight md:text-8xl">
            Try the detector.
          </SplitHeading>
          <p className="mt-6 max-w-[46ch] leading-relaxed text-mute-ink">
            Move the sliders and watch the score react. These weights are a toy for illustration.
            The real scorer is a trained model and is not built yet.
          </p>

          <div className="mt-10 grid gap-8">
            {CONTROLS.map((c) => (
              <label key={c.key} className="block">
                <span className="flex items-baseline justify-between">
                  <span className="font-display text-2xl font-black uppercase tracking-wide">{c.label}</span>
                  <span className="font-mono text-sm tabular-nums">{values[c.key]}</span>
                </span>
                <span className="block font-mono text-xs text-mute-ink">{c.hint}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={values[c.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [c.key]: Number(e.target.value) }))}
                  className="range mt-2"
                />
              </label>
            ))}

            <label className="flex cursor-pointer items-center gap-4 border-2 border-paper p-4 has-[:checked]:bg-paper has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-accent">
              <input
                type="checkbox"
                checked={explained}
                onChange={(e) => setExplained(e.target.checked)}
                className="size-5 shrink-0 accent-accent"
              />
              <span className="font-display text-2xl font-black uppercase tracking-wide">
                A filing or news story explains the move
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-10 border-2 border-paper p-6 md:p-10">
          <div>
            <p className="font-mono text-sm uppercase tracking-wide text-mute-ink">Risk score</p>
            <p className="mt-6 font-display text-[clamp(8rem,22vw,20rem)] font-black leading-[0.8] tracking-tight">
              <span ref={numberEl}>{score}</span>
            </p>
          </div>

          <div ref={segs} className="grid grid-cols-20 gap-1" aria-hidden>
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <span key={i} className="seg h-8 bg-mute" data-on="0" />
            ))}
          </div>

          <div className="relative h-24" aria-live="polite">
            <div
              ref={stamp}
              className={`absolute left-0 top-0 inline-block border-4 px-5 py-2 font-display text-5xl font-black uppercase leading-none ${verdict.style}`}
            >
              {verdict.label}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
