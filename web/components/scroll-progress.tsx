"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// A one-pixel read of how far down the page the reader is, driven by the same scroll engine as everything else.
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const trigger = ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) => gsap.set(bar.current, { scaleX: self.progress }),
    });
    return () => trigger.kill();
  }, []);

  return (
    <div
      ref={bar}
      aria-hidden
      className="absolute inset-x-0 bottom-[-1px] h-0.5 origin-left scale-x-0 bg-accent"
    />
  );
}
