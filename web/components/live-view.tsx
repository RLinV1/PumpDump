"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useApi } from "@/lib/use-api";
import { sentimentSummary } from "@/lib/sentiment-summary";
import { LiveChart } from "@/components/live-chart";
import { MoversPanel, NewsPanel, SentimentPanel } from "@/components/market-context";
import { useAssistant } from "@/components/assistant-panel";
import { AssistantWidget } from "@/components/assistant-widget";
import { AppTabs } from "@/components/app-tabs";
import { LookupPanel, useLookup, usePaper } from "@/components/trade-panels";
import { Message, Panel, Skeleton, Stale, Verdict, dirTone, modeTag, money, signed } from "@/components/term-panel";
import { NOTICE, STREAM_URL, age, clock, compareFlags, parseFlagEvent, type Flag, type MarketMovers, type Quote, type Quotes, type Score, type Sentiment, type Timeline } from "@/lib/api";
import { PANELS, parseCommand, type Panel as PanelId } from "@/lib/commands";
import { btnGhost } from "@/lib/ui";
import { verdictOf } from "@/lib/verdict";
import { GROUP_TITLE, paletteItems, type PaletteItem } from "@/lib/palette";
import { addTicker, parseWatchlist, readWatchlist, saveWatchlist, subscribeWatchlist } from "@/lib/watchlist";
import { WorkspaceToolbar } from "@/components/workspace-toolbar";
import { parseWorkspace, readWorkspace, revealPanel, saveWorkspace, subscribeWorkspace, type Workspace } from "@/lib/workspace";

