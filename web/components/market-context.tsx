"use client";

import { useState, type ReactNode } from "react";
import { age, type MarketMovers, type Sentiment, type StockNews } from "@/lib/api";
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

function SentimentResults({ ticker, refreshKey, sample, controls, active }: { ticker: string; refreshKey: number; sample: string; controls: ReactNode; active?: boolean }) {
  const state = useApi<Sentiment>(`/api/v1/tickers/${ticker}/sentiment?sample=${sample}`, sample === "stream" ? 15000 : 60000, 0, undefined, refreshKey);
  return <Panel id="stock-sentiment" number={5} title={`${ticker} sentiment`} tag={modeTag(state.mode)} active={active}>
    {controls}
    <Body state={state}>{(data) => <div className="space-y-2 p-3 text-xs">
      <p className="text-xs text-mute">{data.modelName ?? "FinTwitBERT"}, local financial-post sentiment. CardiffNLP checks possible irony separately. Bluesky posts.</p>
      {!data.enabled ? <p>{state.mode === "mock" ? "Mock demo: no Bluesky posts are collected or analyzed." : "Live Bluesky sentiment collection is switched off. No posts have been analyzed."}</p> : data.modelStatus === "loading" ? <p role="status">Loading the sentiment model. The first run downloads its weights.</p>
        : data.modelStatus === "error" ? <p role="alert">The sentiment model is unavailable. No sentiment has been estimated.</p>
        : <>
          <p className="text-xs text-mute">{data.sample ? `${data.sample.sort === "top" ? "Top-ranked" : "Most recent"} matching posts, last 24 hours, checked ${time(data.asOf)}` : `${data.streamConnected ? "Bluesky connected" : "Bluesky reconnecting"}, last ${data.windowMinutes} minutes`}</p>
          {data.sample && <p className="text-xs text-mute">Classified {data.total} matching posts from {data.sample.examined} search results. Up to 25 posts per sample.</p>}
          {data.total === 0 ? <p>{data.sample ? `No matching stock posts found for ${ticker} in this search sample.` : `No classified posts for ${ticker} in this window. Newly selected stocks collect posts from this point forward.`}</p> : <dl className="grid grid-cols-3 gap-2">
            {([["Positive", data.positive, "text-white"], ["Neutral", data.neutral, "text-white"], ["Negative", data.negative, "text-white"]] as const).map(([label, count, tone]) => <div key={label} className="border border-line p-2"><dt className="text-xs text-accent">{label}</dt><dd className={`text-xl ${tone}`}>{count}</dd></div>)}
          </dl>}
          {data.lastPostAt && <p className="text-xs text-mute">Last classified post {age(data.lastPostAt)}.</p>}
          {data.irony !== undefined && <p className="text-xs text-mute">Possible irony: {data.irony} of {data.total} posts. This detector can produce false flags; tone labels have not been reversed.</p>}
          {data.sample && <a href={`https://bsky.app/search?q=${encodeURIComponent(`$${ticker}`)}&sort=${data.sample.sort}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-cyan underline underline-offset-4 lg:min-h-0">View search on Bluesky</a>}
        </>}
      <p className="border-t border-line pt-2 text-xs leading-relaxed text-mute">This model classifies financial-language tone. Risk scores use rules-v1. The pump-detection LightGBM model remains an offline training pipeline.</p>
      <p className="text-xs leading-relaxed text-mute">Sarcasm, slang and mixed or quoted claims can be misread. A post mentioning several stocks gets one tone label, which may not describe each stock.</p>
      {data.dropped > 0 && <p className="text-xs text-mute">{data.dropped} posts skipped during processing limits.</p>}
    </div>}</Body>
  </Panel>;
}
