import { createServer } from "node:http";
import next from "next";
import { applySecurityHeaders, isApiRequest, sanitizeForwardingHeaders } from "./server-headers.mjs";
import { serveMockApi } from "./mock-api.mjs";
import { loadRootEnv } from "./env.cjs";
import { createMarketMoversLoader } from "./market-movers.mjs";
import { createQuotesLoader } from "./market-quotes.mjs";
import { createStockNewsLoader } from "./stock-news.mjs";
import { createNewsSentimentLoader } from "./news-sentiment.mjs";
import { createBlueskySentiment } from "./bluesky-sentiment.mjs";
import { createContextApi } from "./context-api.mjs";
import { createBlueskySearch } from "./bluesky-search.mjs";
import { createPaperApi } from "./paper-api.mjs";
import { createAssistantApi } from "./assistant-api.mjs";

loadRootEnv();
const mode = process.env.DATA_MODE ?? "mock";
if (mode !== "mock" && mode !== "live") throw new Error("DATA_MODE must be mock or live");
const watchlist = (process.env.WATCHLIST ?? "GME,AMC,SNDL").split(",").map((t) => t.trim()).filter((t) => /^[A-Z]{1,5}$/.test(t));
const credentials = { keyId: process.env.ALPACA_KEY_ID, secretKey: process.env.ALPACA_SECRET_KEY };
const sentiment = createBlueskySentiment({ watchlist, enabled: mode === "live" && process.env.SENTIMENT_ENABLED === "true" });
const loadQuotes = createQuotesLoader({ ...credentials, feed: process.env.ALPACA_FEED ?? "iex" });
const contextApi = createContextApi({
  loadMovers: createMarketMoversLoader({ ...credentials, feed: process.env.ALPACA_FEED ?? "iex", watchlist }),
  loadNews: createNewsSentimentLoader({ loadNews: createStockNewsLoader(credentials), enabled: process.env.NEWS_SENTIMENT_ENABLED === "true" }), sentiment,
  loadQuotes,
  loadRecentSentiment: createBlueskySearch({ sentiment }),
});

// RESEARCH_ORIGIN is the private lookup and paper-trading service; unset means those routes answer 503.
// In live mode (your own machine) paper fills use the Alpaca quote read here; mock mode lets the service price them.
const paper = createPaperApi({ origin: process.env.RESEARCH_ORIGIN?.replace(/\/$/, ""), mode, loadQuotes });

// The research assistant (Gemini, or the rule-based mock when there is no key) lives in the same private service.
// This door validates and rate-limits first (2 KB JSON, 300 characters, 5 per minute per client, 30 overall).
const assistant = createAssistantApi({ origin: process.env.RESEARCH_ORIGIN?.replace(/\/$/, "") });

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const app = next({ dev, webpack: true, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const server = createServer((request, response) => {
  // Next's stock proxy preserves caller-provided forwarding headers. Set them from the actual socket instead.
  sanitizeForwardingHeaders(request);
  applySecurityHeaders(response);
  if (isApiRequest(request.url)) {
    if (assistant(request, response)) return;
    if (paper(request, response)) return; // before the mock branch: the service labels its own data mode
    if (mode === "mock") return serveMockApi(request, response);
    response.setHeader("X-Pumpwatch-Data-Mode", "live");
    if (contextApi(request, response)) return;
  }
  handle(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
server.on("upgrade", (request, socket, head) => {
  sanitizeForwardingHeaders(request);
  app.getUpgradeHandler()(request, socket, head);
});
server.on("error", (error) => {
  console.error(`Unable to start Pumpwatch: ${error.message}`);
  app.close().finally(() => process.exit(1));
});
server.listen(port, hostname, () => {
  console.log(`Pumpwatch ready on port ${port} (${mode} data)`);
  void sentiment.start();
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    sentiment.stop();
    server.close(() => app.close().then(() => process.exit(0)));
    server.closeAllConnections(); // SSE must not keep the port open during shutdown.
  });
}
