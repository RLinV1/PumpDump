"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Panel } from "./panel";

// Invented symbols and prices. Values drift and flash like a quote monitor, but are plainly labelled as simulated.
const ROWS = [
  { sym: "NRVX", open: 3.2, last: 6.84, chatter: 1240, news: "NONE", score: 94 },
  { sym: "QLMT", open: 1.45, last: 2.31, chatter: 880, news: "NONE", score: 81 },
  { sym: "PRVD", open: 8.1, last: 11.62, chatter: 620, news: "NONE", score: 68 },
  { sym: "BRZO", open: 14.2, last: 14.55, chatter: 310, news: "WIRE", score: 22 },
  { sym: "HLXR", open: 22.8, last: 22.31, chatter: 145, news: "8-K", score: 12 },
  { sym: "KTNO", open: 5.05, last: 5.07, chatter: 40, news: "WIRE", score: 6 },
];

const price = (n: number) => n.toFixed(2);
const pct = (open: number, last: number) => {
  const p = (last / open - 1) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
};
const chatterFmt = (n: number) => `+${Math.round(n).toLocaleString("en-US")}%`;
const dir = (open: number, last: number) => (last >= open ? "text-up" : "text-down");

export function Monitor() {
  const body = useRef<HTMLTableSectionElement>(null);

  // Each tick nudges a few rows. Only the price cell flashes, green or red, the way a quote board shows direction.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rows = ROWS.map((r) => ({ ...r }));
    const trs = Array.from(body.current!.querySelectorAll<HTMLTableRowElement>("tr"));

    const id = window.setInterval(() => {
      rows.forEach((r, i) => {
        if (Math.random() < 0.5) return;
        const prev = r.last;
        const bias = r.score >= 65 ? 0.42 : 0.5;
        r.last = Math.max(0.5, r.last * (1 + (Math.random() - bias) * 0.012));
        r.chatter = Math.max(10, r.chatter + (Math.random() - 0.45) * r.chatter * 0.06);
        r.score = Math.min(99, Math.max(1, r.score + (Math.random() - 0.5) * 5));

        const tr = trs[i];
        const flagged = r.score >= 65;
        const lastCell = tr.querySelector<HTMLElement>("[data-l]")!;
        const chgCell = tr.querySelector<HTMLElement>("[data-p]")!;
        lastCell.textContent = price(r.last);
        chgCell.textContent = pct(r.open, r.last);
        chgCell.className = `hidden px-3 py-2 text-right lg:table-cell ${dir(r.open, r.last)}`;
        tr.querySelector<HTMLElement>("[data-c]")!.textContent = chatterFmt(r.chatter);
        tr.querySelector<HTMLElement>("[data-s]")!.textContent = String(Math.round(r.score));
        tr.querySelector<HTMLElement>("[data-f]")!.textContent = flagged ? "FLAG" : "";
        tr.dataset.flag = flagged ? "1" : "0";

        gsap.fromTo(
          lastCell,
          { backgroundColor: r.last >= prev ? "rgba(53,224,112,0.4)" : "rgba(255,80,80,0.4)" },
          { backgroundColor: "rgba(0,0,0,0)", duration: 0.6, ease: "power2.out" },
        );
      });
    }, 1100);

    return () => {
      window.clearInterval(id);
      gsap.killTweensOf("[data-l]");
    };
  }, []);

  return (
    <Panel title="Signal monitor" tag="Simulated" className="h-full border-0">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-mute">
            <th className="px-3 py-2 font-normal">SYM</th>
            <th className="hidden px-3 py-2 text-right font-normal lg:table-cell">LAST</th>
            <th className="hidden px-3 py-2 text-right font-normal lg:table-cell">%CHG</th>
            <th className="px-3 py-2 text-right font-normal">CHATTER</th>
            <th className="px-3 py-2 font-normal">NEWS</th>
            <th className="px-3 py-2 text-right font-normal">SCORE</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody ref={body}>
          {ROWS.map((r) => (
            <tr key={r.sym} data-flag={r.score >= 65 ? "1" : "0"} className="mrow border-t border-line">
              <td className="px-3 py-2 font-bold">{r.sym}</td>
              <td data-l className="hidden px-3 py-2 text-right lg:table-cell">
                {price(r.last)}
              </td>
              <td data-p className={`hidden px-3 py-2 text-right lg:table-cell ${dir(r.open, r.last)}`}>
                {pct(r.open, r.last)}
              </td>
              <td data-c className="px-3 py-2 text-right text-amber-dim">
                {chatterFmt(r.chatter)}
              </td>
              <td className={`px-3 py-2 ${r.news === "NONE" ? "text-down" : "text-up"}`}>{r.news}</td>
              <td data-s className="px-3 py-2 text-right font-bold">
                {r.score}
              </td>
              <td className="px-3 py-2 text-right">
                <span data-f className="bg-amber px-1 text-xs font-bold text-bg empty:hidden">
                  {r.score >= 65 ? "FLAG" : ""}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-xs text-mute">Simulated values, not market data.</p>
    </Panel>
  );
}