const DOWN = { title: "Risk data unavailable", body: "The latest data could not be loaded. Retry, or use the simulated detector while the feed recovers." };
const ELEMENT: Record<PanelId, string> = { watchlist: "watchlist", chart: "score-chart", flags: "flags", news: "stock-news", sentiment: "stock-sentiment", movers: "market-movers", lookup: "lookup" };
const HELP: [string, string][] = [
  ["GME <GO>", "Select a ticker (1 to 5 letters). Chart, news and sentiment follow it."],
  ["WL  GR  FLAG  NEWS  SENT  MOV  LOOK", "Jump to a panel. The panel numbers 1 to 7 work too."],
  ["ASK Is GME being pumped?", "Ask the research assistant in the chat at the bottom right. Read-only tools, cited sources, not investment advice. Says whether Gemini or the mock agent answered. ASK alone opens the chat."],
  ["PT", "Open the Paper tab: your simulated account and order form."],
  ["MODE", "Say whether the data is mock or live."],
  ["LOOK GME  /  DES GME", "Stock lookup (panel 7): snapshot, performance, indicators, beta and volatility."],
  ["BUY GME 10  /  SELL GME 10", "Simulated paper order, from here or the Paper tab. Whole shares, filled at the server's price. No broker, no real money."],
  ["PT RESET", "Reset the paper account. It asks you to confirm with PT RESET CONFIRM."],
  ["ADD AMC  /  RM AMC", "Add a stock to your browser-saved watchlist, or remove it."],
  ["SEL FLAG", "Select a ticker that shares its name with a command."],
  ["RF", "Reload every panel."],
  ["/", "Return to the command line. Type to search tickers and commands; Up and Down pick, Enter runs, Esc clears. With nothing typed, Up and Down recall earlier commands."],
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

// The sentiment model's read of the selected ticker, shown beside the verdict as context. It is not an input to the score.
function SentimentBeside({ ticker, refreshKey }: { ticker: string; refreshKey: number }) {
  const { data, done, failed } = useApi<Sentiment>(`/api/v1/tickers/${ticker}/sentiment?sample=top`, 60000, 0, undefined, refreshKey);
  const body = sentimentSummary(data, done, failed);
  return <p className="mb-2 text-xs text-mute" data-testid="sentiment-beside"><span className="text-accent">SENTIMENT</span> <span className="text-white">{body}</span> FinTwitBERT, with a separate possible-irony check. Context only: not part of the score and not shown to predict pumps.</p>;
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
            <SentimentBeside ticker={ticker} refreshKey={refreshKey} />
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
  const workspaceRaw = useSyncExternalStore(subscribeWorkspace, readWorkspace, () => null);
  const [sessionWorkspace, setSessionWorkspace] = useState<Workspace>();
  const [workspaceError, setWorkspaceError] = useState<string>();
  const workspace = useMemo(() => sessionWorkspace ?? parseWorkspace(workspaceRaw), [sessionWorkspace, workspaceRaw]);
  const changeWorkspace = useCallback((value: Workspace) => {
    try {
      saveWorkspace(value);
      setSessionWorkspace(undefined);
      setWorkspaceError(undefined);
    } catch {
      setSessionWorkspace(value);
      setWorkspaceError("Browser storage is unavailable. Your layout works for this session; allow storage to keep it after reload.");
    }
  }, []);
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
  const assistant = useAssistant();
  const router = useRouter();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(-1);

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

  const known = useMemo(() => {
    const seen = new Set<string>();
    const badge = (t: string) => { const sc = scores?.find((x) => x.ticker === t); return sc ? `${Math.round(sc.score)} ${verdictOf(sc.score).label}` : undefined; };
    return [...symbols, ...(scores ?? []).map((x) => x.ticker), ...tape.map((x) => x.ticker)]
      .filter((t) => !seen.has(t) && seen.add(t)).map((t) => ({ ticker: t, onList: symbols.includes(t), badge: badge(t) }));
  }, [symbols, scores, tape]);
  const items = useMemo(() => paletteItems(command, known), [command, known]);
  const listOpen = focused && items.length > 0;
  // A line that is not a command picks its best match, so Enter does something useful; a real command still runs as typed.
  const sel = listOpen ? (highlight >= 0 ? Math.min(highlight, items.length - 1) : parseCommand(command).type === "error" ? 0 : -1) : -1;

  const jump = useCallback((panel: PanelId) => {
    setActive(panel);
    const next = revealPanel(workspace, panel);
    if (next !== workspace) changeWorkspace(next);
    requestAnimationFrame(() => {
      const el = document.getElementById(ELEMENT[panel]);
      el?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      el?.focus({ preventScroll: true });
    });
  }, [workspace, changeWorkspace]);

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
      case "ask": void assistant.ask(cmd.question); setAssistantOpen(true); setOut({ kind: "info", text: "ASKING THE ASSISTANT. THE ANSWER APPEARS IN THE CHAT AT THE BOTTOM RIGHT." }); break;
      case "assistant": setAssistantOpen(true); setOut({ kind: "info", text: "ASSISTANT OPEN AT THE BOTTOM RIGHT." }); break;
      case "paper": setOut({ kind: "info", text: "OPENING THE PAPER TAB." }); router.push("/paper"); break;
      case "mode": setOut({ kind: "info", text: mode ? `DATA MODE: ${mode.toUpperCase()}. ${mode === "mock" ? "FIGURES ARE INVENTED FOR DEMONSTRATION." : "FIGURES COME FROM THE LIVE FEED."}` : "DATA MODE NOT KNOWN YET: STILL CONNECTING." }); break;
      case "look": void lookup.look(cmd.ticker); jump("lookup"); setOut({ kind: "info", text: `LOOKING UP ${cmd.ticker}. THE RESULT APPEARS IN PANEL 7.` }); break;
      case "trade":
        setOut({ kind: "info", text: `SENDING SIMULATED ${cmd.side} ${cmd.qty} ${cmd.ticker}...` });
        void paper.trade(cmd.side, cmd.ticker, cmd.qty).then((r) => setOut({ kind: r.ok ? "info" : "error", text: r.text }));
        break;
      case "reset":
        if (!cmd.confirmed) setOut({ kind: "info", text: "RESET CLEARS ALL POSITIONS AND HISTORY. TYPE PT RESET CONFIRM, OR USE THE PAPER TAB." });
        else void paper.reset().then((r) => setOut({ kind: r.ok ? "info" : "error", text: r.text }));
        break;
      case "error": setOut({ kind: "error", text: cmd.message }); break;
    }
    setCommand("");
    setHighlight(-1);
  };
  const choose = (item: PaletteItem) => { run(item.run); input.current?.focus(); };

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="sticky top-0 z-30 border-b border-accent bg-bg lg:static">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1 lg:h-12 lg:flex-nowrap lg:py-0">
          <Link href="/" className="inline-flex min-h-11 shrink-0 items-center font-display text-3xl font-black uppercase leading-none tracking-wide text-accent">
            Pumpwatch
          </Link>
          <AppTabs current="/live" />
          <form role="search" aria-label="Command line" className="relative flex min-w-0 flex-1 basis-64 items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (sel >= 0) choose(items[sel]); else run(command); }}>
            <label htmlFor="command" className="sr-only">Command line. Type a ticker or a command, then press Enter. Type HELP for the list.</label>
            <span aria-hidden className="shrink-0 font-bold text-accent">PW&gt;</span>
            <input
              ref={input}
              id="command"
              value={command}
              role="combobox"
              aria-expanded={listOpen}
              aria-controls="palette-list"
              aria-autocomplete="list"
              aria-activedescendant={sel >= 0 ? `palette-${items[sel].id}` : undefined}
              onChange={(event) => { setCommand(event.target.value); setHighlight(-1); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape") { setCommand(""); setHighlight(-1); setOut((o) => (o?.kind === "help" ? undefined : o)); }
                else if (listOpen && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                  event.preventDefault();
                  const step = event.key === "ArrowDown" ? 1 : -1;
                  setHighlight(sel < 0 ? (step > 0 ? 0 : items.length - 1) : (sel + step + items.length) % items.length);
                }
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
            {listOpen && (
              <div className="absolute inset-x-0 top-full z-40 mt-px max-h-[60dvh] overflow-y-auto border border-line-strong bg-bg text-xs">
                <ul id="palette-list" role="listbox" aria-label="Matching tickers and commands">
                  {(["tickers", "commands", "ask"] as const).map((group) => {
                    const rows = items.filter((i) => i.group === group);
                    return rows.length === 0 ? null : (
                      <li key={group} role="presentation">
                        <p id={`palette-${group}`} className="bar px-2 py-0.5 font-semibold uppercase">{GROUP_TITLE[group]}</p>
                        <ul role="group" aria-labelledby={`palette-${group}`}>
                          {rows.map((item) => {
                            const at = items.indexOf(item), on = at === sel;
                            return (
                              <li
                                key={item.id}
                                id={`palette-${item.id}`}
                                role="option"
                                aria-selected={on}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseMove={() => at !== sel && setHighlight(at)}
                                onClick={() => choose(item)}
                                className={`flex min-h-11 cursor-pointer items-baseline gap-2 px-2 py-2 lg:min-h-8 lg:py-1 ${on ? "bg-accent text-bg" : "text-white"}`}
                              >
                                <span className="min-w-0 truncate">{[...item.label].map((ch, i) => item.indexes.includes(i) ? <b key={i} className={on ? "underline" : "text-yellow"}>{ch}</b> : ch)}</span>
                                {item.badge && <span className={`shrink-0 border px-1 ${on ? "border-bg" : "border-yellow text-yellow"}`}>{item.badge}</span>}
                                {item.detail && <span className={`ml-auto shrink-0 ${on ? "text-bg" : "text-mute"}`}>{item.detail}</span>}
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
                <p className="border-t border-line px-2 py-1 text-mute"><kbd className="text-yellow">Up</kbd> <kbd className="text-yellow">Down</kbd> pick, <kbd className="text-yellow">Enter</kbd> run, <kbd className="text-yellow">Esc</kbd> clear, <kbd className="text-yellow">/</kbd> focus</p>
              </div>
            )}
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

      <WorkspaceToolbar workspace={workspace} onChange={changeWorkspace} error={workspaceError} />

      <main aria-label={`${workspace.name} workspace`} className={`workspace-grid grid flex-1 auto-rows-[minmax(300px,1fr)] gap-px overflow-y-auto bg-line p-px lg:min-h-0 ${workspace.panels.length === 1 ? "lg:grid-cols-1" : workspace.panels.length === 2 || workspace.panels.length === 4 ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        {[...workspace.panels, ...PANELS.map((p) => p.id).filter((id) => !workspace.panels.includes(id))].map((id) => (
          <div key={id} hidden={!workspace.panels.includes(id)} className="min-h-0 [&>section]:h-full">
            {id === "watchlist" && <Watchlist w={w} q={q} ticker={ticker} onPick={setPick} symbols={symbols} onAdd={add} onRemove={remove} active={active === id} />}
            {id === "chart" && (ticker ? (
              <ChartPanel key={ticker} ticker={ticker} nonce={nonce} stale={stale} refreshKey={refreshKey} quote={quote} active={active === id} />
            ) : (
              <Panel id="score-chart" number={2} title="Score chart" active={active === id}>
                <Message title="No ticker selected" body="Add a stock to your watchlist or select a market mover." />
              </Panel>
            ))}
            {id === "flags" && <FlagFeed onPick={setPick} extra={extra} setExtra={setExtra} refreshKey={refreshKey} onStream={onStream} active={active === id} />}
            {id === "news" && <NewsPanel key={ticker ?? "market"} ticker={ticker} refreshKey={refreshKey} active={active === id} />}
            {id === "sentiment" && (ticker ? <SentimentPanel key={ticker} ticker={ticker} refreshKey={refreshKey} active={active === id} /> : (
              <Panel id="stock-sentiment" number={5} title="Sentiment" active={active === id}>
                <Message title="No ticker selected" body="Select a stock to view sentiment collection status." />
              </Panel>
            ))}
            {id === "movers" && <MoversPanel state={movers} selectedTicker={ticker} active={active === id} onPick={setPick} />}
            {id === "lookup" && <LookupPanel state={lookup.state} onRetry={(t) => void lookup.look(t)} active={active === id} />}
          </div>
        ))}
      </main>

      <AssistantWidget open={assistantOpen} onOpenChange={setAssistantOpen} state={assistant.state} onAsk={(question) => void assistant.ask(question)} ticker={ticker} />

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-0.5 border-t border-accent px-3 py-1 pb-16 text-xs sm:pb-1 lg:min-h-10 lg:pr-24">
        <span className="text-accent">DATA <strong className={mode === "mock" ? "bg-accent px-1 text-bg" : "text-white"}>{mode ? mode.toUpperCase() : "--"}</strong></span>
        <span className="text-accent">TIME <Clock /></span>
        <span className="text-accent">LINK <strong className={connection === "STREAMING" ? "text-cyan" : "text-yellow"}>{connection}</strong></span>
        <span className="text-accent">WL <span className="text-white">{symbols.length}</span></span>
        <span className="min-w-0 text-mute lg:ml-auto">{w.notice ?? NOTICE}</span>
      </footer>
    </div>
  );
}
