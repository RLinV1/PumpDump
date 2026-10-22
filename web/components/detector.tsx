"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { CATALYST_FACTOR, WEIGHTS, scoreOf, verdictOf, type Inputs } from "@/lib/verdict";
import { heading } from "@/lib/ui";
import { SplitHeading } from "./reveal";

const CONTROLS = [
  { key: "accounts", label: "Posts from new accounts", hint: "Share of posts from accounts under 30 days old" },
  { key: "dupes", label: "Copy-paste posts", hint: "Share of posts with near-identical text" },
  { key: "volume", label: "Volume spike", hint: "Trading volume compared with a normal day" },
] as const;

const TERMS = [
  { term: "Chatter", def: "How much people are talking about a ticker, compared with a normal day." },
  { term: "Catalyst", def: "A filing or news story that gives a price move a real reason." },
  { term: "Flag", def: "Chatter and price are both far above normal, and no catalyst explains them." },
];

const SEGMENTS = 24;

export function Detector() {
  const [values, setValues] = useState<Inputs>({ accounts: 70, dupes: 60, volume: 80 });
  const [explained, setExplained] = useState(false);

  const score = scoreOf(values, explained);
  const verdict = verdictOf(score);

  const numberEl = useRef<HTMLSpanElement>(null);
  const segs = useRef<HTMLDivElement>(null);
  const verdictEl = useRef<HTMLSpanElement>(null);
  const shown = useRef({ v: 0 });
  const lastLabel = useRef("");

  // The number counts to the new score and the bar follows it, so a slider drag reads as one continuous change.
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
        { autoAlpha: 0, y: 4 },
        { autoAlpha: 1, y: 0, duration: 0.18, ease: "power3.out" },
      );
    }
    lastLabel.current = verdict.label;
    return () => {
      gsap.killTweensOf(target);
    };
  }, [score, verdict.label]);

  const factor = explained ? CATALYST_FACTOR : 1;

  return (
    <section id="detector" className="border-t border-line px-4 py-24 md:px-8 md:py-32">
      <div className="mx-auto grid max-w-[1400px] gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <SplitHeading className={heading}>Try the detector.</SplitHeading>
          <p className="mt-4 max-w-[44ch] leading-relaxed text-mute">
            Move the sliders and watch the score react. These weights are a toy for illustration.
            The real scorer is a trained model and is not built yet.
          </p>
          <dl className="mt-10 grid gap-5">
            {TERMS.map((t) => (
              <div key={t.term} className="border-l border-amber pl-4">
                <dt className="font-medium">{t.term}</dt>
                <dd className="text-sm leading-relaxed text-mute">{t.def}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="border border-line bg-surface p-5 md:p-8">
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            <div className="grid content-start gap-5">
              {CONTROLS.map((c) => (
                <label key={c.key} className="block">
                  <span className="flex items-baseline justify-between gap-4">
                    <span className="text-sm font-medium">{c.label}</span>
                    <span className="font-mono text-sm tabular-nums text-amber">{values[c.key]}</span>
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

              <label className="flex cursor-pointer items-start gap-3 border border-line-strong p-3 transition-colors duration-150 has-[:checked]:border-amber has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-amber">
                <input
                  type="checkbox"
                  checked={explained}
                  onChange={(e) => setExplained(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-amber"
                />
                <span>
                  <span className="block text-sm font-medium">A filing or news story explains the move</span>
                  <span className="block text-xs text-mute">It lowers the score and never clears it.</span>
                </span>
              </label>
            </div>

            <div className="flex flex-col justify-between gap-6 border-t border-line pt-6 md:border-l md:border-t-0 md:pl-10 md:pt-0">
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-mute">Risk score</p>
                <p className="mt-1 text-[clamp(6rem,11vw,9.5rem)] font-semibold leading-[0.85] tracking-[-0.06em] tabular-nums">
                  <span ref={numberEl}>{score}</span>
                </p>
                <span
                  ref={verdictEl}
                  className={`mt-4 inline-block px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-wide ${verdict.style}`}
                >
                  {verdict.label}
                </span>
              </div>

              <div>
                <div ref={segs} className="grid grid-cols-24 gap-[3px]" aria-hidden>
                  {Array.from({ length: SEGMENTS }, (_, i) => (
                    <span key={i} className="seg h-2 bg-line-strong" data-on="0" />
                  ))}
                </div>
                <dl className="mt-5 grid gap-3 font-mono text-xs">
                  {CONTROLS.map((c) => {
                    const part = WEIGHTS[c.key] * values[c.key] * factor;
                    const max = WEIGHTS[c.key] * 100;
                    return (
                      <div key={c.key}>
                        <div className="flex justify-between text-mute">
                          <dt>{c.label}</dt>
                          <dd className="tabular-nums text-text">{Math.round(part)}</dd>
                        </div>
                        <div className="mt-1 h-px bg-line-strong">
                          <div
                            className="h-px bg-amber transition-[width] duration-200 ease-out"
                            style={{ width: `${(part / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex justify-between border-t border-line pt-2 text-mute">
                    <dt>Catalyst</dt>
                    <dd className="tabular-nums text-text">{explained ? `x${CATALYST_FACTOR}` : "none found"}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
          <p aria-live="polite" className="sr-only">
            Risk score {score}, {verdict.label}
          </p>
        </div>
      </div>
    </section>
  );
}
