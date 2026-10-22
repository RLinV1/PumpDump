"use client";

import { useEffect, useRef } from "react";

const hexToInt = (value: string) => parseInt(value.trim().replace("#", ""), 16);

// Vanta needs WebGL and runs a render loop, so it is hero-only and skipped under reduced motion.
// Dim amber lines on the black screen read as a market network behind the terminal windows.
export function VantaBg() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let effect: { destroy: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const [THREE, vanta] = await Promise.all([
        import("three"),
        import("vanta/dist/vanta.net.min"),
      ]);
      if (cancelled || !ref.current) return;

      const css = getComputedStyle(document.documentElement);
      effect = vanta.default({
        el: ref.current,
        THREE,
        mouseControls: true,
        touchControls: false,
        gyroControls: false,
        scale: 1,
        scaleMobile: 1,
        points: 10,
        maxDistance: 22,
        spacing: 18,
        color: hexToInt(css.getPropertyValue("--amber")),
        backgroundColor: hexToInt(css.getPropertyValue("--bg")),
      });
    })();

    return () => {
      cancelled = true;
      effect?.destroy();
    };
  }, []);

  return <div ref={ref} data-vanta aria-hidden className="absolute inset-0 opacity-40" />;
}
