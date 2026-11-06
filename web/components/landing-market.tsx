"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LandingData } from "@/lib/api";

type View = { data: LandingData; Component: typeof import("./live-market").default };

export function LandingMarket({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      let next: View | null = null;
      try {
        const { loadLandingData } = await import("@/lib/api");
        if (controller.signal.aborted) return;
        const data = await loadLandingData(2500, controller.signal);
        if (data) {
          const { default: Component } = await import("./live-market");
          next = { data, Component };
        }
      } catch {
        // A failed optional chunk keeps the already-rendered simulation.
      }
      if (controller.signal.aborted) return;
      setView(next);
      timer = setTimeout(refresh, 30000);
    };
    // Start in a task after the first painted frame; the server-rendered simulation is already usable.
    const frame = requestAnimationFrame(() => { timer = setTimeout(refresh, 0); });
    return () => {
      controller.abort();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);

  return view ? <view.Component data={view.data} /> : children;
}
