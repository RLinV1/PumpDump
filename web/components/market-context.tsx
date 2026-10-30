"use client";

import { useState, type ReactNode } from "react";
import { age, type MarketMovers, type Sentiment, type StockNews } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { btnGhost } from "@/lib/ui";

function Panel<T>({ title, id, state, controls, children }: { title: string; id?: string; state: ReturnType<typeof useApi<T>>; controls?: ReactNode; children: (data: T) => ReactNode }) {
  return <section id={id} className="min-w-0 scroll-mt-40 border border-line bg-surface">
    <header className="flex min-h-9 items-center justify-between gap-3 border-b border-line px-3 py-2 text-sm">
      <h2 className="font-medium">{title}</h2><span className="font-mono text-[11px] uppercase text-mute">{state.mode}</span>
    </header>
    {controls && <div className="border-b border-line p-3">{controls}</div>}
    {!state.done ? <p className="p-4 text-sm text-mute" role="status">Loading…</p>
      : !state.data ? <div className="space-y-3 p-4 text-sm" role="alert"><p>Data is temporarily unavailable.</p><button className={btnGhost} onClick={state.retry}>Retry</button></div>
      : <>{state.failed && <p className="px-4 pt-3 text-xs text-mute" role="status">Could not refresh. Showing the last data received.</p>}{children(state.data)}</>}
  </section>;
}

const price = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 4 : 2 }).format(value);
const pct = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const time = (iso: string) => `${new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`;

export function MoversPanel({ refreshKey, onPick, selectedTicker }: { refreshKey: number; onPick: (ticker: string) => void; selectedTicker?: string }) {
  const state = useApi<MarketMovers>("/api/v1/market-movers", 60000, 0, undefined, refreshKey);
  return <Panel title="Market movers" id="market-movers" state={state}>{(data) => <>
    <p className="px-4 py-3 text-xs text-mute">Latest session · {time(data.asOf)}. Gainers and losers: Alpaca SIP screener.</p>
    <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
      {([{ title: "Top gainers", rows: data.gainers, range: false }, { title: "Top losers", rows: data.losers, range: false }, { title: "Widest intraday swings", rows: data.ranges, range: true }]).map((group) => <div key={group.title} className="min-w-0 p-3">
        <h3 className="mb-2 text-sm font-medium">{group.title}</h3>
        {group.range && <p className="mb-2 text-xs leading-relaxed text-mute">{data.feed.toUpperCase()} high–low range ÷ previous close. Ranked across {data.rangeUniverseSize} screened stocks.</p>}
        {group.rows.length === 0 ? <p className="py-3 text-sm text-mute">No session data available yet.</p> : <table className="w-full text-left text-xs">
          <caption className="sr-only">{group.title}</caption>
          <thead className="text-mute"><tr><th scope="col" className="py-2 font-normal">Stock</th><th scope="col" className="text-right font-normal">Price</th><th scope="col" className="text-right font-normal">{group.range ? "Range" : "Change"}</th></tr></thead>
          <tbody>{group.rows.slice(0, 6).map((row) => <tr key={row.ticker} className="border-t border-line">
            <th scope="row" className="font-normal"><button onClick={() => onPick(row.ticker)} aria-pressed={row.ticker === selectedTicker} className="inline-flex min-h-11 min-w-11 items-center font-mono underline decoration-line-strong hover:decoration-text" title={`View ${row.ticker} sentiment, news and available score history`}>{row.ticker}</button></th>
            <td className="text-right font-mono">{price(row.price)}</td>
            <td className={`text-right font-mono ${group.range ? "" : row.changePct >= 0 ? "text-up" : "text-down"}`}>{group.range && "rangePct" in row ? `${Number(row.rangePct).toFixed(2)}%` : pct(row.changePct)}</td>
          </tr>)}</tbody>
        </table>}
      </div>)}
    </div>
    <p className="border-t border-line px-4 py-3 text-xs text-mute">Intraday range measures observed price swings; it is a volatility proxy across the screened candidates.</p>
  </>}</Panel>;
}

