// Public doors to the private lookup and paper-trading service (research/api/service.py):
//   GET  /api/v1/lookup/:ticker     one ticker's snapshot, performance, indicators and risk
//   GET  /api/v1/paper/account      cash, positions, P&L and order history for the caller's token
//   POST /api/v1/paper/orders       { side, ticker, qty }  simulated market order
//   POST /api/v1/paper/reset        { confirm: true }      back to the starting cash
// Each validates input and rate-limits per client before anything is forwarded. The browser never sends a price: in live
// mode (your own machine) this server reads its own Alpaca quote and passes it on; in mock mode the service prices it.
const NOTICE = "Simulated paper trading with no real orders. Not investment advice.";
const TICKER = /^[A-Z]{1,5}$/;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const MAX_BODY = 1024;
const MAX_QTY = 10_000;
const WINDOW_MS = 60_000;
const LIMITS = { read: { client: 60, all: 600 }, write: { client: 20, all: 300 } };
const MAX_TRACKED = 5000;
const MAX_MARKS = 30;

export function createPaperApi({ origin, mode = "mock", loadQuotes, fetchImpl = fetch, now = Date.now } = {}) {
  const buckets = { read: new Map(), write: new Map() }; // client -> request times inside the window; shortcut: in memory, resets on restart
  const totals = { read: [], write: [] };
  const allowed = (kind, client) => {
    const t = now(), hits = buckets[kind], limit = LIMITS[kind];
    totals[kind] = totals[kind].filter((x) => t - x < WINDOW_MS);
    const mine = (hits.get(client) ?? []).filter((x) => t - x < WINDOW_MS);
    if (mine.length >= limit.client || totals[kind].length >= limit.all) { hits.set(client, mine); return false; }
    if (hits.size >= MAX_TRACKED) for (const [k, v] of hits) if (!v.some((x) => t - x < WINDOW_MS)) hits.delete(k);
    mine.push(t); totals[kind].push(t); hits.set(client, mine);
    return true;
  };

  const call = async (path, { method = "GET", token, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-Paper-Token"] = token;
    const res = await fetchImpl(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  };
  const liveQuote = async (symbols) => {
    if (mode !== "live" || !loadQuotes) return {};
    try {
      const { quotes } = await loadQuotes(symbols);
      return Object.fromEntries(quotes.filter((q) => Number.isFinite(q.price) && q.price > 0).map((q) => [q.ticker, q.price]));
    } catch { return {}; }
  };

  return (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const path = url.pathname;
    if (!path.startsWith("/api/v1/lookup") && !path.startsWith("/api/v1/paper")) return false;
    const json = (status, data, error, extra = {}) => {
      if (response.destroyed || response.writableEnded) return;
      response.setHeader("Cache-Control", "no-store");
      for (const [k, v] of Object.entries(extra)) response.setHeader(k, v);
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ notice: NOTICE, ...(error ? { error } : { data }) }));
    };
    // The service's own short messages are safe to show; anything else becomes a generic line.
    const fail = (upstream, fallback) => {
      const detail = typeof upstream.json?.detail === "string" ? upstream.json.detail : null;
      const status = [400, 401, 404, 503].includes(upstream.status) && detail ? upstream.status : upstream.status === 422 ? 400 : 502;
      json(status, null, status === 502 || !detail ? fallback : detail);
    };
    const done = (upstream, extra = {}) => {
      const d = upstream.json;
      if (upstream.status !== 200 || !d || (d.dataMode !== "mock" && d.dataMode !== "live")) return fail(upstream, "Paper trading is unavailable right now.");
      json(200, d, undefined, { "X-Pumpwatch-Data-Mode": d.dataMode, ...extra });
    };
    const client = request.headers["x-forwarded-for"] ?? "unknown"; // already replaced with the real peer (server-headers.mjs)
    const token = request.headers["x-paper-token"];

    const route = async (kind, handler) => {
      if (!origin) return json(503, null, "Lookup and paper trading are not enabled");
      if (!allowed(kind, client)) return json(429, null, "Too many requests. Try again in a minute.", { "Retry-After": "60" });
      try { await handler(); } catch { json(503, null, "Paper trading is temporarily unavailable"); }
    };
    const withToken = (kind, handler) => {
      if (typeof token !== "string" || !TOKEN.test(token)) { json(401, null, "Missing or invalid paper account token"); return; }
      return route(kind, handler);
    };

    const lookup = /^\/api\/v1\/lookup\/([^/]+)$/.exec(path);
    if (lookup) {
      if (request.method !== "GET") { json(405, null, "GET only", { Allow: "GET" }); return true; }
      if (!TICKER.test(lookup[1])) { json(400, null, "A ticker is 1 to 5 capital letters"); return true; }
      void route("read", async () => {
        const up = await call(`/lookup/${lookup[1]}`);
        done(up);
      });
      return true;
    }

    if (path === "/api/v1/paper/account") {
      if (request.method !== "GET") { json(405, null, "GET only", { Allow: "GET" }); return true; }
      void withToken("read", async () => {
        let marks = {};
        if (mode === "live") {
          const held = await call("/paper/holdings", { token });
          if (held.status === 200 && Array.isArray(held.json?.tickers)) {
            marks = await liveQuote(held.json.tickers.filter((t) => TICKER.test(t)).slice(0, MAX_MARKS));
          }
        }
        done(await call("/paper/account", { method: "POST", token, body: { marks } }));
      });
      return true;
    }

    if (path === "/api/v1/paper/orders" || path === "/api/v1/paper/reset") {
      if (request.method !== "POST") { json(405, null, "POST only", { Allow: "POST" }); return true; }
      if (!/^application\/json\b/i.test(request.headers["content-type"] ?? "")) { json(415, null, "Send JSON"); return true; }
      let size = 0;
      const chunks = [];
      request.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) json(413, null, "Request too large", { Connection: "close" }); else chunks.push(chunk);
      });
      request.on("end", () => {
        if (size > MAX_BODY) return;
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* handled below */ }
        if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, null, "Send a JSON object");
        if (path === "/api/v1/paper/reset") {
          if (body.confirm !== true) return json(400, null, "Reset needs confirm: true");
          return void withToken("write", async () => done(await call("/paper/reset", { method: "POST", token, body: {} })));
        }
        const { side, ticker, qty } = body;
        if (side !== "BUY" && side !== "SELL") return json(400, null, "Side must be BUY or SELL");
        if (typeof ticker !== "string" || !TICKER.test(ticker)) return json(400, null, "A ticker is 1 to 5 capital letters");
        if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return json(400, null, `Quantity must be a whole number from 1 to ${MAX_QTY.toLocaleString("en-US")}`);
        void withToken("write", async () => {
          const payload = { side, ticker, qty };
          if (mode === "live") {
            const price = (await liveQuote([ticker]))[ticker];
            if (price === undefined) return json(503, null, `No live price is available for ${ticker}, so the order was refused`);
            payload.price = price; // our own Alpaca read; never the browser's
          }
          done(await call("/paper/orders", { method: "POST", token, body: payload }));
        });
      });
      return true;
    }
    json(404, null, "unknown endpoint");
    return true;
  };
}
