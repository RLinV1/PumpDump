import assert from "node:assert/strict";
import { test } from "node:test";
import { createStockNewsLoader } from "../stock-news.mjs";

const NOW = Date.parse("2026-10-30T14:00:00Z");
const article = (id, symbols = ["GME"], overrides = {}) => ({
  id, headline: `Stock news ${id}`, url: `https://www.benzinga.com/news/${id}`,
  source: "benzinga", created_at: new Date(NOW - id * 60000).toISOString(), symbols,
  content: "PRIVATE ARTICLE BODY", summary: "PRIVATE SUMMARY", author: "PRIVATE AUTHOR", ...overrides,
});
const options = { keyId: "test-key", secretKey: "test-secret", now: () => NOW };

test("stock news requests the past24hours server-side and returns only public article fields", async () => {
  const load = createStockNewsLoader({ ...options, fetchImpl: async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://data.alpaca.markets");
    assert.equal(url.pathname, "/v1beta1/news");
    assert.equal(url.searchParams.get("symbols"), "GME");
    assert.equal(url.searchParams.get("limit"), "12");
    assert.equal(url.searchParams.get("include_content"), "false");
    assert.equal(url.searchParams.get("sort"), "desc");
    assert.equal(url.searchParams.get("start"), new Date(NOW - 24 * 3600e3).toISOString());
    assert.equal(url.searchParams.has("end"), false);
    assert.equal(init.headers["APCA-API-KEY-ID"], "test-key");
    assert.equal(init.headers["APCA-API-SECRET-KEY"], "test-secret");
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ news: [article(2), article(1)] });
  } });
  const data = await load("GME");
  assert.equal(data.ticker, "GME");
  assert.equal(data.asOf, new Date(NOW).toISOString());
  assert.deepEqual(data.items.map((item) => item.id), ["1", "2"]);
  assert.deepEqual(Object.keys(data.items[0]).sort(), ["id", "publishedAt", "source", "symbols", "title", "url"]);
  assert.ok(!JSON.stringify(data).includes("PRIVATE"));
});

test("daily market news omits symbols and keeps related stock news separate", async () => {
  const requests = [];
  const load = createStockNewsLoader({ ...options, fetchImpl: async (input) => {
    requests.push(new URL(input));
    return Response.json({ news: [article(1), article(2, ["AAPL"]), article(3, [])] });
  } });
  assert.equal((await load()).ticker, null);
  assert.equal(requests[0].searchParams.has("symbols"), false);
  assert.deepEqual((await load("GME")).items.map((item) => item.id), ["1"]);
});

test("unsafe links, out-of-window or malformed articles cannot reach the public response", async () => {
  const records = [article(1), article(2, ["GME"], { url: "javascript:alert(1)" }),
    article(3, ["GME"], { url: "https://user:password@example.com/news" }),
    article(4, ["GME"], { url: "https://good.example\n@evil.example/news" }),
    article(5, ["GME"], { url: "http://example.com/news" }),
    article(6, ["GME"], { created_at: new Date(NOW - 25 * 3600e3).toISOString() }),
    article(7, ["GME"], { created_at: new Date(NOW + 60000).toISOString() }),
    article(8, ["GME"], { headline: "   " }), article(9, ["GME"], { id: {} }),
    article(10, ["GME"], { symbols: null }), null,
    article(11, ["GME", "GME", "../BAD"], { headline: "x".repeat(800), source: "s".repeat(120) }),
    article(1)];
  const load = createStockNewsLoader({ ...options, fetchImpl: async () => Response.json({ news: records }) });
  const data = await load("GME");
  assert.deepEqual(data.items.map((item) => item.id), ["1", "11"]);
  assert.deepEqual(data.items[1].symbols, ["GME"]);
  assert.equal(data.items[1].title.length, 500);
  assert.equal(data.items[1].source.length, 80);
});

