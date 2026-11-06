const NOTICE = "Risk signal only. Not investment advice. Pumpwatch is a non-commercial project.";

// These reads stay on the web host so provider credentials never reach the browser.
export function createContextApi({ loadMovers, loadNews, sentiment, loadRecentSentiment }) {
  return (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const match = /^\/api\/v1\/tickers\/([^/]+)\/(news|sentiment)$/.exec(url.pathname);
    if (!match && !["/api/v1/news", "/api/v1/market-movers"].includes(url.pathname)) return false;
    const json = (status, data, error) => {
      if (response.destroyed || response.writableEnded) return;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Pumpwatch-Data-Mode", "live");
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ notice: NOTICE, mode: "live", ...(error ? { error } : { data }) }));
    };
    if (request.method !== "GET") { response.setHeader("Allow", "GET"); json(405, null, "Read-only API"); return true; }
    if (url.searchParams.has("runId") || (match && !/^[A-Z]{1,5}$/.test(match[1]))) { json(400, null, "Invalid context request"); return true; }
    const sample = url.searchParams.get("sample") ?? "stream";
    if (match?.[2] === "sentiment" && !["stream", "top", "latest"].includes(sample)) { json(400, null, "Invalid sentiment sample"); return true; }
    Promise.resolve().then(() => match ? match[2] === "news" ? loadNews(match[1]) : sample === "stream" ? sentiment.snapshot(match[1]) : loadRecentSentiment(match[1], sample)
      : url.pathname === "/api/v1/news" ? loadNews(null) : loadMovers())
      .then((data) => json(200, data), () => { response.setHeader("Retry-After", "5"); json(503, null, "Data is temporarily unavailable"); });
    return true;
  };
}
