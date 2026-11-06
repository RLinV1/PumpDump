import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuotesLoader, parseSymbols } from "../market-quotes.mjs";
import { createContextApi } from "../context-api.mjs";
import { serveMockApi } from "../mock-api.mjs";
import * as api from "../lib/api.ts";

const snap = (price, prev, { today = "2026-10-29T15:00:00Z", prevDay = "2026-10-28T04:00:00Z" } = {}) => ({
  latestTrade: { p: price, t: today },
  dailyBar: { t: "2026-10-29T04:00:00Z", c: price },
  prevDailyBar: { t: prevDay, c: prev },
});

function upstream(snapshots) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json(snapshots);
  };
  return { calls, fetchImpl };
}
const loader = (fetchImpl, extra = {}) => createQuotesLoader({ fetchImpl, keyId: "key", secretKey: "secret", feed: "iex", ...extra });

test("parses, de-duplicates, sorts and caps symbols", () => {
  assert.deepEqual(parseSymbols("GME,AMC,GME"), ["AMC", "GME"]);
  for (const bad of [null, "", "gme", "GME,", "TOOLONG", "../x", Array.from({ length: 31 }, (_, i) => "A" + String.fromCharCode(65 + i % 26) + String.fromCharCode(65 + Math.floor(i / 26))).join(",")]) {
    assert.equal(parseSymbols(bad), null, String(bad));
  }
});

test("builds quotes from snapshots with server-side keys and the configured feed", async () => {
  const { calls, fetchImpl } = upstream({ GME: snap(24.5, 20), AMC: snap(3, 4) });
  const data = await loader(fetchImpl, { feed: "sip" })("GME,AMC");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, "/v2/stocks/snapshots");
  assert.equal(calls[0].url.searchParams.get("symbols"), "AMC,GME");
  assert.equal(calls[0].url.searchParams.get("feed"), "sip");
  assert.equal(calls[0].options.headers["APCA-API-KEY-ID"], "key");
  const gme = data.quotes.find((q) => q.ticker === "GME");
  assert.equal(gme.price, 24.5);
  assert.ok(Math.abs(gme.changePct - 22.5) < 1e-9);
  assert.ok(data.quotes.find((q) => q.ticker === "AMC").changePct < 0);
});

test("drops symbols without a usable trade or previous close instead of inventing figures", async () => {
  const { fetchImpl } = upstream({
    OK: snap(10, 8),
    NOTRD: { dailyBar: { t: "2026-10-29T04:00:00Z", c: 3 }, prevDailyBar: { t: "2026-10-28T04:00:00Z", c: 3 } },
    NOPRV: { latestTrade: { p: 5, t: "2026-10-29T15:00:00Z" }, dailyBar: { t: "2026-10-29T04:00:00Z", c: 5 } },
    ZERO: snap(0, 3),
  });
  const data = await loader(fetchImpl)("OK,NOTRD,NOPRV,ZERO,GONE");
  assert.deepEqual(data.quotes.map((q) => q.ticker), ["OK"]);
});

test("shares in-flight reads and caches per symbol set for 15 seconds", async () => {
  const { calls, fetchImpl } = upstream({ GME: snap(24.5, 20) });
  let now = 0;
  const load = loader(fetchImpl, { now: () => now });
  const [a, b] = await Promise.all([load("GME"), load(["GME"])]);
  assert.strictEqual(a, b);
  now = 14999;
  assert.strictEqual(await load("GME"), a);
  assert.equal(calls.length, 1);
  now = 15000;
  await load("GME");
  assert.equal(calls.length, 2);
});

test("rejects bad symbols before calling upstream, and sanitizes upstream failures with a cooldown", async () => {
  let calls = 0;
  let now = 0;
  let broken = true;
  const load = loader(async () => {
    calls++;
    if (broken) return new Response("private upstream test-secret", { status: 503 });
    return Response.json({ GME: snap(24.5, 20) });
  }, { now: () => now });
  await assert.rejects(load("../etc"), { message: "Invalid symbols" });
  assert.equal(calls, 0);
  await assert.rejects(load("GME"), { message: "Quotes unavailable" });
  await assert.rejects(load("GME"), { message: "Quotes unavailable" });
  assert.equal(calls, 1);
  now = 5000;
  broken = false;
  assert.equal((await load("GME")).quotes.length, 1);
  await assert.rejects(loader(async () => Response.json([]))("GME"), { message: "Quotes unavailable" });
});

test("has a five-second deadline that aborts the upstream request, and needs credentials", async () => {
  let signal;
  const start = Date.now();
  await assert.rejects(loader((_url, options) => { signal = options.signal; return new Promise(() => {}); })("GME"), { message: "Quotes unavailable" });
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - start < 6500);
  let calls = 0;
  await assert.rejects(createQuotesLoader({ fetchImpl: async () => { calls++; }, keyId: "", secretKey: "" })("GME"), { message: "Quotes unavailable" });
  assert.equal(calls, 0);
});

function reply() {
  const out = { headers: {}, status: 0, body: "" };
  return Object.assign(out, {
    setHeader(k, v) { out.headers[k] = v; }, writeHead(s) { out.status = s; }, end(b) { out.body = JSON.parse(b); },
  });
}

test("HTTP route validates symbols and never leaks upstream detail", async () => {
  const handle = createContextApi({ loadMovers: async () => {}, loadNews: async () => {}, loadQuotes: async (s) => { if (s[0] === "BAD") throw new Error("PRIVATE"); return { asOf: "x", feed: "iex", quotes: [] }; }, sentiment: {}, loadRecentSentiment: async () => {} });
  for (const url of ["/api/v1/quotes", "/api/v1/quotes?symbols=", "/api/v1/quotes?symbols=gme", "/api/v1/quotes?symbols=GME,../x"]) {
    const r = reply();
    assert.equal(handle({ url, method: "GET" }, r), true);
    assert.equal(r.status, 400, url);
  }
  const ok = reply();
  handle({ url: "/api/v1/quotes?symbols=GME", method: "GET" }, ok);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(ok.status, 200);
  const failed = reply();
  handle({ url: "/api/v1/quotes?symbols=BAD", method: "GET" }, failed);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(failed.status, 503);
  assert.ok(!JSON.stringify(failed.body).includes("PRIVATE"));
});

test("mock counterpart is labelled mock and passes the browser validator", async () => {
  const r = reply();
  serveMockApi({ url: "/api/v1/quotes?symbols=GME,ZZZ", method: "GET", headers: {} }, r);
  assert.equal(r.headers["X-Pumpwatch-Data-Mode"], "mock");
  assert.equal(r.body.mode, "mock");
  assert.equal(r.body.data.feed, "mock");
  assert.equal(r.body.data.quotes.length, 2);
  const bad = reply();
  serveMockApi({ url: "/api/v1/quotes?symbols=nope", method: "GET", headers: {} }, bad);
  assert.equal(bad.status, 400);
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(r.body), { headers: { "X-Pumpwatch-Data-Mode": "mock" } });
  try { assert.equal((await api.get("/api/v1/quotes?symbols=GME,ZZZ")).data.quotes.length, 2); } finally { globalThis.fetch = original; }
  globalThis.fetch = async () => Response.json({ notice: "n", mode: "live", data: { asOf: "2026-10-29T15:00:00Z", feed: "iex", quotes: [{ ticker: "GME", price: -1, changePct: 0, prevClose: 1, at: "2026-10-29T15:00:00Z" }] } });
  try { await assert.rejects(api.get("/api/v1/quotes?symbols=GME"), { message: "Invalid API data" }); } finally { globalThis.fetch = original; }
});
