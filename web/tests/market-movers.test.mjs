import assert from "node:assert/strict";
import { test } from "node:test";
import { createMarketMoversLoader } from "../market-movers.mjs";

const AS_OF = "2026-10-29T18:00:00Z";
const day = "2026-10-29T04:00:00Z";
const previous = "2026-10-28T04:00:00Z";
const mover = (symbol, percent_change, price = 10) => ({ symbol, percent_change, price });
const bar = (h = 12, l = 9, c = 11, v = 100) => ({ dailyBar: { t: day, o: 10, h, l, c, v }, prevDailyBar: { t: previous, c: 10 } });

function source({ gainers = [mover("BBB", 10), mover("AAA", 25)], losers = [mover("CCC", -4), mover("DDD", -15)], snapshots = { AAA: bar(), BBB: bar(14, 8, 12), CCC: bar(), DDD: bar() }, actives = [{ symbol: "AAA" }] } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, options });
    assert.equal(parsed.origin, "https://data.alpaca.markets");
    assert.equal(options.headers["APCA-API-KEY-ID"], "test-key");
    assert.equal(options.headers["APCA-API-SECRET-KEY"], "test-secret");
    if (parsed.pathname.endsWith("/movers")) return Response.json({ last_updated: AS_OF, gainers, losers });
    if (parsed.pathname.endsWith("/most-actives")) return Response.json({ most_actives: actives });
    assert.equal(parsed.pathname, "/v2/stocks/snapshots");
    return Response.json(snapshots);
  };
  return { calls, fetchImpl };
}

function loader(fetchImpl, extra = {}) {
  return createMarketMoversLoader({ fetchImpl, keyId: "test-key", secretKey: "test-secret", ...extra });
}

test("ranks daily gainers, losers and intraday ranges with explicit screened coverage", async () => {
  const { calls, fetchImpl } = source();
  const data = await loader(fetchImpl, { watchlist: ["AAA", "WATCH"] })();
  assert.equal(data.asOf, AS_OF);
  assert.equal(data.feed, "iex");
  assert.deepEqual(data.gainers.map((row) => row.ticker), ["AAA", "BBB"]);
  assert.deepEqual(data.losers.map((row) => row.ticker), ["DDD", "CCC"]);
  assert.equal(data.ranges[0].ticker, "BBB");
  assert.equal(data.ranges[0].rangePct, 60);
  assert.equal(data.ranges[0].changePct, 20);
  assert.equal(data.ranges[0].price, 12);
  assert.equal(data.ranges[0].volume, 100);
  assert.equal(data.ranges[0].at, day);
  assert.equal(data.rangeUniverseSize, 5);
  const snapshots = calls.find((call) => call.url.pathname.includes("snapshots"));
  assert.equal(snapshots.url.searchParams.get("feed"), "iex");
  assert.deepEqual(new Set(snapshots.url.searchParams.get("symbols").split(",")), new Set(["AAA", "BBB", "CCC", "DDD", "WATCH"]));
  assert.ok(!JSON.stringify(data).includes("test-secret"));
});

test("skips invalid movers, prior-session bars, missing bars and unusable prices", async () => {
  const good = bar();
  const { fetchImpl } = source({
    gainers: [mover("AAA", 25), mover("AAA", 20), mover("BAD/", 60), mover("INFIN", Infinity), mover("WRONG", -4)],
    losers: [mover("LOSS", -25), mover("WRONG", 5)],
    actives: ["bad", null, { symbol: "OLD" }, { symbol: "ZERO" }, { symbol: "BAD" }, { symbol: "NAN" }, { symbol: "MISS" }],
    snapshots: {
      AAA: good,
      OLD: { ...good, dailyBar: { ...good.dailyBar, t: previous } },
      ZERO: { ...good, prevDailyBar: { ...good.prevDailyBar, c: 0 } },
      BAD: { ...good, dailyBar: { ...good.dailyBar, h: 5, l: 9 } },
      NAN: { ...good, dailyBar: { ...good.dailyBar, v: -1 } },
      MISS: { dailyBar: good.dailyBar },
    },
  });
  const data = await loader(fetchImpl)();
  assert.deepEqual(data.gainers.map((row) => row.ticker), ["AAA"]);
  assert.deepEqual(data.losers.map((row) => row.ticker), ["LOSS"]);
  assert.deepEqual(data.ranges.map((row) => row.ticker), ["AAA"]);
});

