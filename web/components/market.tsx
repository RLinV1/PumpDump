"use client";

import { useEffect, useRef } from "react";
import { Stream, swingRegime } from "@/lib/sim";
import { verdictOf } from "@/lib/verdict";

const VISIBLE = 56;
const SEGMENTS = 20;
const TICK_MS = 100;
const STEPS = 4; // ticks per candle
const NORMAL_VOLUME = 1.3; // a quiet candle's volume in the simulation
const price = (n: number) => n.toFixed(2);
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const dirColor = (n: number) => (n >= 0 ? "var(--up)" : "var(--down)");

function Pane({
  title,
  tag,
  className = "",
  children,
}: {
  title: React.ReactNode;
  tag?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col bg-surface ${className}`}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-line px-4 text-xs">
        <h2 className="flex items-baseline gap-2 font-medium">{title}</h2>
        {tag ? <span className="truncate text-xs text-mute">{tag}</span> : null}
      </header>
      {children}
    </section>
  );
}

// One simulated market: a candlestick chart with a volume strip and a chatter indicator, and one panel that says
// why the ticker is flagged. It is drawn imperatively (canvas and direct DOM writes), so a tick never re-renders
// React and the chart repaints only when something changes.
export function Market() {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // The same deterministic first frame on the server and the client.
  const first = new Stream();
  const lastC = first.history[first.history.length - 1];
  const base0 = first.history[Math.max(0, first.history.length - VISIBLE)].c;
  const verdict0 = verdictOf(lastC.score);

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const css = getComputedStyle(document.documentElement);
    const C = {
      bg: css.getPropertyValue("--bg").trim(),
      text: css.getPropertyValue("--text").trim(),
      mute: css.getPropertyValue("--mute").trim(),
      accent: css.getPropertyValue("--accent").trim(),
      up: css.getPropertyValue("--up").trim(),
      down: css.getPropertyValue("--down").trim(),
    };
    const family = css.getPropertyValue("--font-data").trim() || "monospace";
    const q = (k: string) => el.querySelector<HTMLElement>(`[data-k="${k}"]`)!;

    const stream = new Stream();
    let step = 0;
    let wig = 0;
    let W = 0;
    let H = 0;
    let vmin = 0;
    let vmax = 0;
    let hover: { x: number; y: number } | null = null;
    let queued = false;
    const cache: Record<string, string> = {};
    const t = () => step / STEPS;

    const set = (k: string, text: string, color?: string) => {
      const n = q(k);
      if (cache[k] !== text) {
        n.textContent = text;
        cache[k] = text;
      }
      if (color) n.style.color = color;
    };

    const view = () => {
      const hist = stream.history.slice(-(VISIBLE - 1));
      hist.push(stream.partial(t(), wig));
      return hist;
    };

    const draw = () => {
      queued = false;
      const cands = view();
      const n = cands.length;
      let lo = Infinity;
      let hi = -Infinity;
      let volMax = 0;
      for (const c of cands) {
        lo = Math.min(lo, c.l);
        hi = Math.max(hi, c.h);
        volMax = Math.max(volMax, c.v);
      }
      const pad = (hi - lo) * 0.08 || 0.1;
      if (vmax === 0) {
        vmin = lo - pad;
        vmax = hi + pad;
      } else {
        // Grow at once so a candle never leaves the plot; shrink slowly so the scale does not jump.
        vmin = lo - pad < vmin ? lo - pad : vmin + (lo - pad - vmin) * 0.1;
        vmax = hi + pad > vmax ? hi + pad : vmax + (hi + pad - vmax) * 0.1;
      }

      const left = 8;
      const right = W - 58;
      const plotW = right - left;
      const cw = plotW / VISIBLE;
      const top = 16;
      const bodyH = H - 28;
      const priceH = bodyH * 0.6;
      const volTop = top + priceH + 6;
      const volH = bodyH * 0.1;
      const chTop = volTop + volH + 12;
      const chH = H - 20 - chTop;
      const py = (v: number) => top + priceH * (1 - (v - vmin) / (vmax - vmin));
      const cx = (i: number) => left + (i + 0.5) * cw;

      ctx.clearRect(0, 0, W, H);
      ctx.font = `11px ${family}`;
      ctx.textBaseline = "middle";
      ctx.lineWidth = 1;

      // Price grid and right-hand scale.
      for (let g = 0; g <= 3; g++) {
        const v = vmin + ((vmax - vmin) * g) / 3;
        const y = Math.round(py(v)) + 0.5;
        ctx.strokeStyle = "rgb(241 237 226 / 0.07)";
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.fillStyle = C.mute;
        ctx.textAlign = "left";
        ctx.fillText(price(v), right + 6, y);
      }

      // Volume.
      for (let i = 0; i < n; i++) {
        const c = cands[i];
        const h = (c.v / volMax) * volH;
        ctx.fillStyle = c.c >= c.o ? "rgb(61 220 132 / 0.35)" : "rgb(255 93 93 / 0.35)";
        ctx.fillRect(cx(i) - cw * 0.31, volTop + volH - h, Math.max(1, cw * 0.62), h);
      }

      // Candles.
      for (let i = 0; i < n; i++) {
        const c = cands[i];
        ctx.fillStyle = ctx.strokeStyle = c.c >= c.o ? C.up : C.down;
        const x = Math.round(cx(i)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, py(c.h));
        ctx.lineTo(x, py(c.l));
        ctx.stroke();
        const y1 = py(Math.max(c.o, c.c));
        const y2 = py(Math.min(c.o, c.c));
        ctx.fillRect(cx(i) - cw * 0.31, y1, Math.max(1, cw * 0.62), Math.max(1, y2 - y1));
      }

      // Chatter indicator.
      const cy = (v: number) => chTop + chH * (1 - Math.min(v, 15) / 15);
      ctx.strokeStyle = "rgb(241 237 226 / 0.12)";
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(left, cy(1));
      ctx.lineTo(right, cy(1));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, cx(i), cy(cands[i].chatter));
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineTo(cx(n - 1), chTop + chH);
      ctx.lineTo(cx(0), chTop + chH);
      ctx.closePath();
      ctx.fillStyle = "rgb(241 237 226 / 0.08)";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.fillStyle = C.mute;
      ctx.textAlign = "left";
      ctx.fillText("Chatter, times normal", left + 2, chTop + 5);
      ctx.fillStyle = C.text;
      ctx.fillText(`x${cands[n - 1].chatter.toFixed(1)}`, right + 6, cy(cands[n - 1].chatter));

      // Time axis.
      ctx.fillStyle = C.mute;
      ctx.textAlign = "center";
      for (const k of [0, 14, 28, 42, VISIBLE - 1]) {
        const label = k === VISIBLE - 1 ? "now" : `-${VISIBLE - 1 - k}m`;
        ctx.fillText(label, Math.min(Math.max(cx(k), left + 14), right - 10), H - 9);
      }

      // The flag: a dashed line through every pane and a chip on the price pane.
      const fi = cands.findIndex((c) => c.flag);
      if (fi >= 0) {
        const x = Math.round(cx(fi)) + 0.5;
        ctx.strokeStyle = "rgb(255 160 40 / 0.75)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, chTop + chH);
        ctx.stroke();
        ctx.setLineDash([]);
        const w = 36;
        const bx = Math.min(x + 5, right - w);
        ctx.fillStyle = C.accent;
        ctx.fillRect(bx, top + 2, w, 16);
        ctx.fillStyle = C.bg;
        ctx.textAlign = "center";
        ctx.fillText("FLAG", bx + w / 2, top + 10);
      }

      // Last price tag on the scale.
      const lc = cands[n - 1];
      const ly = py(lc.c);
      const lcol = lc.c >= lc.o ? C.up : C.down;
      ctx.strokeStyle = lcol;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(left, Math.round(ly) + 0.5);
      ctx.lineTo(right, Math.round(ly) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = lcol;
      ctx.fillRect(right + 2, ly - 8, 52, 16);
      ctx.fillStyle = C.bg;
      ctx.textAlign = "left";
      ctx.fillText(price(lc.c), right + 6, ly);

      // Crosshair and readout.
      const ro = q("readout");
      if (hover && hover.x > left && hover.x < right) {
        const i = Math.min(n - 1, Math.max(0, Math.floor((hover.x - left) / cw)));
        const c = cands[i];
        ctx.strokeStyle = "rgb(241 237 226 / 0.35)";
        ctx.beginPath();
        ctx.moveTo(Math.round(cx(i)) + 0.5, top);
        ctx.lineTo(Math.round(cx(i)) + 0.5, chTop + chH);
        ctx.stroke();
        ro.style.opacity = "1";
        ro.textContent = `O ${price(c.o)}  H ${price(c.h)}  L ${price(c.l)}  C ${price(c.c)}  Score ${c.score}`;
      } else {
        ro.style.opacity = "0";
      }
    };

    const schedule = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(draw);
      }
    };

    const writeHeader = () => {
      const hist = stream.history;
      const c = stream.partial(t(), wig);
      const base = hist[Math.max(0, hist.length - VISIBLE)].c;
      const chg = (c.c / base - 1) * 100;
      set("last", price(c.c), dirColor(chg));
      set("chg", pct(chg), dirColor(chg));
    };

    const writeEvidence = () => {
      const hist = stream.history;
      const c = hist[hist.length - 1];
      const v = verdictOf(c.score);
      set("verdict", `${v.label}.`);
      q("verdict").className = `text-2xl font-semibold leading-tight tracking-[-0.02em] ${v.tone}`;
      set("note", v.note);
      set("score", String(c.score));
      q("segs")
        .querySelectorAll<HTMLElement>(".seg")
        .forEach((s, i) => (s.dataset.on = i < c.score / (100 / SEGMENTS) ? "1" : "0"));
      set("chatter", `x${c.chatter.toFixed(1)}`);
      set("newacc", `${Math.round(c.newShare * 100)}%`);
      set("dupes", `${Math.round(c.dupeShare * 100)}%`);
      set("volx", `x${(c.v / NORMAL_VOLUME).toFixed(1)}`);
      set("swing", `±${c.swing.toFixed(0)}% ${swingRegime(c.swing)}`);
    };

    const resize = () => {
      const r = cv.parentElement!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      W = r.width;
      H = r.height;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      vmax = 0;
      schedule();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv.parentElement!);

    // Reduced motion: run on to just after the flag and hold that frame.
    if (reduce) {
      for (let i = 0; i < 80; i++) {
        stream.commit();
        const h = stream.history;
        if (h.some((c) => c.flag) && h[h.length - 1].score >= 72 && h.slice(-6).every((c) => c.score >= 72)) break;
      }
      writeEvidence();
      writeHeader();
      resize();
      return () => ro.disconnect();
    }

    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      schedule();
    };
    const onLeave = () => {
      hover = null;
      schedule();
    };
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerleave", onLeave);

    writeEvidence();
    writeHeader();

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      step += 1;
      wig = Math.random() - 0.5;
      if (step >= STEPS) {
        stream.commit();
        step = 0;
        writeEvidence();
      }
      writeHeader();
      schedule();
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
      ro.disconnect();
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={root}
      className="rise overflow-hidden border border-line bg-line"
      style={{ "--d": "140ms" } as React.CSSProperties}
    >
      <div className="grid grid-cols-1 gap-px md:grid-cols-12">
        <Pane
          className="md:col-span-8"
          title={
            <>
              <span className="font-mono text-sm font-semibold">YZEN</span>
              <span data-k="last" className="font-mono text-sm tabular-nums" style={{ color: dirColor(lastC.c - base0) }}>
                {price(lastC.c)}
              </span>
              <span data-k="chg" className="font-mono text-xs tabular-nums" style={{ color: dirColor(lastC.c - base0) }}>
                {pct((lastC.c / base0 - 1) * 100)}
              </span>
            </>
          }
          tag="Simulated, one-minute candles"
        >
          <div className="relative h-[260px] md:h-[330px] [@media(max-height:560px)]:h-[240px]">
            <canvas
              ref={canvas}
              className="absolute inset-0 h-full w-full touch-pan-y"
              role="img"
              aria-label="Simulated candlestick chart with a volume strip and a chatter indicator. Chatter climbs first, then price, then the flag fires."
            />
            <p
              data-k="readout"
              className="pointer-events-none absolute left-3 top-2 hidden whitespace-nowrap bg-surface/90 px-1 font-mono text-[11px] tabular-nums text-mute opacity-0 transition-opacity duration-150 ease-out md:block"
            />
          </div>
        </Pane>

        <Pane className="md:col-span-4" title="Why YZEN" tag="Evidence, simulated">
          <div className="flex flex-1 flex-col gap-4 px-4 py-4">
            <div>
              <p data-k="verdict" className={`text-2xl font-semibold leading-tight tracking-[-0.02em] ${verdict0.tone}`}>
                {verdict0.label}.
              </p>
              <p data-k="note" className="mt-1 min-h-[2.5rem] text-pretty text-sm leading-relaxed text-mute">
                {verdict0.note}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div data-k="segs" className="grid flex-1 grid-cols-20 gap-[2px]" aria-hidden>
                {Array.from({ length: SEGMENTS }, (_, i) => (
                  <span key={i} className="seg h-1.5 bg-line-strong transition-colors duration-150 ease-out" data-on={i < lastC.score / (100 / SEGMENTS) ? "1" : "0"} />
                ))}
              </div>
              <span data-k="score" className="w-7 text-right font-mono text-sm tabular-nums">
                {lastC.score}
              </span>
            </div>
            <dl className="mt-auto grid gap-2 text-sm">
              {[
                ["Chatter", "chatter", `x${lastC.chatter.toFixed(1)}`],
                ["Posts from new accounts", "newacc", `${Math.round(lastC.newShare * 100)}%`],
                ["Copy-paste posts", "dupes", `${Math.round(lastC.dupeShare * 100)}%`],
                ["Volume", "volx", `x${(lastC.v / NORMAL_VOLUME).toFixed(1)}`],
                ["Expected 1h swing", "swing", `±${lastC.swing.toFixed(0)}% ${swingRegime(lastC.swing)}`],
              ].map(([label, k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-mute">{label}</dt>
                  <dd data-k={k} className="font-mono tabular-nums">
                    {v}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-line pt-2">
                <dt className="text-mute">Catalyst</dt>
                <dd className="font-mono text-accent">none found</dd>
              </div>
            </dl>
          </div>
        </Pane>
      </div>
    </div>
  );
}
