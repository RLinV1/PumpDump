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
          yPercent: 105,
          duration: 0.9,
          ease: "power4.out",
          stagger: 0.08,
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

// Children marked data-rise fade up in a short stagger the first time the block enters the viewport.
export function Rise({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.from("[data-rise]", {
        y: 16,
        autoAlpha: 0,
        duration: 0.6,
        ease: "power3.out",
        stagger: 0.06,
        scrollTrigger: { trigger: ref.current, start: "top 85%", once: true },
      });
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
