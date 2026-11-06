"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useApi } from "@/lib/use-api";
import { LiveChart } from "@/components/live-chart";
import { MoversPanel, NewsPanel, SentimentPanel } from "@/components/market-context";
import { LookupPanel, PaperPanel, useLookup, usePaper } from "@/components/trade-panels";
import { Message, Panel, Skeleton, Stale, Verdict, dirTone, modeTag, money, signed } from "@/components/term-panel";
import { NOTICE, STREAM_URL, age, clock, compareFlags, parseFlagEvent, type Flag, type MarketMovers, type Quote, type Quotes, type Score, type Timeline } from "@/lib/api";
import { PANELS, parseCommand, type Panel as PanelId } from "@/lib/commands";
import { btnGhost } from "@/lib/ui";
import { addTicker, parseWatchlist, readWatchlist, saveWatchlist, subscribeWatchlist } from "@/lib/watchlist";

const DOWN = { title: "Risk data unavailable", body: "The latest data could not be loaded. Retry, or use the simulated detector while the feed recovers." };
const ELEMENT: Record<PanelId, string> = { watchlist: "watchlist", chart: "score-chart", flags: "flags", news: "stock-news", sentiment: "stock-sentiment", movers: "market-movers", lookup: "lookup", paper: "paper" };
const HELP: [string, string][] = [
  ["GME <GO>", "Select a ticker (1 to 5 letters). Chart, news and sentiment follow it."],
  ["WL  GR  FLAG  NEWS  SENT  MOV  LOOK  PT", "Jump to a panel. The panel numbers 1 to 8 work too."],
  ["LOOK GME  /  DES GME", "Stock lookup (panel 7): snapshot, performance, indicators, beta and volatility."],
  ["BUY GME 10  /  SELL GME 10", "Simulated paper order (panel 8). Whole shares, filled at the server's price. No broker, no real money."],
  ["PT  /  PT RESET", "Open the paper account. PT RESET asks you to confirm with PT RESET CONFIRM."],
  ["ADD AMC  /  RM AMC", "Add a stock to your browser-saved watchlist, or remove it."],
  ["SEL FLAG", "Select a ticker that shares its name with a command."],
  ["RF", "Reload every panel."],
  ["/", "Return to the command line. Esc clears it. Up and Down recall earlier commands."],
];

type Out = { kind: "info" | "error" | "help"; text: string };

function Clock() {
  const [now, setNow] = useState<Date>();
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    const start = setTimeout(() => setNow(new Date()), 0);
    return () => { clearInterval(id); clearTimeout(start); };
  }, []);
  return <time dateTime={now?.toISOString()} className="tabular-nums text-white">{now ? now.toLocaleTimeString("en-GB", { hour12: false }) : "--:--:--"}</time>;
}

type TapeItem = { ticker: string; price: number; changePct: number };

