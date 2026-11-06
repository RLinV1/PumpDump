"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useApi } from "@/lib/use-api";
import { LiveChart } from "@/components/live-chart";
import { MoversPanel, NewsPanel, SentimentPanel } from "@/components/market-context";
import { NOTICE, STREAM_URL, age, clock, compareFlags, parseFlagEvent, type Flag, type Score, type Timeline } from "@/lib/api";
import { btnGhost } from "@/lib/ui";
import { verdictOf } from "@/lib/verdict";
import { addTicker, parseWatchlist, readWatchlist, saveWatchlist, subscribeWatchlist } from "@/lib/watchlist";

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
    <div className="space-y-3 p-3" role="status" aria-busy="true" aria-label="Loading">
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

const DOWN = { title: "Risk data unavailable", body: "The latest data could not be loaded. Retry, or use the simulated detector while the feed recovers." };

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

function Watchlist({ w, ticker, onPick, symbols, onAdd, onRemove }: { w: ReturnType<typeof useApi<Score[]>>; ticker?: string; onPick: (t: string) => void; symbols: string[]; onAdd: (value: string) => string | undefined; onRemove: (ticker: string) => string | undefined }) {
  const { data, failed, done, retry } = w;
  const [input, setInput] = useState("");
  const [error, setError] = useState<string>();
  const rows = useMemo(() => symbols.map((symbol) => ({ ticker: symbol, score: data?.find((score) => score.ticker === symbol) }))
    .sort((a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1)), [data, symbols]);
  return (
    <Pane title="Watchlist" tag={done && !failed ? w.mode : undefined}>
      <form aria-label="Add stock to watchlist" className="border-b border-line p-3" onSubmit={(event) => {
        event.preventDefault();
        const message = onAdd(input);
        setError(message);
        if (!message) setInput("");
      }}>
        <label htmlFor="watchlist-symbol" className="mb-2 block text-xs text-mute">Stock ticker</label>
        <div className="flex gap-2">
          <input id="watchlist-symbol" value={input} onChange={(event) => { setInput(event.target.value); setError(undefined); }} placeholder="e.g. AAPL" maxLength={16} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? "watchlist-error" : "watchlist-help"} className="h-11 min-w-0 flex-1 border border-line-strong bg-bg px-3 font-mono text-base uppercase placeholder:normal-case placeholder:text-mute focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent" />
          <button type="submit" className={`${btnGhost} shrink-0`}>Add stock</button>
        </div>
        <p id="watchlist-help" className="mt-2 text-xs leading-relaxed text-mute">Saved in this browser. News and sentiment are available for added stocks; risk scores require market tracking.</p>
        {error && <p id="watchlist-error" role="alert" className="mt-2 text-sm">{error}</p>}
      </form>
      {!done && rows.length === 0 ? (
        <Skeleton rows={4} />
      ) : failed && !data && rows.length === 0 ? (
        <Message {...DOWN} onRetry={retry} />
      ) : rows.length === 0 ? (
        <Message title="Your watchlist is empty" body="Add a stock ticker to follow its news and sentiment." />
      ) : (
        <>
          {failed && <p className="border-b border-line px-3 py-2 text-xs text-mute">Connection lost. Showing the last scores received.</p>}
          <ul aria-label="Watchlist stocks" className="max-h-96 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.ticker} className="flex items-center border-b border-line last:border-b-0">
                <button
                  onClick={() => onPick(r.ticker)}
                  aria-pressed={r.ticker === ticker}
                  className={`flex min-h-14 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left transition-colors duration-150 hover:bg-line ${r.ticker === ticker ? "bg-line" : ""}`}
                >
                  <span className="w-14 font-mono font-medium">{r.ticker}</span>
                  {r.score ? <>
                    <span className="w-10 font-mono">{Math.round(r.score.score)}</span>
                    <Verdict score={r.score.score} />
                    <span className="ml-auto font-mono text-[11px] text-mute" title={`Score window ended ${r.score.windowEnd}`}>data {age(r.score.windowEnd)}</span>
                  </> : <span className="text-xs text-mute">No risk score yet</span>}
                  <span className="w-full empty:hidden">
                    <Stale sources={r.score?.staleSources ?? []} />
                  </span>
                </button>
                <button type="button" aria-label={`Remove ${r.ticker} from watchlist`} onClick={() => setError(onRemove(r.ticker))} className="mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center text-mute hover:text-text focus-visible:outline-1 focus-visible:outline-accent">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Pane>
  );
}

function TimelinePane({ ticker, nonce, stale, refreshKey }: { ticker: string; nonce: number; stale: string[]; refreshKey: number }) {
  const { data, failed, done, retry, mode } = useApi<Timeline>(`/api/v1/tickers/${ticker}/timeline`, 30000, nonce, 6, refreshKey);
  const last = data?.scores.at(-1);
  return (
    <Pane title={`${ticker} score, last 6 hours`} tag={done && !failed ? mode : undefined}>
      <div className="p-3">
        {!done ? (
          <div className="h-64 bg-line motion-safe:animate-pulse md:h-80" role="status" aria-busy="true" aria-label="Loading" />
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

function FlagFeed({ onPick, extra, setExtra, refreshKey }: { onPick: (t: string) => void; extra: Flag[]; setExtra: (f: (o: Flag[]) => Flag[]) => void; refreshKey: number }) {
  const { data, failed, done, retry, mode } = useApi<Flag[]>("/api/v1/flags?limit=20", 3600e3, 0, undefined, refreshKey);
  const [open, setOpen] = useState(false);

  // EventSource reconnects by itself and resends Last-Event-ID, so a dropped stream resumes without gaps.
  useEffect(() => {
    const es = new EventSource(STREAM_URL);
    es.onopen = () => { setOpen(true); retry(); };
    es.onerror = () => setOpen(false);
    es.addEventListener("flag", (e) => {
      const f = parseFlagEvent((e as MessageEvent).data);
      if (!f) return;
      setExtra((o) => (o.some((x) => x.id === f.id) ? o : [f, ...o].slice(0, 50)));
    });
    return () => es.close();
  }, [setExtra, retry]);

  const flags = useMemo(() => {
    const seen = new Set<number>();
    return [...extra, ...(data ?? [])].filter((f) => !seen.has(f.id) && seen.add(f.id)).sort(compareFlags);
  }, [extra, data]);

  return (
    <Pane title="Flags" tag={open ? (mode === "mock" ? "mock stream" : "streaming") : done ? "reconnecting" : undefined}>
      {!done && flags.length === 0 ? (
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
                <button onClick={() => onPick(f.ticker)} className="inline-flex min-h-11 min-w-11 items-center font-mono font-medium underline decoration-line-strong hover:decoration-text">
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [, tick] = useState(0);
  const w = useApi<Score[]>("/api/v1/watchlist", 15000, 0, undefined, refreshKey);
  const savedRaw = useSyncExternalStore(subscribeWatchlist, readWatchlist, () => null);
  const saved = useMemo(() => parseWatchlist(savedRaw), [savedRaw]);
  const symbols = useMemo(() => saved ?? (w.data ?? []).map((score) => score.ticker), [saved, w.data]);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const scores = w.data;
  const top = useMemo(() => [...(scores ?? [])].filter((score) => symbols.includes(score.ticker)).sort((a, b) => b.score - a.score)[0], [scores, symbols]);
  const ticker = pick ?? top?.ticker ?? symbols[0];
  const stale = scores?.find((s) => s.ticker === ticker)?.staleSources ?? [];
  const nonce = extra.find((f) => f.ticker === ticker)?.id ?? 0;

  return (
    <>
      <div className="sticky top-14 z-30 border-b border-line bg-bg">
        <p className="mx-auto max-w-[1400px] px-4 py-2 text-xs text-mute md:px-8">{w.mode === "mock" && <strong className="text-accent">Mock data. No market feed connected. </strong>}{w.notice ?? NOTICE}</p>
      </div>
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 md:px-8">
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 text-sm text-mute"><span>{symbols.length} stocks</span><a className="inline-flex min-h-11 items-center underline" href="#stock-news">News</a><a className="inline-flex min-h-11 items-center underline" href="#stock-sentiment">Sentiment</a><a className="inline-flex min-h-11 items-center underline" href="#market-movers">Movers</a></div>
        <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className={`${btnGhost} shrink-0`} title="Reload watchlist, selected chart, flags, news, movers and sentiment">
          Refresh all
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Watchlist w={w} ticker={ticker} onPick={setPick} symbols={symbols} onAdd={(value) => {
            const result = addTicker(symbols, value);
            if (result.error !== undefined) return result.error;
            try { saveWatchlist(result.tickers); } catch { return "Could not save your watchlist. Allow browser storage and try again."; }
            setPick(result.ticker);
          }} onRemove={(symbol) => {
            try { saveWatchlist(symbols.filter((value) => value !== symbol)); } catch { return "Could not save your watchlist. Allow browser storage and try again."; }
            if (ticker === symbol) setPick(undefined);
          }} />
        </div>
        <div className="min-w-0 lg:col-span-8">
          {ticker ? (
            <TimelinePane key={ticker} ticker={ticker} nonce={nonce} stale={stale} refreshKey={refreshKey} />
          ) : (
            <Pane title="Score timeline">
              <Message title="No ticker selected" body="Add a stock to your watchlist or select a market mover." />
            </Pane>
          )}
        </div>
        <div className="lg:col-span-12">
          <FlagFeed onPick={setPick} extra={extra} setExtra={setExtra} refreshKey={refreshKey} />
        </div>
        {ticker && <>
          <div className="lg:col-span-8"><NewsPanel key={ticker} ticker={ticker} refreshKey={refreshKey} /></div>
          <div className="lg:col-span-4"><SentimentPanel key={ticker} ticker={ticker} refreshKey={refreshKey} /></div>
        </>}
        <div className="lg:col-span-12"><MoversPanel refreshKey={refreshKey} selectedTicker={ticker} onPick={(symbol) => {
          setPick(symbol);
          requestAnimationFrame(() => document.getElementById("stock-sentiment")?.scrollIntoView({ block: "start" }));
        }} /></div>
        <div className="lg:col-span-12"><NewsPanel refreshKey={refreshKey} /></div>
      </div>
      <p className="mt-6 max-w-[80ch] text-xs leading-relaxed text-mute">
        Scores are model output about how much a ticker&apos;s chatter and price look like coordinated hype, not a
        prediction of price. Sources, where enabled: Alpaca market data and news, SEC EDGAR filings, and public
        posts from Bluesky and Reddit. This view shows aggregate evidence only, without post text or author names.
      </p>
    </div>
    </>
  );
}
