import { createServer } from "node:http";
import next from "next";
import { isApiRequest, sanitizeForwardingHeaders } from "./server-headers.mjs";
import { serveMockApi } from "./mock-api.mjs";
import { loadRootEnv } from "./env.cjs";
import { createMarketMoversLoader } from "./market-movers.mjs";
import { createStockNewsLoader } from "./stock-news.mjs";
import { createBlueskySentiment } from "./bluesky-sentiment.mjs";
import { createContextApi } from "./context-api.mjs";
import { createBlueskySearch } from "./bluesky-search.mjs";

loadRootEnv();
const mode = process.env.DATA_MODE ?? "mock";
if (mode !== "mock" && mode !== "live") throw new Error("DATA_MODE must be mock or live");
const watchlist = (process.env.WATCHLIST ?? "GME,AMC,SNDL").split(",").map((t) => t.trim()).filter((t) => /^[A-Z]{1,5}$/.test(t));
const credentials = { keyId: process.env.ALPACA_KEY_ID, secretKey: process.env.ALPACA_SECRET_KEY };
const sentiment = createBlueskySentiment({ watchlist, enabled: mode === "live" && process.env.SENTIMENT_ENABLED === "true" });
const contextApi = createContextApi({
  loadMovers: createMarketMoversLoader({ ...credentials, feed: process.env.ALPACA_FEED ?? "iex", watchlist }),
  loadNews: createStockNewsLoader(credentials), sentiment,
  loadRecentSentiment: createBlueskySearch({ sentiment }),
});

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const app = next({ dev, webpack: true, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const server = createServer((request, response) => {
  // Next's stock proxy preserves caller-provided forwarding headers. Set them from the actual socket instead.
  sanitizeForwardingHeaders(request);
  if (isApiRequest(request.url)) {
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
