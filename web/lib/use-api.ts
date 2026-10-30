"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { get, type DataMode } from "./api";

type State<T> = { data?: T; notice?: string; mode?: DataMode; failed: boolean; done: boolean };

// Fetches after first paint, polls, and keeps the last good data when a poll fails.
export function useApi<T>(path: string, ms: number, nonce = 0, windowH?: number, refreshKey = 0) {
  const [s, setS] = useState<State<T>>({ failed: false, done: false });
  const refresh = useRef<() => void>(() => {});
  const requestedRefresh = useRef(refreshKey);
  const retry = useCallback(() => refresh.current(), []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let pending = false;
    let queued = false;
    const run = async () => {
      if (controller.signal.aborted) return;
      if (pending) { queued = true; return; }
      pending = true;
      clearTimeout(timer);
      let p = path;
      if (windowH) {
        const to = new Date();
        p += `?from=${new Date(+to - windowH * 3600e3).toISOString()}&to=${to.toISOString()}`;
      }
      let delay = ms;
      try {
        const r = await get<T>(p, 6000, controller.signal);
        if (!controller.signal.aborted) setS({ data: r.data, notice: r.notice, mode: r.mode, failed: false, done: true });
      } catch {
        delay = Math.min(ms, 5000);
        if (!controller.signal.aborted) setS((o) => ({ ...o, failed: true, done: true }));
      }
      pending = false;
      if (!controller.signal.aborted) {
        timer = setTimeout(run, queued ? 0 : delay);
        queued = false;
      }
    };
    refresh.current = () => { void run(); };
    run();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, ms, nonce, windowH]);
  useEffect(() => {
    if (requestedRefresh.current === refreshKey) return;
    requestedRefresh.current = refreshKey;
    retry();
  }, [refreshKey, retry]);
  return { ...s, retry };
}

