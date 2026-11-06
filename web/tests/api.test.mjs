import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import * as api from "../lib/api.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const score = { ticker: "GME", score: 74, modelVersion: "rules-v1", windowEnd: "2026-10-28T18:00:00Z", computedAt: "2026-10-28T18:00:01Z", staleSources: [] };
const flag = { id: 7, ticker: "GME", raisedAt: "2026-10-28T18:00:00Z", evidence: { score: 74, modelVersion: "rules-v1", topContributors: [{ featureGroup: "social", delta: 30 }], postCount: 80, tradeCount: 200, catalyst: { found: false, items: [] } } };
const timeline = { ticker: "GME", from: "2026-10-28T12:00:00Z", to: "2026-10-28T18:00:00Z", scores: [{ at: "2026-10-28T18:00:00Z", score: 74, modelVersion: "rules-v1" }], flags: [{ id: 7, at: "2026-10-28T18:00:00Z", score: 74 }] };

function serve(scores = [score], flags = [flag], history = timeline) {
  globalThis.fetch = async (url) => {
    assert.ok(String(url).startsWith("/api/v1/"), "browser API calls must use the same-origin proxy");
    assert.ok(!String(url).includes("runId"), "landing data must stay in the live run");
    const data = String(url).includes("watchlist") ? scores : String(url).includes("/timeline") ? history : flags;
    return Response.json({ notice: api.NOTICE, data });
  };
}

test("loads a real flag and its ticker history through the same-origin API", async () => {
  serve();
  const data = await api.loadLandingData();
  assert.equal(data.ticker, "GME");
  assert.equal(data.score.score, 74);
  assert.deepEqual(data.flags, [flag]);
  assert.deepEqual(data.timeline, timeline);
});

test("a quiet watchlist remains live with no invented flags", async () => {
  serve([score], []);
  const data = await api.loadLandingData();
  assert.equal(data.ticker, "GME");
  assert.deepEqual(data.flags, []);
});

test("a late-arriving older flag cannot displace the newest event", async () => {
  const older = { ...flag, id: 10, ticker: "AMC", raisedAt: "2026-10-28T17:00:00Z" };
  serve([score], [{ ...flag, id: 9 }, older]);
  const data = await api.loadLandingData();
  assert.equal(data?.ticker, "GME");
  assert.equal(data.flags[0].id, 9);
});

test("the history request shares the snapshot deadline", async () => {
  const keepAlive = setTimeout(() => {}, 200);
  serve();
  const firstFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => String(url).includes("timeline")
    ? new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }))
    : firstFetch(url, options);
  try { assert.equal(await api.loadLandingData(20), null); }
  finally { clearTimeout(keepAlive); }
});

test("a recent flag remains visible before a watchlist score exists", async () => {
  serve([], [flag]);
  const data = await api.loadLandingData();
  assert.equal(data.ticker, "GME");
  assert.equal(data.score, null);
  assert.equal(data.flags[0].evidence.postCount, 80);
});

test("empty live data preserves the simulated fallback", async () => {
  serve([], []);
  assert.equal(await api.loadLandingData(), null);
});

test("an unavailable API preserves the simulated fallback", async () => {
  globalThis.fetch = async () => new Response(null, { status: 503 });
  assert.equal(await api.loadLandingData(), null);
});

test("malformed data cannot be labeled live", async () => {
  for (const scores of [null, [{ ...score, score: 101 }], [{ ...score, ticker: "../replay" }], [{ ...score, staleSources: null }]]) {
    serve(scores, []);
    assert.equal(await api.loadLandingData(), null);
  }
  serve([score], [flag], { ...timeline, ticker: "AMC" });
  assert.equal(await api.loadLandingData(), null);
});

test("the deadline covers a stalled API request", async () => {
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  assert.equal(await api.loadLandingData(10), null);
});

test("unmount cancellation aborts pending requests", async () => {
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const controller = new AbortController();
  const loading = api.loadLandingData(2500, controller.signal);
  controller.abort();
  assert.equal(await loading, null);
});

test("mock mode is carried through the complete landing snapshot", async () => {
  serve();
  const firstFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    const response = await firstFetch(...args);
    response.headers.set("X-Pumpwatch-Data-Mode", "mock");
    return response;
  };
  assert.equal((await api.loadLandingData()).mode, "mock");
});

test("mock and live responses cannot be combined into one snapshot", async () => {
  serve();
  const firstFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const response = await firstFetch(url, options);
    response.headers.set("X-Pumpwatch-Data-Mode", String(url).includes("timeline") ? "live" : "mock");
    return response;
  };
  assert.equal(await api.loadLandingData(), null);
});

test("flag feeds sort by event time even when older flags arrive later", () => {
  const older = { ...flag, id: 10, raisedAt: "2026-10-28T17:00:00Z" };
  assert.deepEqual([older, flag].sort(api.compareFlags).map((f) => f.id), [7, 10]);
});

test("malformed stream events are ignored without losing valid flags", () => {
  for (const value of ["broken", "{}", '{"data":null}', JSON.stringify({ data: { ...flag, evidence: {} } })])
    assert.equal(api.parseFlagEvent(value), null);
  assert.deepEqual(api.parseFlagEvent(JSON.stringify({ data: flag })), flag);
});

test("dashboard reads reject malformed public data before it reaches React", async () => {
  for (const [path, data] of [
    ["/api/v1/watchlist", { ticker: "GME" }],
    ["/api/v1/watchlist", [{ ...score, staleSources: null }]],
    ["/api/v1/flags?limit=20", [{ ...flag, evidence: { ...flag.evidence, postCount: "bad" } }]],
    ["/api/v1/tickers/GME/timeline", { ...timeline, ticker: "AMC" }],
    ["/api/v1/tickers/GME/timeline", { ...timeline, scores: [{ ...timeline.scores[0], score: 101 }] }],
    ["/api/v1/tickers/GME/timeline", { ...timeline, scores: [{ ...timeline.scores[0], at: "2026-10-28T19:00:00Z" }] }],
    ["/api/v1/tickers/GME/timeline", { ...timeline, scores: [{ ...timeline.scores[0], at: "2026-10-28T17:00:00Z" }, { ...timeline.scores[0], at: "2026-10-28T16:00:00Z" }] }],
  ]) {
    globalThis.fetch = async () => Response.json({ notice: api.NOTICE, data });
    await assert.rejects(api.get(path), /Invalid API data/, path);
  }
});

test("valid zero scores and empty history remain usable", async () => {
  serve([{ ...score, score: 0 }], [], { ...timeline, scores: [], flags: [] });
  const data = await api.loadLandingData();
  assert.equal(data.score.score, 0);
  assert.deepEqual(data.timeline.scores, []);
});

test("a response cannot label an explicitly mock body as live", async () => {
  globalThis.fetch = async () => Response.json({ notice: api.NOTICE, mode: "mock", data: [score] }, { headers: { "X-Pumpwatch-Data-Mode": "live" } });
  await assert.rejects(api.get("/api/v1/watchlist"), /data mode/);
});

test("a caller cancellation signal does not disable the request deadline", async () => {
  const controller = new AbortController();
  let timer;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  try {
    const outcome = await Promise.race([
      api.get("/api/v1/watchlist", 10, controller.signal).then(() => "resolved", (error) => error.name),
      new Promise((resolve) => { timer = setTimeout(() => resolve("missed deadline"), 80); }),
    ]);
    assert.equal(outcome, "TimeoutError");
  } finally { controller.abort(); clearTimeout(timer); }
});
