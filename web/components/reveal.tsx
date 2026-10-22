"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

// Section titles rise out of a line mask when they reach the reader, so each section opens with the same cue.
export function SplitHeading({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, SplitText);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const split = SplitText.create(ref.current!, {
      type: "lines",
      mask: "lines",
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.lines, {
          yPercent: 115,
          duration: 1,
          ease: "power4.out",
          stagger: 0.1,
          scrollTrigger: { trigger: ref.current, start: "top 88%", once: true },
        }),
    });
    return () => split.revert();
  }, []);

  return (
    <h2 ref={ref} className={className}>
      {children}
    </h2>
  );
}

// Fade-and-lift for a block, optionally growing a rule beside it first.
export function Rise({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        delay,
        scrollTrigger: { trigger: ref.current, start: "top 88%", once: true },
      });
      tl.from("[data-bar]", { scaleY: 0, transformOrigin: "top", duration: 0.7, ease: "power3.out" }).from(
        "[data-rise]",
        { y: 24, autoAlpha: 0, duration: 0.8, ease: "power3.out", stagger: 0.08 },
        0.1,
      );
    }, ref);
    return () => ctx.revert();
  }, [delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
