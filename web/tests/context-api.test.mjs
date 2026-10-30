import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { get } from "../lib/api.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const at = "2026-10-30T15:00:00Z";
const row = { ticker: "AAPL", price: 200, changePct: 2 };
const movers = { asOf: at, feed: "iex", rangeUniverseSize: 20, gainers: [row], losers: [], ranges: [{ ...row, rangePct: 4, volume: 1000, at }] };
const news = { ticker: "AAPL", asOf: at, items: [{ id: "1", title: "Company reports quarterly results", url: "https://example.com/story", source: "Example", publishedAt: at, symbols: ["AAPL"] }] };
const sentiment = { ticker: "AAPL", enabled: true, model: "financial-distilroberta", modelStatus: "ready", streamConnected: true, asOf: at, windowMinutes: 60, positive: 2, negative: 1, neutral: 0, total: 3, lastPostAt: at, dropped: 0 };
function respond(data) { globalThis.fetch = async () => Response.json({ notice: "Risk signal only.", mode: "live", data }); }

test("market context accepts valid movers, news and sentiment contracts", async () => {
  for (const [path, data] of [["/api/v1/market-movers", movers], ["/api/v1/tickers/AAPL/news", news], ["/api/v1/tickers/AAPL/sentiment", sentiment], ["/api/v1/news", { ...news, ticker: null }]]) {
    respond(data);
    assert.deepEqual((await get(path)).data, data);
  }
  const search = { ...sentiment, windowMinutes: 1440, sample: { sort: "top", examined: 5 } };
  respond(search);
  assert.deepEqual((await get("/api/v1/tickers/AAPL/sentiment?sample=top")).data, search);
  await assert.rejects(get("/api/v1/tickers/AAPL/sentiment?sample=latest"), /Invalid API data/);
});

test("market context rejects unsafe links, invalid numbers and mismatched tickers", async () => {
  for (const [path, data] of [
    ["/api/v1/market-movers", { ...movers, ranges: [{ ...movers.ranges[0], rangePct: -1 }] }],
    ["/api/v1/tickers/AAPL/news", { ...news, items: [{ ...news.items[0], url: "javascript:alert(1)" }] }],
    ["/api/v1/tickers/AAPL/news", { ...news, ticker: "GME" }],
    ["/api/v1/tickers/AAPL/sentiment", { ...sentiment, total: 9 }],
    ["/api/v1/tickers/AAPL/sentiment", { ...sentiment, ticker: "GME" }],
    ["/api/v1/tickers/AAPL/sentiment", { ...sentiment, modelStatus: "made-up" }],
    ["/api/v1/tickers/AAPL/sentiment", { ...sentiment, windowMinutes: 1440, sample: { sort: "invalid", examined: 5 } }],
    ["/api/v1/tickers/AAPL/sentiment", { ...sentiment, windowMinutes: 1440, sample: { sort: "top", examined: 1 } }],
  ]) {
    respond(data);
    await assert.rejects(get(path), /Invalid API data/);
  }
});
