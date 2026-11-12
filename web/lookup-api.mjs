// Public door to the private lookup service (research/api/service.py):
//   GET /api/v1/lookup/:ticker     one ticker's snapshot, performance, indicators and risk
// It validates the ticker and rate-limits per client before anything is forwarded.
const NOTICE = "Educational only. Not investment advice.";
const TICKER = /^[A-Z]{1,5}$/;
const WINDOW_MS = 60_000;
const LIMIT = { client: 60, all: 600 };
const MAX_TRACKED = 5000;

export function createLookupApi({ origin, fetchImpl = fetch, now = Date.now } = {}) {
  const hits = new Map(); // client -> request times inside the window; shortcut: in memory, resets on restart
  let all = [];
  const allowed = (client) => {
    const t = now();
    all = all.filter((x) => t - x < WINDOW_MS);
    const mine = (hits.get(client) ?? []).filter((x) => t - x < WINDOW_MS);
    if (mine.length >= LIMIT.client || all.length >= LIMIT.all) { hits.set(client, mine); return false; }
    if (hits.size >= MAX_TRACKED) for (const [k, v] of hits) if (!v.some((x) => t - x < WINDOW_MS)) hits.delete(k);
    mine.push(t); all.push(t); hits.set(client, mine);
    return true;
  };

  return (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (!path.startsWith("/api/v1/lookup")) return false;
    const json = (status, data, error, extra = {}) => {
      if (response.destroyed || response.writableEnded) return;
      response.setHeader("Cache-Control", "no-store");
      for (const [k, v] of Object.entries(extra)) response.setHeader(k, v);
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ notice: NOTICE, ...(error ? { error } : { data }) }));
    };
    const lookup = /^\/api\/v1\/lookup\/([^/]+)$/.exec(path);
    if (!lookup) { json(404, null, "unknown endpoint"); return true; }
    if (request.method !== "GET") { json(405, null, "GET only", { Allow: "GET" }); return true; }
    if (!TICKER.test(lookup[1])) { json(400, null, "A ticker is 1 to 5 capital letters"); return true; }
    if (!origin) { json(503, null, "Lookup is not enabled"); return true; }
    if (!allowed(request.headers["x-forwarded-for"] ?? "unknown")) { json(429, null, "Too many requests. Try again in a minute.", { "Retry-After": "60" }); return true; }
    void (async () => {
      try {
        const res = await fetchImpl(`${origin}/lookup/${lookup[1]}`, { signal: AbortSignal.timeout(15_000) });
        const d = await res.json().catch(() => null);
        if (res.status === 200 && d && (d.dataMode === "mock" || d.dataMode === "live")) return json(200, d, undefined, { "X-Pumpwatch-Data-Mode": d.dataMode });
        // The service's own short messages are safe to show; anything else becomes a generic line.
        const detail = typeof d?.detail === "string" ? d.detail : null;
        const status = [400, 404, 503].includes(res.status) && detail ? res.status : res.status === 422 ? 400 : 502;
        json(status, null, status === 502 || !detail ? "Lookup is unavailable right now." : detail);
      } catch { json(503, null, "Lookup is temporarily unavailable"); }
    })();
    return true;
  };
}
