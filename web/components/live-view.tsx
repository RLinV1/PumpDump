"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LiveChart } from "@/components/live-chart";
import { NOTICE, STREAM_URL, age, clock, get, type Flag, type Score, type Timeline } from "@/lib/api";
import { btnGhost } from "@/lib/ui";
import { verdictOf } from "@/lib/verdict";

type State<T> = { data?: T; notice?: string; failed: boolean; done: boolean };

// Fetches after first paint, polls, and keeps the last good data when a poll fails.
function useApi<T>(path: string, ms: number, nonce = 0, windowH?: number) {
  const [s, setS] = useState<State<T>>({ failed: false, done: false });
  const [retries, setRetries] = useState(0);
  useEffect(() => {
    let on = true;
    const run = () => {
      let p = path;
      if (windowH) {
        const to = new Date();
        p += `?from=${new Date(+to - windowH * 3600e3).toISOString()}&to=${to.toISOString()}`;
      }
      get<T>(p).then(
        (r) => on && setS({ data: r.data, notice: r.notice, failed: false, done: true }),
        () => on && setS((o) => ({ ...o, failed: true, done: true })),
      );
    };
    run();
    const id = setInterval(run, ms);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [path, ms, nonce, windowH, retries]);
  return { ...s, retry: () => setRetries((n) => n + 1) };
}

function Pane({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 border border-line bg-surface">
      <header className="flex h-9 items-center justify-between border-b border-line px-3 text-sm">
        <h2 className="font-medium">{title}</h2>
        {tag && <span className="font-mono text-[11px] uppercase text-mute">{tag}</span>}
      </header>
      {children}
    </section>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 p-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-8 bg-line motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

function Message({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="p-4 text-sm" role={onRetry ? "alert" : "status"}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-[52ch] text-mute">{body}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {onRetry && (
          <button onClick={onRetry} className={btnGhost}>
            Retry
          </button>
        )}
        <Link href="/#detector" className="inline-flex h-11 items-center text-mute underline hover:text-text">
          Try the simulated detector
        </Link>
      </div>
    </div>
  );
}

const DOWN = { title: "Live API not reachable", body: "The scoring API is down or still starting. Nothing is shown rather than guessing. Check that it is running, then retry." };

function Verdict({ score }: { score: number }) {
  const v = verdictOf(score);
  return <span className={`inline-flex h-6 items-center px-2 text-xs font-medium ${v.style}`}>{v.label}</span>;
}

function Stale({ sources }: { sources: string[] }) {
  if (!sources.length) return null;
  return (
    <span className="border border-line-strong px-1.5 font-mono text-[11px] uppercase text-text" title="These inputs have stopped updating, so the score may lag.">
      stale {sources.join(", ")}
    </span>
  );
}

function Watchlist({ w, ticker, onPick }: { w: ReturnType<typeof useApi<Score[]>>; ticker?: string; onPick: (t: string) => void }) {
  const { data, failed, done, retry } = w;
  const rows = useMemo(() => [...(data ?? [])].sort((a, b) => b.score - a.score), [data]);
  return (
    <Pane title="Watchlist" tag={done && !failed ? "live" : undefined}>
      {!done ? (
        <Skeleton rows={4} />
      ) : failed && !data ? (
        <Message {...DOWN} onRetry={retry} />
      ) : rows.length === 0 ? (
        <Message title="No scores yet" body="The API is up but has not scored any ticker. Scores appear after the first full window of data." />
      ) : (
        <>
          {failed && <p className="border-b border-line px-3 py-2 text-xs text-mute">Connection lost. Showing the last scores received.</p>}
          <ul>
            {rows.map((r) => (
              <li key={r.ticker} className="border-b border-line last:border-b-0">
                <button
                  onClick={() => onPick(r.ticker)}
                  aria-pressed={r.ticker === ticker}
                  className={`flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left transition-colors duration-150 hover:bg-line ${r.ticker === ticker ? "bg-line" : ""}`}
                >
                  <span className="w-14 font-mono font-medium">{r.ticker}</span>
                  <span className="w-10 font-mono">{Math.round(r.score)}</span>
                  <Verdict score={r.score} />
                  <span className="ml-auto font-mono text-[11px] text-mute">{age(r.computedAt)}</span>
                  <span className="w-full empty:hidden">
                    <Stale sources={r.staleSources} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Pane>
  );
}

function TimelinePane({ ticker, nonce, stale }: { ticker: string; nonce: number; stale: string[] }) {
  const { data, failed, done, retry } = useApi<Timeline>(`/api/v1/tickers/${ticker}/timeline`, 30000, nonce, 6);
  const last = data?.scores.at(-1);
  return (
    <Pane title={`${ticker} score, last 6 hours`} tag={done && !failed ? "live" : undefined}>
      <div className="p-3">
        {!done ? (
          <div className="h-64 bg-line motion-safe:animate-pulse md:h-80" aria-busy="true" aria-label="Loading" />
        ) : failed && !data ? (
          <Message {...DOWN} onRetry={retry} />
        ) : !data || (data.scores.length === 0 && data.flags.length === 0) ? (
          <Message title={`No history for ${ticker} yet`} body="No scores or flags fall in this window." />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              {last && (
                <>
                  <span className="font-mono text-2xl font-semibold">{Math.round(last.score)}</span>
                  <Verdict score={last.score} />
                </>
              )}
              <Stale sources={stale} />
              {failed && <span className="text-xs text-mute">Connection lost. Showing the last data received.</span>}
            </div>
            <LiveChart t={data} />
          </>
        )}
      </div>
    </Pane>
  );
}

function FlagFeed({ onPick, extra, setExtra }: { onPick: (t: string) => void; extra: Flag[]; setExtra: (f: (o: Flag[]) => Flag[]) => void }) {
  const { data, failed, done, retry } = useApi<Flag[]>("/api/v1/flags?limit=20", 3600e3);
  const [open, setOpen] = useState(false);

  // EventSource reconnects by itself and resends Last-Event-ID, so a dropped stream resumes without gaps.
  useEffect(() => {
    const es = new EventSource(STREAM_URL);
    es.onopen = () => setOpen(true);
    es.onerror = () => setOpen(false);
    es.addEventListener("flag", (e) => {
      const f = (JSON.parse((e as MessageEvent).data) as { data: Flag }).data;
      setExtra((o) => (o.some((x) => x.id === f.id) ? o : [f, ...o].slice(0, 50)));
    });
    return () => es.close();
  }, [setExtra]);

  const flags = useMemo(() => {
    const seen = new Set<number>();
    return [...extra, ...(data ?? [])].filter((f) => !seen.has(f.id) && seen.add(f.id)).sort((a, b) => b.id - a.id);
  }, [extra, data]);

  return (
    <Pane title="Flags" tag={open ? "streaming" : done ? "reconnecting" : undefined}>
      {!done ? (
        <Skeleton rows={3} />
      ) : failed && !data && flags.length === 0 ? (
        <Message {...DOWN} onRetry={retry} />
      ) : flags.length === 0 ? (
        <Message title="No flags yet" body="Nothing has crossed the flag threshold. New flags appear here the moment they are raised." />
      ) : (
        <ul>
          {flags.map((f) => (
            <li key={f.id} className="border-b border-line px-3 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button onClick={() => onPick(f.ticker)} className="font-mono font-medium underline decoration-line-strong hover:decoration-text">
                  {f.ticker}
                </button>
                <span className="font-mono">{Math.round(f.evidence.score)}</span>
                <Verdict score={f.evidence.score} />
                <span className="ml-auto font-mono text-[11px] text-mute">
                  {clock(f.raisedAt)} · {age(f.raisedAt)}
                </span>
              </div>
              <p className="mt-2 break-words text-sm text-mute">
                {f.evidence.postCount} posts, {f.evidence.tradeCount} trades.{" "}
                {f.evidence.catalyst
                  ? f.evidence.catalyst.found
                    ? `${f.evidence.catalyst.items.length} possible catalyst${f.evidence.catalyst.items.length === 1 ? "" : "s"} found, so the score is discounted.`
                    : "No catalyst found in the lookback."
                  : "Catalyst check not run."}
                {f.evidence.topContributors.length > 0 && (
                  <>
                    {" "}
                    Driven by{" "}
                    {f.evidence.topContributors.map((c) => `${c.featureGroup} (${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(1)})`).join(", ")}.
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Pane>
  );
}

export function LiveView() {
  const [pick, setPick] = useState<string>();
  const [extra, setExtra] = useState<Flag[]>([]);
  const [, tick] = useState(0);
  const w = useApi<Score[]>("/api/v1/watchlist", 15000);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const scores = w.data;
  const top = useMemo(() => [...(scores ?? [])].sort((a, b) => b.score - a.score)[0], [scores]);
  const ticker = pick ?? top?.ticker;
  const stale = scores?.find((s) => s.ticker === ticker)?.staleSources ?? [];
  const nonce = extra.find((f) => f.ticker === ticker)?.id ?? 0;

  return (
    <>
      <div className="sticky top-14 z-30 border-b border-line bg-bg">
        <p className="mx-auto max-w-[1400px] px-4 py-2 text-xs text-mute md:px-8">{w.notice ?? NOTICE}</p>
      </div>
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 md:px-8">
      <div className="grid gap-3 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Watchlist w={w} ticker={ticker} onPick={setPick} />
        </div>
        <div className="min-w-0 lg:col-span-8">
          {ticker ? (
            <TimelinePane key={ticker} ticker={ticker} nonce={nonce} stale={stale} />
          ) : (
            <Pane title="Score timeline">
              <Message title="No ticker selected" body="Pick a ticker from the watchlist once the API has scored one." />
            </Pane>
          )}
        </div>
        <div className="lg:col-span-12">
          <FlagFeed onPick={setPick} extra={extra} setExtra={setExtra} />
        </div>
      </div>
      <p className="mt-6 max-w-[80ch] text-xs leading-relaxed text-mute">
        Scores are model output about how much a ticker&apos;s chatter and price look like coordinated hype, not a
        prediction of price. Sources, where enabled: Alpaca market data and news, SEC EDGAR filings, and public
        posts from Bluesky and Reddit. Posts contribute counts only; no post text or author is stored or shown.
      </p>
    </div>
    </>
  );
}
