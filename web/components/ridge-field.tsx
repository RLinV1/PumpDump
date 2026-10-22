"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

// Invented symbols. The field is a stack of chatter lines, one per ticker, with time running left to right.
const SYMBOLS = [
  "ABLX", "BRZO", "CVNT", "DYNQ", "EMRA", "FLXN", "GRVO", "HLXR", "IQTA", "KTNO", "LMRN", "MQVT",
  "NRVX", "OXTR", "PRVD", "QLMT", "RZFA", "SKLN", "TBXO", "UVRI", "VNTQ", "WDLX", "XPRA", "YZEN",
  "ZEFA", "ARQX", "BLTR", "CRVN", "DMXO", "ENTK", "FRYX", "GLQM", "HVRN", "IXTA", "JOKR", "KLVD",
];
const HOT = "NRVX";
const CYCLE = 16;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// One ticker erupts, holds while it is flagged, then settles, and the cycle repeats.
const envelope = (t: number) => {
  const ph = t % CYCLE;
  return smooth(1, 6, ph) * (1 - smooth(12, 15, ph));
};

const noise = (x: number, i: number, t: number) => {
  const a = Math.sin(x * 0.018 + i * 1.3 + t * 0.5);
  const b = Math.sin(x * 0.043 - i * 2.1 + t * 0.8);
  const c = Math.sin(x * 0.009 + i * 0.7 - t * 0.3);
  const v = (a * 0.5 + b * 0.3 + c * 0.4) / 1.2;
  return Math.max(0, v) ** 1.5;
};

export function RidgeField() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const hero = el.parentElement!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue("--bg").trim();
    const amber = css.getPropertyValue("--amber").trim();

    let W = 0;
    let H = 0;
    let rows = 0;
    let top0 = 0;
    let spacing = 0;
    let rowAmp: number[] = [];
    let visible = true;
    let pointer: { x: number; y: number } | null = null;
    const hotRow = () => Math.round(rows * 0.64);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = el.clientWidth;
      H = el.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const small = W < 768;
      rows = small ? 24 : 36;
      top0 = H * (small ? 0.62 : 0.52);
      spacing = (H * 0.96 - top0) / (rows - 1);
      rowAmp = Array.from({ length: rows }, (_, i) => 0.55 + 0.45 * Math.abs(Math.sin(i * 12.9898)));
      draw(reduce ? 8 : performance.now() / 1000);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      const step = W < 768 ? 10 : 7;
      const A = reduce ? 1 : envelope(t);
      const hot = hotRow();
      const xc = 0.7;
      const peak = H * (W < 768 ? 0.18 : 0.27);
      const hoverRow = pointer ? Math.round((pointer.y - top0) / spacing) : -1;
      let hotTop = 0;
      let tipText = "";

      for (let i = 0; i < rows; i++) {
        const base = top0 + i * spacing;
        const edge = new Path2D();
        const amp = rowAmp[i] * spacing * 3.1;
        let first = true;
        let tipN = 0;

        for (let x = -step; x <= W + step; x += step) {
          const u = x / W;
          const win = smooth(0, 0.16, u) * smooth(1, 0.84, u);
          const n = noise(x, i, t);
          let y = base - n * amp * win;
          if (i === hot) {
            const b = Math.exp(-(((u - xc) / 0.035) ** 2)) + 0.5 * Math.exp(-(((u - xc + 0.07) / 0.06) ** 2));
            y -= b * A * peak;
            if (Math.abs(u - xc) < step / W) hotTop = y;
          }
          if (pointer && i === hoverRow && Math.abs(x - pointer.x) < step) tipN = n;
          if (first) {
            edge.moveTo(x, y);
            first = false;
          } else {
            edge.lineTo(x, y);
          }
        }

        const fill = new Path2D(edge);
        fill.lineTo(W + step, H + 10);
        fill.lineTo(-step, H + 10);
        fill.closePath();
        ctx.fillStyle = bg;
        ctx.fill(fill);

        const depth = 0.16 + 0.5 * (i / (rows - 1));
        if (i === hot) {
          ctx.strokeStyle = amber;
          ctx.lineWidth = 1.5 + A * 1.2;
          ctx.shadowColor = amber;
          ctx.shadowBlur = 6 + A * 14;
        } else if (i === hoverRow) {
          ctx.strokeStyle = "rgb(241 237 226)";
          ctx.lineWidth = 1.6;
          ctx.shadowBlur = 0;
        } else {
          ctx.strokeStyle = `rgb(241 237 226 / ${depth})`;
          ctx.lineWidth = 1;
          ctx.shadowBlur = 0;
        }
        ctx.stroke(edge);
        ctx.shadowBlur = 0;

        if (i % 3 === 0 && W >= 768) {
          ctx.fillStyle = "rgb(154 148 134 / 0.55)";
          ctx.font = "10px var(--font-data), monospace";
          ctx.fillText(SYMBOLS[i % SYMBOLS.length], 16, base - 4);
        }
        if (i === hoverRow) tipText = `${SYMBOLS[i % SYMBOLS.length]}  ${(1 + tipN * 4).toFixed(1)}x normal chatter`;
      }

      if (label.current) {
        label.current.style.transform = `translate(${xc * W + 18}px, ${hotTop - 6}px)`;
        label.current.style.opacity = String(smooth(0.45, 0.8, A));
      }
      if (tip.current) {
        if (pointer && hoverRow >= 0 && hoverRow < rows && hoverRow !== hot) {
          tip.current.textContent = tipText;
          tip.current.style.transform = `translate(${pointer.x + 14}px, ${pointer.y - 28}px)`;
          tip.current.style.opacity = "1";
        } else {
          tip.current.style.opacity = "0";
        }
      }
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (reduce) draw(8);
    };
    const onLeave = () => {
      pointer = null;
      if (reduce) draw(8);
    };
    const tick = () => {
      if (visible) draw(performance.now() / 1000);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(el);
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerleave", onLeave);
    if (!reduce) gsap.ticker.add(tick);

    return () => {
      ro.disconnect();
      io.disconnect();
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
      gsap.ticker.remove(tick);
    };
  }, []);

  return (
    <div ref={wrap} aria-hidden className="absolute inset-0">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div
        ref={label}
        className="pointer-events-none absolute left-0 top-0 flex items-center gap-2 whitespace-nowrap font-mono text-xs opacity-0"
      >
        <span className="bg-amber px-1.5 py-0.5 font-medium uppercase text-bg">Flag</span>
        <span className="text-amber">{HOT}</span>
        <span className="text-mute">chatter far above normal</span>
      </div>
      <div
        ref={tip}
        className="pointer-events-none absolute left-0 top-0 whitespace-nowrap border border-line-strong bg-surface px-2 py-1 font-mono text-xs opacity-0"
      />
    </div>
  );
}
