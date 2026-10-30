const NOTICE = "Risk signal only. Not investment advice. Pumpwatch is a non-commercial project.";
const SYMBOLS = ["GME", "AMC", "SNDL"];
const SCORE = [74, 66, 32];
const iso = (time) => new Date(time).toISOString();

function flagsAt(now) {
  return SYMBOLS.slice(0, 2).map((ticker, i) => ({
    id: Math.floor(now / 30000) * 10 + 2 - i,
    ticker, raisedAt: iso(now - (i * 15 + 3) * 60000),
    evidence: {
      score: SCORE[i], modelVersion: "mock-rules-v1",
      topContributors: [{ featureGroup: "social", delta: 30 - i * 5 }, { featureGroup: "market", delta: 24 }],
      postCount: 80 - i * 20, tradeCount: 200 + i * 100,
      catalyst: { found: false, items: [] },
    },
  }));
}

// Aggregate-only demo API. It never publishes to Kafka, persists records, or sends webhooks.
export function serveMockApi(request, response, now = Date.now()) {
  const url = new URL(request.url, "http://localhost");
  response.setHeader("X-Pumpwatch-Data-Mode", "mock");
  response.setHeader("X-Pumpwatch-Notice", NOTICE);
  response.setHeader("Cache-Control", "no-store");
  const json = (status, data, error) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ notice: NOTICE, mode: "mock", ...(error ? { error } : { data }) }));
  };
  if (request.method !== "GET") { response.setHeader("Allow", "GET"); return json(405, null, "read-only API"); }
  if (url.searchParams.has("runId")) return json(400, null, "mock data cannot be mixed with replay runs");
  if (url.pathname === "/api/v1/market-movers") {
    return json(200, { asOf: iso(now), feed: "mock", rangeUniverseSize: 3,
      gainers: [{ ticker: "GME", price: 24.5, changePct: 8.2 }], losers: [{ ticker: "AMC", price: 3.7, changePct: -4.1 }],
      ranges: [{ ticker: "GME", price: 24.5, changePct: 8.2, rangePct: 12.6, volume: 123000, at: iso(now) }] });
  }
  const context = /^\/api\/v1\/tickers\/([A-Z]{1,5})\/(news|sentiment)$/.exec(url.pathname);
  if (context?.[2] === "sentiment") {
    const sample = url.searchParams.get("sample") ?? "stream";
    if (!["top", "latest", "stream"].includes(sample)) return json(400, null, "Invalid sentiment sample");
    return json(200, { ticker: context[1], enabled: false, model: "mock", modelStatus: "disabled", streamConnected: false,
      asOf: iso(now), windowMinutes: sample === "stream" ? 60 : 1440, positive: 0, negative: 0, neutral: 0, total: 0, lastPostAt: null, dropped: 0,
      ...(sample === "stream" ? {} : { sample: { sort: sample, examined: 0 } }) });
  }
  if (url.pathname === "/api/v1/news" || context?.[2] === "news") {
    const ticker = context?.[1] ?? null;
    return json(200, { asOf: iso(now), ticker, items: [{ id: `mock-${ticker ?? "market"}`, title: `${ticker ?? "Market"} demo headline (mock data)`,
      url: "https://example.com", source: "Mock news", publishedAt: iso(now - 600000), symbols: ticker ? [ticker] : [] }] });
  }
  if (url.pathname === "/api/v1/watchlist") {
    return json(200, SYMBOLS.map((ticker, i) => ({
      ticker, score: SCORE[i], modelVersion: "mock-rules-v1", windowEnd: iso(now - 60000), computedAt: iso(now), staleSources: [],
    })));
  }
  if (url.pathname === "/api/v1/flags") {
    const limit = Number(url.searchParams.get("limit") ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return json(400, null, "limit must be between 1 and 100");
    return json(200, flagsAt(now).slice(0, limit));
  }
  if (url.pathname === "/api/v1/flags/stream") {
    let last = Number(request.headers["last-event-id"] ?? 0);
    if (!Number.isSafeInteger(last) || last < 0) return json(400, null, "invalid Last-Event-ID");
    response.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const send = (time) => {
      response.write(": mock stream\n\n");
      for (const flag of flagsAt(time).reverse()) {
        if (flag.id <= last) continue;
        response.write(`id: ${flag.id}\nevent: flag\ndata: ${JSON.stringify({ notice: NOTICE, mode: "mock", data: flag })}\n\n`);
        last = flag.id;
      }
    };
    send(now);
    const started = Date.now();
    const timer = setInterval(() => send(now + Date.now() - started), 15000);
    response.once("close", () => clearInterval(timer));
    return;
  }
  const match = /^\/api\/v1\/tickers\/([A-Z]{1,5})\/timeline$/.exec(url.pathname);
  if (match) {
    const ticker = match[1];
    const index = SYMBOLS.indexOf(ticker);
    if (index < 0) return json(404, null, "ticker not in mock watchlist");
    const to = url.searchParams.has("to") ? Date.parse(url.searchParams.get("to")) : now;
    const from = url.searchParams.has("from") ? Date.parse(url.searchParams.get("from")) : to - 21600000;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > 172800000)
      return json(400, null, "invalid time range (maximum 48 hours)");
    const count = 72;
    const scores = Array.from({ length: count + 1 }, (_, i) => ({
      at: iso(from + (to - from) * i / count),
      score: Math.round(Math.max(0, Math.min(100, SCORE[index] - (1 - i / count) * 52 + Math.sin(i / 5) * (1 - i / count) * 6))),
      modelVersion: "mock-rules-v1",
    }));
    const flags = flagsAt(now).filter((f) => f.ticker === ticker && Date.parse(f.raisedAt) >= from && Date.parse(f.raisedAt) <= to)
      .map((f) => ({ id: f.id, at: f.raisedAt, score: f.evidence.score }));
    return json(200, { ticker, from: iso(from), to: iso(to), scores, flags });
  }
  return json(404, null, "unknown endpoint");
}
