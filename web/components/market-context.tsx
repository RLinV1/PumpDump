"use client";

import { useState, type ReactNode } from "react";
import { age, type MarketMovers, type Sentiment, type StockNews, type Tone } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { btnGhost } from "@/lib/ui";
import { Panel, Skeleton, dirTone, modeTag, money, signed } from "@/components/term-panel";

type State<T> = ReturnType<typeof useApi<T>>;

// Loading, unavailable and stale states shared by the data panels.
function Body<T>({ state, children }: { state: State<T>; children: (data: T) => ReactNode }) {
  if (!state.done) return <Skeleton rows={3} />;
  if (!state.data) {
    return (
      <div className="space-y-2 p-3 text-xs" role="alert">
        <p className="font-semibold text-accent">Data is temporarily unavailable.</p>
        <button className={btnGhost} onClick={state.retry}>Retry</button>
      </div>
    );
  }
  return (
    <>
      {state.failed && <p className="px-3 pt-2 text-xs text-yellow" role="status">Could not refresh. Showing the last data received.</p>}
      {children(state.data)}
    </>
  );
}

const time = (iso: string) => `${new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`;

const GROUPS = [
  { key: "gainers", label: "Gain" },
  { key: "losers", label: "Lose" },
  { key: "ranges", label: "Swing" },
] as const;

export function MoversPanel({ state, onPick, selectedTicker, active }: { state: State<MarketMovers>; onPick: (ticker: string) => void; selectedTicker?: string; active?: boolean }) {
  const [group, setGroup] = useState<(typeof GROUPS)[number]["key"]>("gainers");
  return (
    <Panel id="market-movers" number={6} title="Market movers" tag={modeTag(state.mode)} active={active}>
      <Body state={state}>{(data) => {
        const rows = data[group];
        const swing = group === "ranges";
        return <div className="text-xs">
          <div role="group" aria-label="Mover list" className="flex border-b border-line">
            {GROUPS.map((g) => <button key={g.key} type="button" aria-pressed={group === g.key} onClick={() => setGroup(g.key)}
              className={`min-h-11 flex-1 px-2 font-semibold uppercase lg:min-h-8 ${group === g.key ? "bg-accent text-bg" : "text-accent hover:bg-line"}`}>{g.label}</button>)}
          </div>
          <p className="px-3 py-2 text-xs text-mute">
            {swing ? `${data.feed.toUpperCase()} high-low range / previous close, across ${data.rangeUniverseSize} screened stocks.` : `Latest session, ${time(data.asOf)}. Source: Alpaca ${data.feed === "mock" ? "(mock)" : "screener"}.`}
          </p>
          {rows.length === 0 ? <p className="px-3 pb-3 text-mute">No session data available yet.</p> : <table className="w-full text-left">
            <caption className="sr-only">{GROUPS.find((g) => g.key === group)?.label} movers</caption>
            <thead className="text-accent"><tr><th scope="col" className="px-3 py-1 font-normal">TICKER</th><th scope="col" className="text-right font-normal">LAST</th><th scope="col" className="px-3 text-right font-normal">{swing ? "RANGE" : "CHG%"}</th></tr></thead>
            <tbody>{rows.slice(0, 8).map((row) => <tr key={row.ticker} className="border-t border-line">
              <th scope="row" className="font-normal"><button onClick={() => onPick(row.ticker)} aria-pressed={row.ticker === selectedTicker} className={`inline-flex min-h-11 min-w-11 items-center px-3 font-semibold lg:min-h-7 ${row.ticker === selectedTicker ? "bg-accent text-bg" : "text-cyan underline"}`} title={`View ${row.ticker} sentiment, news and available score history`}>{row.ticker}</button></th>
              <td className="text-right text-white">{money(row.price)}</td>
              <td className={`px-3 text-right ${swing ? "text-white" : dirTone(row.changePct)}`}>{"rangePct" in row && swing ? `${Number(row.rangePct).toFixed(2)}%` : signed(row.changePct)}</td>
            </tr>)}</tbody>
          </table>}
        </div>;
      }}</Body>
    </Panel>
  );
}