// Real quotes for the watchlist, then the session's movers. Nothing is invented: with no data the strip says so.
function Tape({ items, mode, failed }: { items: TapeItem[]; mode?: string; failed: boolean }) {
  const list = (
    <ul className="flex min-w-[100vw] items-center justify-around gap-6 px-3">
      {items.map((i) => (
        <li key={i.ticker} className="flex items-baseline gap-2 whitespace-nowrap text-xs">
          <span className="font-semibold text-yellow">{i.ticker}</span>
          <span className="text-white">{money(i.price)}</span>
          <span className={dirTone(i.changePct)}>{signed(i.changePct)}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="tape flex h-8 items-center overflow-hidden border-b border-line bg-bg" role="region" aria-label="Ticker strip" tabIndex={0}>
      {mode === "mock" && <span className="z-10 mr-2 flex h-full shrink-0 items-center bg-accent px-2 text-xs font-semibold text-bg">MOCK</span>}
      {items.length === 0 ? (
        <p className="px-3 text-xs text-mute">{failed ? "Prices unavailable." : "Loading prices..."}</p>
      ) : (
        <div className="tape-track">
          {list}
          <div className="tape-copy" aria-hidden>{list}</div>
        </div>
      )}
    </div>
  );
}

function Watchlist({ w, q, ticker, onPick, symbols, onAdd, onRemove, active }: { w: ReturnType<typeof useApi<Score[]>>; q: ReturnType<typeof useApi<Quotes>>; ticker?: string; onPick: (t: string) => void; symbols: string[]; onAdd: (value: string) => string | undefined; onRemove: (ticker: string) => string | undefined; active: boolean }) {
  const { data, failed, done, retry } = w;
  const [input, setInput] = useState("");
  const [error, setError] = useState<string>();
  const quotes = useMemo(() => new Map((q.data?.quotes ?? []).map((quote) => [quote.ticker, quote])), [q.data]);
  const rows = useMemo(() => symbols.map((symbol) => ({ ticker: symbol, score: data?.find((score) => score.ticker === symbol) }))
    .sort((a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1)), [data, symbols]);
  return (
    <Panel id="watchlist" number={1} title="Watchlist" tag={done && !failed ? modeTag(w.mode, q.mode) : undefined} active={active} className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
      <form aria-label="Add stock to watchlist" className="border-b border-line p-2" onSubmit={(event) => {
        event.preventDefault();
        const message = onAdd(input);
        setError(message);
        if (!message) setInput("");
      }}>
        <label htmlFor="watchlist-symbol" className="mb-1 block text-xs text-accent">Stock ticker</label>
        <div className="flex gap-2">
          <input id="watchlist-symbol" value={input} onChange={(event) => { setInput(event.target.value); setError(undefined); }} placeholder="e.g. AAPL" maxLength={16} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? "watchlist-error" : "watchlist-help"} className="h-11 min-w-0 flex-1 border border-line-strong bg-bg px-2 text-base uppercase text-white placeholder:normal-case placeholder:text-mute lg:h-8 lg:text-xs" />
          <button type="submit" className={`${btnGhost} shrink-0 lg:h-8`}>Add stock</button>
        </div>
        <p id="watchlist-help" className="mt-1 text-xs leading-snug text-mute">Saved in this browser. News and sentiment work for any stock; risk scores need market tracking.</p>
        {error && <p id="watchlist-error" role="alert" className="mt-1 text-xs text-yellow">{error}</p>}
      </form>
      {!done && rows.length === 0 ? (
        <Skeleton rows={4} />
      ) : failed && !data && rows.length === 0 ? (
        <Message {...DOWN} onRetry={retry} />
      ) : rows.length === 0 ? (
        <Message title="Your watchlist is empty" body="Add a stock ticker to follow its news and sentiment." />
      ) : (
        <>
          {failed && <p className="border-b border-line px-2 py-1 text-xs text-yellow">Connection lost. Showing the last scores received.</p>}
          {q.failed && <p className="border-b border-line px-2 py-1 text-xs text-yellow">Prices could not be refreshed.</p>}
          <div aria-hidden className="grid grid-cols-[3.5rem_1fr_4.75rem_2.25rem] gap-x-2 border-b border-line px-2 py-1 pr-12 text-xs text-accent">
            <span>TICKER</span><span className="text-right">LAST</span><span className="text-right">CHG%</span><span className="text-right">RISK</span>
          </div>
          <ul aria-label="Watchlist stocks">
            {rows.map((r) => {
              const quote: Quote | undefined = quotes.get(r.ticker);
              const selected = r.ticker === ticker;
              return (
                <li key={r.ticker} className="flex items-center border-b border-line last:border-b-0">
                  <button
                    onClick={() => onPick(r.ticker)}
                    aria-pressed={selected}
                    className={`min-h-12 min-w-0 flex-1 px-2 py-1 text-left hover:bg-line ${selected ? "bg-accent text-bg hover:bg-accent [&_*]:border-bg! [&_*]:bg-transparent! [&_*]:text-bg!" : ""}`}
                  >
                    <span className="grid grid-cols-[3.5rem_1fr_4.75rem_2.25rem] items-baseline gap-x-2 text-xs">
                      <span className="font-semibold text-yellow">{r.ticker}</span>
                      <span className="text-right text-white">{quote ? money(quote.price) : q.done || q.failed ? <abbr title="Price unavailable" className="no-underline">n/a</abbr> : "..."}</span>
                      <span className={`text-right ${quote ? dirTone(quote.changePct) : "text-mute"}`}>{quote ? signed(quote.changePct) : q.done || q.failed ? <abbr title="Change unavailable" className="no-underline">n/a</abbr> : "..."}</span>
                      <span className="text-right text-white">{r.score ? Math.round(r.score.score) : "--"}</span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {r.score ? <>
                        <Verdict score={r.score.score} />
                        <span className="text-xs text-mute" title={`Score window ended ${r.score.windowEnd}`}>data {age(r.score.windowEnd)}</span>
                      </> : <span className="text-xs text-mute">No risk score yet</span>}
                      <Stale sources={r.score?.staleSources ?? []} />
                    </span>
                  </button>
                  <button type="button" aria-label={`Remove ${r.ticker} from watchlist`} onClick={() => setError(onRemove(r.ticker))} className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-mute hover:bg-line hover:text-white">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

function ChartPanel({ ticker, nonce, stale, refreshKey, quote, active }: { ticker: string; nonce: number; stale: string[]; refreshKey: number; quote?: Quote; active: boolean }) {
  const { data, failed, done, retry, mode } = useApi<Timeline>(`/api/v1/tickers/${ticker}/timeline`, 30000, nonce, 6, refreshKey);
  const last = data?.scores.at(-1);
  return (
    <Panel id="score-chart" number={2} title={`${ticker} score, last 6 hours`} tag={done && !failed ? modeTag(mode) : undefined} active={active} className="lg:col-start-2 lg:row-start-1">
      <div className="flex h-full min-h-0 flex-col p-2">
        {!done ? (
          <div className="min-h-24 flex-1 bg-line motion-safe:animate-pulse" role="status" aria-busy="true" aria-label="Loading" />
        ) : failed && !data ? (
          <Message {...DOWN} onRetry={retry} />
        ) : !data || (data.scores.length === 0 && data.flags.length === 0) ? (
          <Message title={`No history for ${ticker} yet`} body="No scores or flags fall in this window." />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {last && <><span className="font-display text-4xl font-extrabold leading-none text-white">{Math.round(last.score)}</span><Verdict score={last.score} /></>}
              {quote && <span className="text-xs"><span className="text-white">{money(quote.price)}</span> <span className={dirTone(quote.changePct)}>{signed(quote.changePct)}</span></span>}
              <Stale sources={stale} />
              {failed && <span className="text-xs text-yellow">Connection lost. Showing the last data received.</span>}
            </div>
            <div className="min-h-0 flex-1"><LiveChart t={data} tall /></div>
          </>
        )}
      </div>
    </Panel>
  );
}

function FlagFeed({ onPick, extra, setExtra, refreshKey, onStream, active }: { onPick: (t: string) => void; extra: Flag[]; setExtra: (f: (o: Flag[]) => Flag[]) => void; refreshKey: number; onStream: (open: boolean) => void; active: boolean }) {
  const { data, failed, done, retry, mode } = useApi<Flag[]>("/api/v1/flags?limit=20", 3600e3, 0, undefined, refreshKey);
  const [open, setOpen] = useState(false);

  // EventSource reconnects by itself and resends Last-Event-ID, so a dropped stream resumes without gaps.
  useEffect(() => {
    const es = new EventSource(STREAM_URL);
    es.onopen = () => { setOpen(true); onStream(true); retry(); };
    es.onerror = () => { setOpen(false); onStream(false); };
    es.addEventListener("flag", (e) => {
      const f = parseFlagEvent((e as MessageEvent).data);
      if (!f) return;
      setExtra((o) => (o.some((x) => x.id === f.id) ? o : [f, ...o].slice(0, 50)));
    });
    return () => es.close();
  }, [setExtra, retry, onStream]);

  const flags = useMemo(() => {
    const seen = new Set<number>();
    return [...extra, ...(data ?? [])].filter((f) => !seen.has(f.id) && seen.add(f.id)).sort(compareFlags);
  }, [extra, data]);

  return (
    <Panel id="flags" number={3} title="Flags" tag={open ? (mode === "mock" ? "MOCK STREAM" : "STREAMING") : done ? "RECONNECTING" : undefined} active={active} className="lg:col-start-3 lg:row-start-1">
      {!done && flags.length === 0 ? (
        <Skeleton rows={3} />
      ) : failed && !data && flags.length === 0 ? (
        <Message {...DOWN} onRetry={retry} />
      ) : flags.length === 0 ? (
        <Message title="No flags yet" body="Nothing has crossed the flag threshold. New flags appear here the moment they are raised." />
      ) : (
        <ul>
          {flags.map((f) => (
            <li key={f.id} className="border-b border-line px-2 py-1.5 last:border-b-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0">
                <button onClick={() => onPick(f.ticker)} className="inline-flex min-h-11 min-w-11 items-center font-semibold text-cyan underline lg:min-h-7">
                  {f.ticker}
                </button>
                <span className="text-white">{Math.round(f.evidence.score)}</span>
                <Verdict score={f.evidence.score} />
                <span className="ml-auto text-xs text-mute">
                  {clock(f.raisedAt)}, {age(f.raisedAt)}
                </span>
              </div>
              <p className="break-words text-xs leading-snug text-mute">
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
    </Panel>
  );
}

export function LiveView() {
  const [pick, setPick] = useState<string>();
  const [extra, setExtra] = useState<Flag[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [, tick] = useState(0);
  const [streamOpen, setStreamOpen] = useState(false);
  const [active, setActive] = useState<PanelId>();
  const [out, setOut] = useState<Out>();
  const [command, setCommand] = useState("");
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);
  const input = useRef<HTMLInputElement>(null);
  const w = useApi<Score[]>("/api/v1/watchlist", 15000, 0, undefined, refreshKey);
  const savedRaw = useSyncExternalStore(subscribeWatchlist, readWatchlist, () => null);
  const saved = useMemo(() => parseWatchlist(savedRaw), [savedRaw]);
  const symbols = useMemo(() => saved ?? (w.data ?? []).map((score) => score.ticker), [saved, w.data]);
  const quotePath = symbols.length ? `/api/v1/quotes?symbols=${[...symbols].sort().join(",")}` : "";
  const q = useApi<Quotes>(quotePath, 15000, 0, undefined, refreshKey);
  const movers = useApi<MarketMovers>("/api/v1/market-movers", 60000, 0, undefined, refreshKey);
  const lookup = useLookup();
  const paper = usePaper();

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // "/" returns to the command line from anywhere outside a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setActive(undefined), 3000);
    return () => clearTimeout(id);
  }, [active]);

  const scores = w.data;
  const top = useMemo(() => [...(scores ?? [])].filter((score) => symbols.includes(score.ticker)).sort((a, b) => b.score - a.score)[0], [scores, symbols]);
  const ticker = pick ?? top?.ticker ?? symbols[0];
  const stale = scores?.find((s) => s.ticker === ticker)?.staleSources ?? [];
  const nonce = extra.find((f) => f.ticker === ticker)?.id ?? 0;
  const quote = q.data?.quotes.find((item) => item.ticker === ticker);
  const mode = w.mode ?? q.mode ?? movers.mode;

  const tape = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(q.data?.quotes ?? []).map(({ ticker: t, price, changePct }) => ({ ticker: t, price, changePct })),
      ...(movers.data?.gainers ?? []).slice(0, 5), ...(movers.data?.losers ?? []).slice(0, 5),
    ].filter((item) => !seen.has(item.ticker) && seen.add(item.ticker));
  }, [q.data, movers.data]);

  const jump = useCallback((panel: PanelId) => {
    setActive(panel);
    const el = document.getElementById(ELEMENT[panel]);
    el?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el?.focus({ preventScroll: true });
  }, []);

  const onStream = useCallback((open: boolean) => setStreamOpen(open), []);
  const connection = !w.done ? "CONNECTING" : w.failed && !w.data ? "OFFLINE" : streamOpen ? "STREAMING" : "RECONNECTING";

  const add = (value: string) => {
    const result = addTicker(symbols, value);
    if (result.error !== undefined) return result.error;
    try { saveWatchlist(result.tickers); } catch { return "Could not save your watchlist. Allow browser storage and try again."; }
    setPick(result.ticker);
  };
  const remove = (symbol: string) => {
    try { saveWatchlist(symbols.filter((value) => value !== symbol)); } catch { return "Could not save your watchlist. Allow browser storage and try again."; }
    if (ticker === symbol) setPick(undefined);
  };

  const run = (text: string) => {
    const cmd = parseCommand(text);
    if (cmd.type === "empty") return;
    history.current = [text.trim(), ...history.current.filter((h) => h !== text.trim())].slice(0, 20);
    cursor.current = -1;
    switch (cmd.type) {
      case "panel": jump(cmd.panel); setOut({ kind: "info", text: `PANEL ${PANELS.find((p) => p.id === cmd.panel)!.number}: ${PANELS.find((p) => p.id === cmd.panel)!.title.toUpperCase()}` }); break;
      case "select":
        setPick(cmd.ticker); jump("chart");
        setOut({ kind: "info", text: symbols.includes(cmd.ticker) ? `SELECTED ${cmd.ticker}.` : `SELECTED ${cmd.ticker}. NOT ON YOUR WATCHLIST: ADD ${cmd.ticker} <GO> TO KEEP IT.` });
        break;
      case "add": {
        const message = add(cmd.ticker);
        setOut(message ? { kind: "error", text: message.toUpperCase() } : { kind: "info", text: `ADDED ${cmd.ticker} TO YOUR WATCHLIST.` });
        break;
      }
      case "remove": {
        if (!symbols.includes(cmd.ticker)) { setOut({ kind: "error", text: `${cmd.ticker} IS NOT ON YOUR WATCHLIST.` }); break; }
        const message = remove(cmd.ticker);
        setOut(message ? { kind: "error", text: message.toUpperCase() } : { kind: "info", text: `REMOVED ${cmd.ticker}.` });
        break;
      }
      case "help": setOut({ kind: "help", text: "" }); break;
      case "refresh": setRefreshKey((key) => key + 1); void paper.refresh(); setOut({ kind: "info", text: "RELOADING ALL PANELS." }); break;
      case "look": void lookup.look(cmd.ticker); jump("lookup"); setOut({ kind: "info", text: `LOOKING UP ${cmd.ticker}. THE RESULT APPEARS IN PANEL 7.` }); break;
      case "trade":
        jump("paper");
        setOut({ kind: "info", text: `SENDING SIMULATED ${cmd.side} ${cmd.qty} ${cmd.ticker}...` });
        void paper.trade(cmd.side, cmd.ticker, cmd.qty).then((r) => setOut({ kind: r.ok ? "info" : "error", text: r.text }));
        break;
      case "reset":
        jump("paper");
        if (!cmd.confirmed) { paper.askReset(); setOut({ kind: "info", text: "RESET CLEARS ALL POSITIONS AND HISTORY. TYPE PT RESET CONFIRM, OR PRESS CONFIRM IN PANEL 8." }); }
        else void paper.reset().then((r) => setOut({ kind: r.ok ? "info" : "error", text: r.text }));
        break;
      case "error": setOut({ kind: "error", text: cmd.message }); break;
    }
    setCommand("");
  };

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="sticky top-0 z-30 border-b border-accent bg-bg lg:static">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1 lg:h-12 lg:flex-nowrap lg:py-0">
          <Link href="/" className="inline-flex min-h-11 shrink-0 items-center font-display text-3xl font-black uppercase leading-none tracking-wide text-accent">
            Pumpwatch
          </Link>
          <form role="search" aria-label="Command line" className="flex min-w-0 flex-1 basis-64 items-center gap-2" onSubmit={(event) => { event.preventDefault(); run(command); }}>
            <label htmlFor="command" className="sr-only">Command line. Type a ticker or a command, then press Enter. Type HELP for the list.</label>
            <span aria-hidden className="shrink-0 font-bold text-accent">PW&gt;</span>
            <input
              ref={input}
              id="command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") { setCommand(""); setOut((o) => (o?.kind === "help" ? undefined : o)); }
                else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  const next = Math.min(history.current.length - 1, Math.max(-1, cursor.current + (event.key === "ArrowUp" ? 1 : -1)));
                  cursor.current = next;
                  setCommand(next < 0 ? "" : history.current[next]);
                }
              }}
              placeholder="TICKER OR COMMAND"
              maxLength={330}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="h-11 min-w-0 flex-1 border-0 border-b border-yellow bg-bg px-1 text-base uppercase text-yellow placeholder:text-mute lg:h-9 lg:text-sm"
            />
            <button type="submit" className="inline-flex h-11 shrink-0 items-center bg-yellow px-3 text-xs font-bold text-bg lg:h-9">&lt;GO&gt;</button>
          </form>
          <p className="hidden shrink-0 text-xs text-mute xl:block">Press <kbd className="text-yellow">/</kbd> to type a command</p>
        </div>
        <div aria-live="polite" className={`border-t border-line px-3 text-xs ${out?.kind === "help" ? "py-2" : "py-1"}`}>
          {out?.kind === "help" ? (
            <div className="flex items-start justify-between gap-3">
              <dl className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[17rem_1fr]">
                {HELP.map(([k, v]) => <div key={k} className="contents"><dt className="font-semibold text-yellow">{k}</dt><dd className="text-white">{v}</dd></div>)}
              </dl>
              <button type="button" onClick={() => setOut(undefined)} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-accent hover:bg-accent hover:text-bg" aria-label="Close help">ESC</button>
            </div>
          ) : out?.kind === "error" ? (
            <p role="alert" className="font-semibold text-yellow">ERR: {out.text}</p>
          ) : (
            <p className="text-white"><span className="text-accent">OK</span> {out ? out.text : "TYPE A TICKER OR COMMAND, THEN ENTER. HELP <GO> LISTS COMMANDS."}</p>
          )}
        </div>
      </header>

      <Tape items={tape} mode={mode} failed={(q.failed && !q.data) || (movers.failed && !movers.data)} />

      <nav aria-label="Panel commands" className="flex overflow-x-auto border-b border-line bg-bg text-xs [scrollbar-width:none]">
        {PANELS.map((p) => (
          <button key={p.id} type="button" onClick={() => jump(p.id)} title={`${p.title}: type ${p.mnemonic} or ${p.number}`} className="flex min-h-11 shrink-0 items-center gap-1.5 border-r border-line px-3 uppercase text-accent hover:bg-accent hover:text-bg lg:min-h-9">
            <span className="font-semibold text-yellow [button:hover_&]:text-bg">{p.number}</span>{p.mnemonic}
          </button>
        ))}
        <button type="button" onClick={() => setOut({ kind: "help", text: "" })} className="flex min-h-11 shrink-0 items-center gap-1.5 border-r border-line px-3 uppercase text-accent hover:bg-accent hover:text-bg lg:min-h-9"><span className="font-semibold text-yellow [button:hover_&]:text-bg">?</span>HELP</button>
        <button type="button" onClick={() => setRefreshKey((key) => key + 1)} title="Reload watchlist, quotes, selected chart, flags, news, movers and sentiment" className="ml-auto flex min-h-11 shrink-0 items-center gap-1.5 px-3 uppercase text-accent hover:bg-accent hover:text-bg lg:min-h-9"><span className="font-semibold text-yellow [button:hover_&]:text-bg">RF</span>Refresh all</button>
      </nav>

      <main className="grid flex-1 gap-px bg-line p-px lg:min-h-0 lg:grid-cols-[3fr_5fr_4fr] lg:grid-rows-[repeat(3,minmax(0,1fr))]">
        <Watchlist w={w} q={q} ticker={ticker} onPick={(t) => { setPick(t); }} symbols={symbols} onAdd={add} onRemove={remove} active={active === "watchlist"} />
        {ticker ? (
          <ChartPanel key={ticker} ticker={ticker} nonce={nonce} stale={stale} refreshKey={refreshKey} quote={quote} active={active === "chart"} />
        ) : (
          <Panel id="score-chart" number={2} title="Score chart" active={active === "chart"} className="lg:col-start-2 lg:row-start-1">
            <Message title="No ticker selected" body="Add a stock to your watchlist or select a market mover." />
          </Panel>
        )}
        <FlagFeed onPick={(t) => { setPick(t); }} extra={extra} setExtra={setExtra} refreshKey={refreshKey} onStream={onStream} active={active === "flags"} />
        <div className="contents">
          <div className="min-h-0 lg:col-start-2 lg:row-start-2 [&>section]:h-full">
            <NewsPanel key={ticker ?? "market"} ticker={ticker} refreshKey={refreshKey} active={active === "news"} />
          </div>
          {ticker ? (
            <div className="min-h-0 lg:col-start-2 lg:row-start-3 [&>section]:h-full">
              <SentimentPanel key={ticker} ticker={ticker} refreshKey={refreshKey} active={active === "sentiment"} />
            </div>
          ) : null}
          <div className="min-h-0 lg:col-start-1 lg:row-start-3 [&>section]:h-full">
            <MoversPanel state={movers} selectedTicker={ticker} active={active === "movers"} onPick={(symbol) => { setPick(symbol); }} />
          </div>
          <div className="min-h-0 lg:col-start-3 lg:row-start-2 [&>section]:h-full">
            <LookupPanel state={lookup.state} onRetry={(t) => void lookup.look(t)} active={active === "lookup"} />
          </div>
          <div className="min-h-0 lg:col-start-3 lg:row-start-3 [&>section]:h-full">
            <PaperPanel paper={paper} onConfirmReset={() => void paper.reset().then((r) => setOut({ kind: r.ok ? "info" : "error", text: r.text }))} active={active === "paper"} />
          </div>
        </div>
      </main>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-0.5 border-t border-accent px-3 py-1 text-xs">
        <span className="text-accent">DATA <strong className={mode === "mock" ? "bg-accent px-1 text-bg" : "text-white"}>{mode ? mode.toUpperCase() : "--"}</strong></span>
        <span className="text-accent">TIME <Clock /></span>
        <span className="text-accent">LINK <strong className={connection === "STREAMING" ? "text-cyan" : "text-yellow"}>{connection}</strong></span>
        <span className="text-accent">WL <span className="text-white">{symbols.length}</span></span>
        <span className="min-w-0 text-mute lg:ml-auto">{w.notice ?? NOTICE}</span>
      </footer>
    </div>
  );
}
