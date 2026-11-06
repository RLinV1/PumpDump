import Link from "next/link";
import type { ReactNode } from "react";
import { btnGhost } from "@/lib/ui";
import { verdictOf } from "@/lib/verdict";
import type { DataMode } from "@/lib/api";

// A numbered terminal panel. The title bar goes amber (reverse video) when a command has just jumped here.
export function Panel({ id, number, title, tag, active, className = "", children }: {
  id: string; number: number; title: ReactNode; tag?: ReactNode; active?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`} className={`flex min-h-0 min-w-0 scroll-mt-28 flex-col border border-line-strong bg-bg outline-offset-[-2px] ${className}`}>
      <header className={`flex h-8 shrink-0 items-center justify-between gap-3 px-2 text-xs ${active ? "bg-accent text-bg" : "bar"}`}>
        <h2 id={`${id}-title`} className="flex min-w-0 items-baseline gap-2 font-semibold uppercase">
          <span className={active ? "text-bg" : "text-yellow"}>{number}</span>
          <span className="truncate">{title}</span>
        </h2>
        {tag && <span className="shrink-0 text-xs font-semibold uppercase">{tag}</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

export function modeTag(...modes: (DataMode | undefined)[]) {
  const set = [...new Set(modes.filter(Boolean))] as DataMode[];
  return set.length ? set.map((m) => m.toUpperCase()).join(" / ") : undefined;
}

export function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 p-2" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-6 bg-line motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

export function Message({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="p-3 text-xs" role={onRetry ? "alert" : "status"}>
      <p className="font-semibold text-accent">{title}</p>
      <p className="mt-1 max-w-[52ch] text-mute">{body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {onRetry && <button onClick={onRetry} className={btnGhost}>Retry</button>}
        <Link href="/#detector" className="inline-flex min-h-11 items-center text-cyan underline">Try the simulated detector</Link>
      </div>
    </div>
  );
}

export function Verdict({ score }: { score: number }) {
  const v = verdictOf(score);
  return <span className={`inline-flex h-5 items-center px-1.5 text-xs font-semibold uppercase ${v.style}`}>{v.label}</span>;
}

export function Stale({ sources }: { sources: string[] }) {
  if (!sources.length) return null;
  return (
    <span className="border border-yellow px-1 text-xs uppercase text-yellow" title="These inputs have stopped updating, so the score may lag.">
      stale {sources.join(", ")}
    </span>
  );
}

export const money = (value: number) => (value < 1 ? value.toFixed(4) : value.toFixed(2));
export const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
export const dirTone = (value: number) => (value > 0 ? "text-up" : value < 0 ? "text-down" : "text-white");
