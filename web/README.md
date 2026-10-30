# Pumpwatch web

From this directory run `npm ci`, then `npm run dev`. Open [localhost:3000](http://localhost:3000).

## Mock and live data

The repository root `.env` controls the data source. It is copied from `.env.example` for local development and stays out of Git:

```dotenv
DATA_MODE=mock
```

`mock` is the default and needs no keys, Docker or backend processes. It serves a three-ticker watchlist, aggregate flag evidence, six-hour score timelines and a resumable SSE flag stream. Both the landing panel and `/live` dashboard explicitly say **Mock data. No market feed connected.** Mock records never enter Kafka, Postgres, alerts or training data.

To connect the real backend later:

1. Add your `ALPACA_KEY_ID` and `ALPACA_SECRET_KEY` to the root `.env` without putting secrets in chat or Git. Complete the source verification recorded in `docs/data-sources.md`, then enable the intended connectors (`ALPACA_ENABLED=true` for trades).
2. Start Kafka, Postgres, connectors, pipeline and API with `scripts/dev-up.sh --apps` from the repository root.
3. Set `DATA_MODE=live` in the root `.env`, restart the web server and reload the page.

`live` exclusively proxies the real API. It never substitutes mock API records. The landing panel remains the explicitly labeled simulation while no valid live snapshot is available; `/live` shows the connection or empty-data state. Credentials alone do not produce scores: ingestion must run long enough to close the configured feature windows. Only enable a source after its terms are verified.

The default private API upstream is `http://127.0.0.1:8083`. Override the server-only `API_ORIGIN` in the root `.env` or `web/.env.local` before building and starting Next.js. Use `http://api:8083` inside the Compose network. Rebuild/restart after changing the upstream. `NEXT_PUBLIC_API_URL` is no longer used.

Use the supplied `npm run dev` and `npm start` commands: their server replaces caller-supplied forwarding headers with the actual socket address. The API trusts only loopback proxies by default; set `API_TRUSTED_PROXIES` to the private web host's exact address when deploying separately. Keep the API private. If placing another reverse proxy in front of the web host, configure trusted client-address handling at that boundary before public deployment; the default server keys visitors by its direct socket peers.

## Loading and performance

The dashboard's **Refresh all** button reloads the watchlist, selected ticker history, flags and context panels. The environment template includes 20 tickers; keep `WATCHLIST` within your market-data plan's symbol limit.

Use **Add stock** in the watchlist to save up to 30 ticker symbols in this browser. Symbols are normalized to uppercase; duplicate or malformed entries show a message. The saved list persists on reload and can be edited with each row's remove control. Selecting an added stock opens its news and starts sentiment collection. Stocks without backend coverage show **No risk score yet**. Personal watchlists do not change the shared market-data subscription, which is configured through `WATCHLIST` on the server. Browser storage must be available to save changes; this feature has no account or cross-device sync.

**Today's movers** ranks daily price changes and intraday ranges from the screened symbols and labels that coverage. Stock news follows the selected ticker; daily market news is shown separately. These reads use Alpaca credentials only on the server and report provider failures without invented results.

Set `SENTIMENT_ENABLED=true` in live mode to run the local Bluesky sentiment classifier. It downloads its pinned model on first use and exposes rolling positive/neutral/negative counts. See [live sentiment](../ml/LIVE-SENTIMENT.md) for the model, cache, limits and deletion handling. This model's sentiment counts are separate from the rules risk score; its accuracy on Bluesky posts has not been established.

The sentiment panel defaults to **Top posts · last 24 hours**. **Most recent · last 24 hours** changes the search ranking, while **Live stream · last 60 minutes** shows only retained streaming samples. Searches use Bluesky's `api.bsky.app` endpoint, check at most 50 results, filter ticker relevance, remove duplicate post URIs and classify at most 25 matching posts. Only aggregate counts are cached, for one minute. The panel reports the actual classified/returned counts and links to the corresponding Bluesky search. A failed search shows an unavailable state instead of zero sentiment; results from different samples are never combined.

The landing shell and labeled simulation render before any API call. API code is imported after the first painted frame, and the live/mock panel is loaded only for a complete snapshot. Snapshot requests share a 2.5-second deadline and poll every 30 seconds without overlap. No real and simulated values share a market panel. A quiet watchlist stays connected and explicitly says there are no recent flags.

Only aggregate evidence is rendered: scores, counts, model versions, catalyst status and feature-group contributions. No post text or author names are displayed. The live panel shows no invented volatility forecast.

Dashboard requests have a six-second deadline, retain the last good data on failure, and retry failures after five seconds. Flag history refreshes when the stream connects or reconnects; concurrent refresh requests are coalesced. Successful reads return to their normal polling interval. The landing panel shows score and flag age beside their timestamps.

The dev/build commands use Next's webpack mode to avoid a Windows Turbopack CSS-worker startup failure; the existing Tailwind loader runs in both engines. The decorative hero scroll effect reuses GSAP instead of loading a second animation runtime.

## Validation

Use Node 22.13+ (CI uses Node 22):

```sh
npm test
npm run lint
npm run build
npm start
```

Tests use Node's built-in runner with TypeScript stripping and local HTTP/SSE listeners; no test dependency is required. Running the tests requires Node 22.6+.
