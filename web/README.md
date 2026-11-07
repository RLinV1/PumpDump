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

`LOOK GME` (alias `DES`) shows a stock lookup in panel 7, and `BUY GME 10`, `SELL GME 10`, `PT` and `PT RESET` drive a simulated paper account in panel 8 (PAPER). `paper-api.mjs` serves `GET /api/v1/lookup/:ticker`, `GET /api/v1/paper/account`, `POST /api/v1/paper/orders` and `POST /api/v1/paper/reset`: JSON only, 1 KB bodies, ticker `^[A-Z]{1,5}$`, whole-number quantity 1 to 10,000, writes limited to 20 per minute per client (300 overall), reads 60 (600). The browser keeps a random account token in localStorage and sends it as `X-Paper-Token`; it never sends a price. Mock mode prices fills in the private Research service at `RESEARCH_ORIGIN`; live mode (your machine only) uses this server's own Alpaca quote and refuses the order when there is none. Unset `RESEARCH_ORIGIN` answers 503 and the panels show the error with Retry. See the root README.

`/live` is a terminal. Type a ticker and press Enter to select it, or a mnemonic (`WL`, `GR`, `FLAG`, `NEWS`, `SENT`, `MOV`, `LOOK`, `PT`, a panel number, `HELP`, `RF`) to jump to a panel. `ADD AMC` and `RM AMC` edit the saved watchlist, and `/` returns to the command line. Last price and change come from `GET /api/v1/quotes?symbols=A,B` (up to 30 symbols, Alpaca snapshots using the `ALPACA_FEED` feed, server-side keys, cached for 15 seconds). A symbol the provider cannot price is shown as `n/a`, never estimated. In mock mode the figures are invented and the status line and panel tags say MOCK.

Set `SENTIMENT_ENABLED=true` in live mode for local FinTwitBERT sentiment and a separate CardiffNLP possible-irony count. Set `NEWS_SENTIMENT_ENABLED=true` to enrich configured news headlines with Financial DistilRoBERTa tone. All assets are pinned and downloaded during the Docker build. See [source-specific sentiment](../ml/LIVE-SENTIMENT.md) for cache, limits, deletion handling and the measured mistakes. Tone counts are separate from the rules risk score; real-world accuracy is not established.

The Default, Monitor, Research and Trading workspace presets choose focused panel layouts. Customize workspace shows/hides and reorders panels with keyboard-accessible controls. Layouts persist locally; Restore default resets them; commands reveal a hidden target panel. At least one panel remains visible, and unavailable storage falls back to session-only changes with a message.

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
