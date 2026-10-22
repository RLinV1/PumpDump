"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Panel } from "./panel";
import { heading } from "./pipeline";
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
  if (score >= 65) return { label: "Pump likely", style: "bg-down text-bg" };
  if (score >= 35) return { label: "Watch", style: "bg-amber text-bg" };
  return { label: "Looks organic", style: "bg-up text-bg" };
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
        { scale: 1.8, autoAlpha: 0 },
        { scale: 1, autoAlpha: 1, duration: 0.3, ease: "back.out(2.2)" },
      );
    }
    lastLabel.current = verdict.label;
    return () => {
      gsap.killTweensOf(target);
    };
  }, [score, verdict.label]);

  return (
    <section id="detector" className="border-b border-line px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1600px]">
        <SplitHeading className={heading}>Try the detector.</SplitHeading>
        <p className="mt-4 max-w-[56ch] text-sm leading-relaxed text-mute">
          Move the sliders and watch the score react. These weights are a toy for illustration. The
          real scorer is a trained model and is not built yet.
        </p>

        <div className="mt-10 grid gap-px bg-line md:grid-cols-2">
          <Panel title="Inputs" tag="Adjust" className="border-0">
            <div className="grid gap-7 p-5 md:p-6">
              {CONTROLS.map((c) => (
                <label key={c.key} className="block">
                  <span className="flex items-baseline justify-between">
                    <span className="text-sm font-bold uppercase tracking-wide text-amber">{c.label}</span>
                    <span className="tabular-nums">{values[c.key]}</span>
                  </span>
                  <span className="block text-xs text-mute">{c.hint}</span>
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

              <label className="flex cursor-pointer items-center gap-4 border border-amber-dim p-4 has-[:checked]:border-up has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-amber">
                <input
                  type="checkbox"
                  checked={explained}
                  onChange={(e) => setExplained(e.target.checked)}
                  className="size-5 shrink-0 accent-amber"
                />
                <span className="text-sm font-bold uppercase tracking-wide">
                  A filing or news story explains the move
                </span>
              </label>
            </div>
          </Panel>

          <Panel title="Risk score" tag="Toy model" className="border-0">
            <div className="flex h-full flex-col justify-between gap-8 p-5 md:p-6">
              <p className="text-[clamp(6rem,15vw,13rem)] font-bold leading-[0.85] tracking-tight text-amber tabular-nums">
                <span ref={numberEl}>{score}</span>
              </p>

              <div ref={segs} className="grid grid-cols-20 gap-1" aria-hidden>
                {Array.from({ length: SEGMENTS }, (_, i) => (
                  <span key={i} className="seg h-6 bg-line" data-on="0" />
                ))}
              </div>

              <div className="relative h-14" aria-live="polite">
                <div
                  ref={stamp}
                  className={`absolute left-0 top-0 inline-block px-4 py-2 text-2xl font-bold uppercase leading-none tracking-wide ${verdict.style}`}
                >
                  {verdict.label}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}