test("uses the provider's New York session date instead of the UTC calendar date", async () => {
  const { fetchImpl } = source({ gainers: [mover("AAA", 2)], losers: [], snapshots: { AAA: bar() } });
  const wrapped = async (url, options) => {
    const response = await fetchImpl(url, options);
    if (!url.toString().includes("/movers?")) return response;
    return Response.json({ ...await response.json(), last_updated: "2026-10-30T00:30:00Z" });
  };
  assert.equal((await loader(wrapped)()).ranges.length, 1);
});

test("shares in-flight reads, caches success for 30 seconds and then refreshes", async () => {
  const { calls, fetchImpl } = source();
  let now = 0;
  const load = loader(fetchImpl, { now: () => now });
  const [first, concurrent] = await Promise.all([load(), load()]);
  assert.strictEqual(first, concurrent);
  assert.equal(calls.length, 3);
  now = 29999;
  assert.strictEqual(await load(), first);
  assert.equal(calls.length, 3);
  now = 30000;
  await load();
  assert.equal(calls.length, 6);
});

test("bounds the candidate request and never forwards invalid symbols", async () => {
  const { calls, fetchImpl } = source({ actives: [{ symbol: "../../secret" }, { symbol: "TSLA" }] });
  await loader(fetchImpl, { watchlist: ["AAPL", "GME", "AAPL", "../", ...Array.from({ length: 100 }, (_, i) => "A" + String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + i % 26))] })();
  const symbols = calls.find((call) => call.url.pathname.includes("snapshots")).url.searchParams.get("symbols").split(",");
  assert.ok(symbols.length <= 70);
  assert.ok(symbols.every((ticker) => /^[A-Z]{1,5}$/.test(ticker)));
  assert.equal(new Set(symbols).size, symbols.length);
});

test("rejects malformed responses and sanitizes provider errors with a short failure cooldown", async () => {
  for (const body of [null, { last_updated: "bad", gainers: [], losers: [] }, { last_updated: AS_OF, gainers: {} }]) {
    await assert.rejects(loader(async () => Response.json(body))(), { message: "Market movers unavailable" });
  }
  let calls = 0;
  let now = 0;
  let broken = true;
  const { fetchImpl } = source();
  const load = loader(async (...args) => {
    calls++;
    if (broken) throw new Error("private upstream test-secret");
    return fetchImpl(...args);
  }, { now: () => now });
  await assert.rejects(load(), { message: "Market movers unavailable" });
  const failedCalls = calls;
  await assert.rejects(load(), { message: "Market movers unavailable" });
  assert.equal(calls, failedCalls);
  now = 5000;
  broken = false;
  assert.equal((await load()).gainers[0].ticker, "AAA");
});

test("has one overall five-second deadline and aborts provider requests", async () => {
  let signal;
  const load = loader(async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  const start = Date.now();
  await assert.rejects(load(), { message: "Market movers unavailable" });
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - start < 6500);
});

test("rejects HTTP failures without exposing the provider body and requires server credentials", async () => {
  for (const status of [401, 403, 429, 503]) {
    await assert.rejects(loader(async () => new Response("private upstream test-secret", { status }))(),
      { message: "Market movers unavailable" });
  }
  let calls = 0;
  const load = createMarketMoversLoader({ fetchImpl: async () => { calls++; }, keyId: "", secretKey: "" });
  await assert.rejects(load(), { message: "Market movers unavailable" });
  assert.equal(calls, 0);
});
