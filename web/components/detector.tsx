"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { CATALYST_FACTOR, WEIGHTS, scoreOf, verdictOf, type Inputs } from "@/lib/verdict";
import { heading } from "@/lib/ui";

const CONTROLS = [
  { key: "accounts", label: "Posts from new accounts", hint: "Share of posts from accounts under 30 days old" },
  { key: "dupes", label: "Copy-paste posts", hint: "Share of posts with near-identical text" },
  { key: "volume", label: "Volume spike", hint: "Trading volume compared with a normal day" },
] as const;

const SEGMENTS = 24;

export function Detector() {
  const [values, setValues] = useState<Inputs>({ accounts: 70, dupes: 60, volume: 80 });
  const [explained, setExplained] = useState(false);

  const score = scoreOf(values, explained);
  const verdict = verdictOf(score);

  const numberEl = useRef<HTMLSpanElement>(null);
  const segs = useRef<HTMLDivElement>(null);
  const verdictEl = useRef<HTMLDivElement>(null);
  const shown = useRef({ v: 0 });
  const lastLabel = useRef("");

  // The bar counts to the new score so a slider drag reads as one continuous change.
  // The verdict only animates when its label actually changes.
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
      lastLabel.current = verdict.label;
      return;
    }

    const target = shown.current;
    gsap.to(target, { v: score, duration: 0.25, ease: "power3.out", onUpdate: paint });
    if (lastLabel.current && lastLabel.current !== verdict.label && verdictEl.current) {
      gsap.fromTo(
        verdictEl.current,
        { autoAlpha: 0, y: 6 },
        { autoAlpha: 1, y: 0, duration: 0.2, ease: "power3.out" },
      );
    }
    lastLabel.current = verdict.label;
    return () => {
      gsap.killTweensOf(target);
    };
  }, [score, verdict.label]);

  const factor = explained ? CATALYST_FACTOR : 1;

  return (
    <section id="detector" className="border-t border-line py-24 md:py-32">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <h2 className={heading}>Try the detector.</h2>
          <p className="mt-4 max-w-[46ch] text-pretty leading-relaxed text-mute">
            Move the sliders and watch the verdict change. Chatter is how much people are talking
            about a ticker compared with a normal day. A catalyst is a filing or news story that gives
            a move a real reason. These sliders use simplified weights for the simulation. The live
            view uses the versioned scorer identified beside each score.
          </p>
        </div>

        <div className="grid gap-x-12 gap-y-8 border border-line bg-surface p-5 md:grid-cols-2 md:p-8">
          {/* On a phone the result stays pinned above the sliders, so dragging one shows its effect. */}
          <div className="max-md:sticky max-md:top-14 max-md:z-10 max-md:order-first max-md:-mx-5 max-md:border-b max-md:border-line max-md:bg-surface max-md:px-5 max-md:pb-4 md:order-last md:border-l md:border-line md:pl-12">
            <div ref={verdictEl}>
              <p className={`text-[clamp(2rem,3.4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.03em] ${verdict.tone}`}>
                {verdict.label}.
              </p>
              <p className="mt-2 min-h-[2.75rem] max-w-[34ch] text-pretty text-sm leading-relaxed text-mute">{verdict.note}</p>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div ref={segs} className="grid flex-1 grid-cols-24 gap-[3px]" aria-hidden>
                {Array.from({ length: SEGMENTS }, (_, i) => (
                  <span key={i} className="seg h-2 bg-line-strong" data-on="0" />
                ))}
              </div>
              <span ref={numberEl} className="w-7 text-right font-mono text-sm tabular-nums">
                {score}
              </span>
            </div>

            <dl className="mt-5 hidden gap-3 text-xs md:grid">
              {CONTROLS.map((c) => {
                const part = WEIGHTS[c.key] * values[c.key] * factor;
                const max = WEIGHTS[c.key] * 100;
                return (
                  <div key={c.key}>
                    <div className="flex justify-between text-mute">
                      <dt>{c.label}</dt>
                      <dd className="font-mono tabular-nums text-text">{Math.round(part)}</dd>
                    </div>
                    <div className="mt-1 h-px bg-line-strong">
                      <div
                        className="h-px bg-accent transition-[width] duration-200 ease-out"
                        style={{ width: `${(part / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between border-t border-line pt-2 text-mute">
                <dt>Catalyst</dt>
                <dd className="font-mono tabular-nums text-text">{explained ? `x${CATALYST_FACTOR}` : "none found"}</dd>
              </div>
            </dl>
          </div>

          <div className="grid content-start gap-5">
            {CONTROLS.map((c) => (
              <label key={c.key} className="block">
                <span className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="font-mono text-sm tabular-nums text-accent">{values[c.key]}</span>
                </span>
                <span className="block text-xs text-mute">{c.hint}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={values[c.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [c.key]: Number(e.target.value) }))}
                  className="range mt-1"
                />
              </label>
            ))}

            <label className="flex cursor-pointer items-start gap-3 border border-line-strong p-3 transition-colors duration-150 has-[:checked]:border-accent">
              <input
                type="checkbox"
                checked={explained}
                onChange={(e) => setExplained(e.target.checked)}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                <span className="block text-sm font-medium">A filing or news story explains the move</span>
                <span className="block text-xs text-mute">It lowers the score and never clears it.</span>
              </span>
            </label>
          </div>
          <p aria-live="polite" className="sr-only">
            Risk score {score}, {verdict.label}
          </p>
        </div>
      </div>
    </section>
  );
}
