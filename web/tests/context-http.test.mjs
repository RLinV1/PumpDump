import assert from "node:assert/strict";
import { test } from "node:test";
import { createContextApi } from "../context-api.mjs";

function response() { return { headers: {}, setHeader(k,v) { this.headers[k]=v; }, writeHead(status, headers) { this.status=status; Object.assign(this.headers,headers); }, end(body) { this.body=JSON.parse(body); this.writableEnded=true; } }; }
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("context routes are read-only, validate tickers and keep replay data separate", async () => {
  let reads=0;
  const handle=createContextApi({ loadMovers: async()=>{reads++;return {};}, loadNews:async()=>{reads++;return {};}, sentiment:{snapshot:()=>({})} });
  for(const [url,method,status] of [["/api/v1/market-movers","POST",405],["/api/v1/tickers/bad/news","GET",400],["/api/v1/news?runId=replay","GET",400]]) {
    const res=response();assert.equal(handle({url,method},res),true);await flush();assert.equal(res.status,status);
  }
  assert.equal(reads,0);assert.equal(handle({url:"/api/v1/watchlist",method:"GET"},response()),false);
});
test("context routes return public live envelopes and sanitize provider failures", async () => {
  const handle=createContextApi({loadMovers:async()=>{throw new Error("PRIVATE_PROVIDER_TOKEN");}, loadNews:async(ticker)=>({ticker,items:[]}),sentiment:{snapshot:ticker=>({ticker})}});
  const res=response(); handle({url:"/api/v1/tickers/AAPL/news",method:"GET"},res);await flush();assert.equal(res.status,200);assert.equal(res.body.mode,"live");assert.equal(res.body.data.ticker,"AAPL");
  const failed=response();handle({url:"/api/v1/market-movers",method:"GET"},failed);await flush();assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed.body).includes("PRIVATE_PROVIDER_TOKEN"));
});

test("sentiment routes select recent top/latest samples or the live stream and reject unknown filters", async () => {
  const reads = [];
  const handle = createContextApi({ loadRecentSentiment: async (ticker, sort) => { reads.push([ticker, sort]); return { ticker }; }, sentiment: { snapshot: (ticker) => { reads.push([ticker, "stream"]); return { ticker }; } } });
  for (const sample of ["top", "latest", "stream"]) {
    const res = response(); handle({ url: `/api/v1/tickers/AMC/sentiment?sample=${sample}`, method: "GET" }, res); await flush();
    assert.equal(res.status, 200);
  }
  assert.deepEqual(reads, [["AMC", "top"], ["AMC", "latest"], ["AMC", "stream"]]);
  const invalid = response(); handle({ url: "/api/v1/tickers/AMC/sentiment?sample=invalid", method: "GET" }, invalid); await flush();
  assert.equal(invalid.status, 400);
  assert.equal(reads.length, 3);
});
