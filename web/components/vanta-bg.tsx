"use client";

import { useEffect, useRef } from "react";

// Vanta needs three.js and WebGL, which is the heaviest code on the page. So it loads only when the closing
// section is within reach, stops when it leaves the screen, and never runs under reduced motion.
// A slowly moving wave surface reads as a volatility surface: the market at rest.
export function VantaBg() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current!;

    let effect: { destroy: () => void } | undefined;
    let starting = false;

    const start = async () => {
      if (effect || starting) return;
      starting = true;
      // Some Vanta effects read window.THREE when their module loads, so THREE has to be there before the import.
      const THREE = await import("three");
      (window as unknown as { THREE: unknown }).THREE = THREE;
      const vanta = await import("vanta/dist/vanta.waves.min");
      starting = false;
      if (!el.isConnected || effect || !visible) return;
      effect = vanta.default({
        el,
        THREE,
        mouseControls: true,
        touchControls: false,
        gyroControls: false,
        scale: 1,
        scaleMobile: 1,
        color: 0x2a1a04,
        shininess: 22,
        waveHeight: 14,
        waveSpeed: 0.55,
        zoom: 0.85,
      });
    };
    const stop = () => {
      effect?.destroy();
      effect = undefined;
    };

    let visible = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) void start();
        else stop();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      stop();
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_30%)]"
    />
  );
}