test("invalid tickers and missing credentials fail before an outbound request", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json({ news: [] }); };
  const load = createStockNewsLoader({ ...options, fetchImpl });
  for (const ticker of ["gme", "../GME", "GME,AAPL", "TOOLONG", "", 3]) await assert.rejects(load(ticker), /Invalid ticker/);
  await assert.rejects(createStockNewsLoader({ fetchImpl })(), /News is not configured/);
  assert.equal(calls, 0);
});

test("concurrent reads share one fetch, cache expires and market/stock keys are independent", async () => {
  let now = NOW;
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const load = createStockNewsLoader({ ...options, now: () => now, fetchImpl: async () => {
    calls++;
    await gate;
    return Response.json({ news: [article(1)] });
  } });
  const first = load("GME");
  const second = load("GME");
  release();
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
  await load("GME");
  assert.equal(calls, 1);
  await load();
  assert.equal(calls, 2);
  now += 60001;
  await load("GME");
  assert.equal(calls, 3);
});

test("provider outages and malformed envelopes are sanitized and briefly cached", async () => {
  let now = NOW;
  let calls = 0;
  let healthy = false;
  const load = createStockNewsLoader({ ...options, now: () => now, fetchImpl: async () => {
    calls++;
    if (!healthy) throw new Error("PRIVATE provider message test-secret");
    return Response.json({ news: [] });
  } });
  await assert.rejects(load("GME"), { message: "News is temporarily unavailable." });
  await assert.rejects(load("GME"), { message: "News is temporarily unavailable." });
  assert.equal(calls, 1);
  now += 5001;
  healthy = true;
  assert.deepEqual((await load("GME")).items, []);
  assert.equal(calls, 2);
  for (const fetchImpl of [async () => new Response("PRIVATE secret", { status: 403 }),
    async () => Response.json({ news: {} }), async () => new Response("not json")]) {
    await assert.rejects(createStockNewsLoader({ ...options, fetchImpl })(), { message: "News is temporarily unavailable." });
  }
});

test("article results and the ticker cache remain bounded", async () => {
  let calls = 0;
  const load = createStockNewsLoader({ ...options, fetchImpl: async () => {
    calls++;
    return Response.json({ news: Array.from({ length: 40 }, (_, index) => article(index + 1, [])) });
  } });
  assert.equal((await load()).items.length, 12);
  for (let index = 0; index < 32; index++) await load(`A${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`);
  await load();
  assert.equal(calls, 34, "oldest key must be evicted after 31 cached keys");
});

test("a stalled upstream request has a deadline", async () => {
  const keepAlive = setTimeout(() => {}, 500);
  const load = createStockNewsLoader({ ...options, timeoutMs: 15, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }) });
  try { await assert.rejects(load(), { message: "News is temporarily unavailable." }); }
  finally { clearTimeout(keepAlive); }
});

test("a synchronous transport failure also recovers after its cooldown", async () => {
  let now = NOW;
  let calls = 0;
  const load = createStockNewsLoader({ ...options, now: () => now, fetchImpl: () => {
    calls++;
    if (calls === 1) throw new Error("private transport details");
    return Response.json({ news: [] });
  } });
  await assert.rejects(load(), /temporarily unavailable/);
  now += 5001;
  assert.deepEqual((await load()).items, []);
  assert.equal(calls, 2);
});

test("cycling stock symbols cannot exhaust the provider's per-minute request allowance", async () => {
  let now = NOW;
  let calls = 0;
  const load = createStockNewsLoader({ ...options, now: () => now, fetchImpl: () => {
    calls++;
    return Response.json({ news: [] });
  } });
  const symbol = (index) => `A${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`;
  const outcomes = [];
  for (let index = 0; index < 210; index++) outcomes.push(await load(symbol(index)).then(() => true, () => false));
  assert.ok(outcomes.some((success) => !success), "uncached requests must have a shared limit");
  assert.ok(calls < 200, "leave headroom for the app's other market-data requests");
  now += 60001;
  assert.deepEqual((await load("GME")).items, []);
});