export function NewsPanel({ ticker, refreshKey, active }: { ticker?: string; refreshKey: number; active?: boolean }) {
  const [scope, setScope] = useState<"ticker" | "market">("ticker");
  const market = scope === "market" || !ticker;
  const state = useApi<StockNews>(market ? "/api/v1/news" : `/api/v1/tickers/${ticker}/news`, 60000, 0, undefined, refreshKey);
  return (
    <Panel id="stock-news" number={4} title={market ? "Market news" : `${ticker} news`} tag={modeTag(state.mode)} active={active}>
      <div role="group" aria-label="News scope" className="flex border-b border-line text-xs">
        {([["ticker", ticker ?? "Stock"], ["market", "Market"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={market ? key === "market" : key === "ticker"} disabled={key === "ticker" && !ticker} onClick={() => setScope(key)}
          className={`min-h-11 flex-1 px-2 font-semibold uppercase disabled:opacity-40 lg:min-h-8 ${(market ? key === "market" : key === "ticker") ? "bg-accent text-bg" : "text-accent hover:bg-line"}`}>{label}</button>)}
      </div>
      <Body state={state}>{(data) => <>
        <p className="px-3 py-2 text-xs text-mute">Last 24 hours, Alpaca news, checked {time(data.asOf)}</p>
        {data.sentimentModel && <p className="px-3 pb-2 text-xs text-mute">Headline tone: {data.sentimentModel}.{data.sentimentStatus !== "ready" ? " Headline sentiment is temporarily unavailable." : " Text context only, not a price forecast."}</p>}
        {data.items.length === 0 ? <p className="px-3 pb-3 text-xs text-mute">No recent headlines{!market && ticker ? ` for ${ticker}` : ""}.</p> : <ul>
          {data.items.map((item) => <li key={item.id} className="border-t border-line px-3 py-1.5">
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs leading-snug text-cyan underline underline-offset-4 lg:min-h-0 lg:py-0.5">{item.title}</a>
            <p className="text-xs text-mute">{item.source}, <time dateTime={item.publishedAt} title={time(item.publishedAt)}>{age(item.publishedAt)}</time></p>
            {item.sentiment && <p className="text-xs text-mute">Headline tone: <span className="text-white">{item.sentiment}</span></p>}
          </li>)}
        </ul>}
      </>}</Body>
    </Panel>
  );
}

export function SentimentPanel({ ticker, refreshKey, active }: { ticker: string; refreshKey: number; active?: boolean }) {
  const [sample, setSample] = useState("top");
  return <SentimentResults key={sample} ticker={ticker} refreshKey={refreshKey} sample={sample} active={active} controls={<div className="border-b border-line p-2">
    <label htmlFor="sentiment-sample" className="mb-1 block text-xs text-accent">Posts to analyze</label>
    <select id="sentiment-sample" value={sample} onChange={(event) => setSample(event.target.value)} className="h-11 w-full min-w-0 border border-line-strong bg-bg px-2 text-base text-white lg:h-8 lg:text-xs">
      <option value="top">Top posts, last 24 hours</option>
      <option value="latest">Most recent, last 24 hours</option>
      <option value="stream">Live stream, last 60 minutes</option>
    </select>
  </div>} />;
}

const TONES = [["positive", "Positive"], ["neutral", "Neutral"], ["negative", "Negative"]] as const;

// Small thumb icons in currentColor: up, flat (neutral) and down.
function Thumb({ tone }: { tone: Tone }) {
  const d = tone === "positive" ? "M5 21H2V10h3zM8 10l4-8c1.5 0 2.5 1 2.5 2.5V8H21l-2 11c-.2 1.2-1 2-2.2 2H8z"
    : tone === "negative" ? "M5 3H2v11h3zM8 14l4 8c1.5 0 2.5-1 2.5-2.5V16H21l-2-11c-.2-1.2-1-2-2.2-2H8z" : "M4 12h16";
  return <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false" className="shrink-0" fill={tone === "neutral" ? "none" : "currentColor"} stroke="currentColor" strokeWidth={tone === "neutral" ? 3 : 0}><path d={d} /></svg>;
}

function SentimentResults({ ticker, refreshKey, sample, controls, active }: { ticker: string; refreshKey: number; sample: string; controls: ReactNode; active?: boolean }) {
  const state = useApi<Sentiment>(`/api/v1/tickers/${ticker}/sentiment?sample=${sample}`, sample === "stream" ? 15000 : 60000, 0, undefined, refreshKey);
  const [filter, setFilter] = useState<Tone | null>(null);
  return <Panel id="stock-sentiment" number={5} title={`${ticker} sentiment`} tag={modeTag(state.mode)} active={active}>
    {controls}
    <Body state={state}>{(data) => {
      const posts = (data.posts ?? []).filter((p) => !filter || p.label === filter);
      const meta = [data.sample ? `${data.total} of ${data.sample.examined} posts` : `${data.total} posts`,
        data.sample ? `${data.sample.sort} · 24h` : `${data.streamConnected ? "connected" : "reconnecting"} · ${data.windowMinutes}m`,
        data.lastPostAt && `last ${age(data.lastPostAt)}`, data.irony ? `${data.irony} possible irony` : null].filter(Boolean).join(" · ");
      return <div className="space-y-2 p-3 text-xs">
        {!data.enabled ? <p>{state.mode === "mock" ? "Mock demo: no Bluesky posts are collected or analyzed." : "Live Bluesky sentiment collection is switched off. No posts have been analyzed."}</p> : data.modelStatus === "loading" ? <p role="status">Loading the sentiment model. The first run downloads its weights.</p>
          : data.modelStatus === "error" ? <p role="alert">The sentiment model is unavailable. No sentiment has been estimated.</p>
          : <>
            {data.total === 0 ? <p>{data.sample ? `No matching stock posts found for ${ticker} in this search sample.` : `No classified posts for ${ticker} in this window. Newly selected stocks collect posts from this point forward.`}</p> : <>
              <div role="group" aria-label="Filter posts by tone" className="grid grid-cols-3 gap-2">
                {TONES.map(([key, label]) => {
                  const inner = <dl><dt className="flex items-center gap-1 text-xs text-accent"><Thumb tone={key} />{label}</dt><dd className="text-xl text-white">{data[key]}</dd></dl>;
                  return data.posts ? <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(filter === key ? null : key)}
                    className={`min-h-11 border p-2 text-left lg:min-h-0 ${filter === key ? "border-accent bg-line" : "border-line hover:bg-line"}`}>{inner}</button>
                    : <div key={key} className="border border-line p-2">{inner}</div>;
                })}
              </div>
              <p className="text-xs text-mute">{meta}</p>
            </>}
            {data.posts && data.total > 0 && (posts.length === 0 ? <p>{filter ? `No ${filter} posts in this sample.` : null}</p> : <ul>
              {posts.map((p) => <li key={p.url} className="border-t border-line py-1.5">
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-mute">
                  <span className="inline-flex items-center gap-1 border border-accent px-1 uppercase text-accent"><Thumb tone={p.label} />{p.label}</span>
                  {p.irony && <span className="border border-line px-1 text-mute">irony?</span>}
                  <time dateTime={p.createdAt}>{age(p.createdAt)}</time>
                </p>
                <p className="py-0.5 leading-snug text-white">{p.text}</p>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-cyan underline underline-offset-4 lg:min-h-0">open</a>
              </li>)}
            </ul>)}
            {data.sample && <a href={`https://bsky.app/search?q=${encodeURIComponent(`$${ticker}`)}&sort=${data.sample.sort}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-cyan underline underline-offset-4 lg:min-h-0">View search on Bluesky</a>}
          </>}
        <details className="border-t border-line pt-2 text-mute">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-accent lg:min-h-0">About this model</summary>
          <p className="leading-relaxed">{data.modelName ?? "FinTwitBERT"} labels financial-post tone locally; CardiffNLP flags possible irony separately. Sarcasm, slang and multi-stock posts can be misread, and tone is not a price forecast. Risk scores use rules-v1.</p>
        </details>
        {data.dropped > 0 && <p className="text-xs text-mute">{data.dropped} posts skipped during processing limits.</p>}
      </div>;
    }}</Body>
  </Panel>;
}