export function NewsPanel({ ticker, refreshKey }: { ticker?: string; refreshKey: number }) {
  const state = useApi<StockNews>(ticker ? `/api/v1/tickers/${ticker}/news` : "/api/v1/news", 60000, 0, undefined, refreshKey);
  return <Panel title={ticker ? `${ticker} stock news` : "Daily market news"} id={ticker ? "stock-news" : "daily-news"} state={state}>{(data) => <>
    <p className="px-4 py-3 text-xs text-mute">Last 24 hours · Alpaca news · checked {time(data.asOf)}</p>
    {data.items.length === 0 ? <p className="px-4 pb-4 text-sm text-mute">No recent headlines{ticker ? ` for ${ticker}` : ""}.</p> : <ul className="max-h-96 overflow-y-auto">
      {data.items.map((item) => <li key={item.id} className="border-t border-line px-4 py-3">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm leading-relaxed underline decoration-line-strong underline-offset-4 hover:decoration-text">{item.title}</a>
        <p className="mt-1 text-xs text-mute">{item.source} · <time dateTime={item.publishedAt} title={time(item.publishedAt)}>{age(item.publishedAt)}</time></p>
      </li>)}
    </ul>}
  </>}</Panel>;
}

export function SentimentPanel({ ticker, refreshKey }: { ticker: string; refreshKey: number }) {
  const [sample, setSample] = useState("top");
  return <SentimentResults key={sample} ticker={ticker} refreshKey={refreshKey} sample={sample} controls={<>
    <label htmlFor="sentiment-sample" className="mb-2 block text-xs text-mute">Posts to analyze</label>
    <select id="sentiment-sample" value={sample} onChange={(event) => setSample(event.target.value)} className="h-11 w-full min-w-0 border border-line-strong bg-bg px-3 text-base focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <option value="top">Top posts · last 24 hours</option>
      <option value="latest">Most recent · last 24 hours</option>
      <option value="stream">Live stream · last 60 minutes</option>
    </select>
  </>} />;
}

function SentimentResults({ ticker, refreshKey, sample, controls }: { ticker: string; refreshKey: number; sample: string; controls: ReactNode }) {
  const state = useApi<Sentiment>(`/api/v1/tickers/${ticker}/sentiment?sample=${sample}`, sample === "stream" ? 15000 : 60000, 0, undefined, refreshKey);
  return <Panel title={`${ticker} Bluesky sentiment`} id="stock-sentiment" state={state} controls={controls}>{(data) => <div className="space-y-3 p-4 text-sm">
    <p className="text-xs text-mute">Financial DistilRoBERTa · pretrained model · local inference</p>
    {!data.enabled ? <p>Sentiment collection is disabled.</p> : data.modelStatus === "loading" ? <p role="status">Loading the sentiment model. The first run downloads its weights.</p>
      : data.modelStatus === "error" ? <p role="alert">The sentiment model is unavailable. No sentiment has been estimated.</p>
      : <>
        <p className="text-xs text-mute">{data.sample ? `${data.sample.sort === "top" ? "Top-ranked" : "Most recent"} matching posts · last 24 hours · checked ${time(data.asOf)}` : `${data.streamConnected ? "Bluesky connected" : "Bluesky reconnecting"} · last ${data.windowMinutes} minutes`}</p>
        {data.sample && <p className="text-xs text-mute">Classified {data.total} matching posts from {data.sample.examined} search results. Up to 25 posts per sample.</p>}
        {data.total === 0 ? <p>{data.sample ? `No matching stock posts found for ${ticker} in this search sample.` : `No classified posts for ${ticker} in this window. Newly selected stocks collect posts from this point forward.`}</p> : <dl className="grid grid-cols-3 gap-3">
          {([["Positive", data.positive], ["Neutral", data.neutral], ["Negative", data.negative]] as const).map(([label, count]) => <div key={label}><dt className="text-xs text-mute">{label}</dt><dd className="mt-1 font-mono text-xl">{count}</dd></div>)}
        </dl>}
        {data.lastPostAt && <p className="text-xs text-mute">Last classified post {age(data.lastPostAt)}.</p>}
        {data.sample && <a href={`https://bsky.app/search?q=${encodeURIComponent(`$${ticker}`)}&sort=${data.sample.sort}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs underline underline-offset-4">View search on Bluesky</a>}
      </>}
    <p className="border-t border-line pt-3 text-xs leading-relaxed text-mute">This model classifies financial-language tone. Risk scores use rules-v1. The pump-detection LightGBM model remains an offline training pipeline.</p>
    {data.dropped > 0 && <p className="text-xs text-mute">{data.dropped} posts skipped during processing limits.</p>}
  </div>}</Panel>;
}
