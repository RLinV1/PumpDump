## Context

Plutus is the owner's Python project (`src/portfolio_risk`), imported into `plutus/` with its history. Pumpwatch must stay the product, so only stock lookup and general paper trading are kept. The terminal is the `/live` Next page served by `web/server.mjs`, which already owns validation, per-client addresses and the Alpaca quotes loader.

## Goals / Non-Goals

**Goals**
- `LOOK` and paper trading in the amber terminal without pushing the pump panels off the first screen.
- No sign-in, no user data beyond positions, safe on a public VM.

**Non-Goals**
- A broker, real orders, shorting, fees, limit orders, accounts, billing, an AI agent, RAG, the Plutus React app.
- Rewriting Plutus in Node.

## Decisions

**Keep Plutus in Python, behind web.** The risk maths (numpy/pandas) already exists and is tested. A private FastAPI app (`api/service.py`) publishes no port; only `web/server.mjs` reaches it, as with the previous assistant route.

**Anonymous accounts.** The browser creates 32 random bytes (base64url), stores them in localStorage and sends `X-Paper-Token`. The service validates the shape and stores only the SHA-256 hash. The account is created on first use. The cap is 5,000 accounts; at the cap, accounts idle for 30 days are purged first, and if none are idle new accounts get a clear 503. At most 200 orders are kept per account. Losing the token loses the account, by design.

**Ledger.** SQLite on the `plutuspaper` named volume. Money is integer cents; quantities are whole shares from 1 to 10,000 per order. Average-cost basis, realized P&L on sells, no shorting (a sell above the held quantity is refused). Every write runs inside `BEGIN IMMEDIATE`, so two concurrent orders serialise and the second sees the first's cash: a double submit cannot overspend. The client also drops a second order while one is in flight.

**Fill prices come from the server.** The browser sends side, ticker and quantity only. Mock mode: the service uses its own mock close, the number the lookup shows. Live mode (the owner's machine): `web/server.mjs` reads Alpaca through the existing quotes loader (the smaller change, since the loader, keys and cache already exist there) and passes the price in the private call; the service accepts it only in live mode and bounds it. With no price the order is refused with a message. A live fill is never invented. Lookup in live mode still uses yfinance under the existing rule.

**Public data policy.** Real market data stays on the owner's machine. `deploy/up.sh` strips Alpaca and `PLUTUS_` lines and writes `PLUTUS_USE_MOCK_DATA=1`. Every response carries `dataMode` and the web route sets `X-Pumpwatch-Data-Mode`; the panels show MOCK or LIVE, and PAPER on the trading panel.

**Routes through web.** Same shape as the removed assistant route: method and content-type checks, 1 KB body cap, strict validation (ticker `^[A-Z]{1,5}$`, integer quantity), per-client and global sliding-window limits (writes 20 per client and 300 overall per minute; reads 60 and 600), generic upstream errors, `Cache-Control: no-store`. `/api/v1/flags/stream` still goes straight to the API and Next keeps `compress: false`.

**Terminal.** Panels 1 to 6 are unchanged and stay the default view. The old Assistant slot becomes two one-row panels in the right column: 7 Stock lookup and 8 Paper trading. `PT RESET` only asks; `PT RESET CONFIRM` (or the panel's Confirm button) resets.

**CI.** The `plutus` job runs on Python 3.13 (what `pyproject.toml` requires), lints the whole folder with ruff and runs the tests; the root workflow has no AWS step.

## Risks / Trade-offs

- [Public write routes] Anyone can create accounts. Mitigated by limits, the cap and idle expiry; data is only positions.
- [Static mock prices] A mock buy then sell shows a cash round trip with zero P&L, because mock closes do not move.
- [Lost token] The account is gone. Acceptable for a simulation.
- [Live quote staleness] Alpaca's last trade can be old outside market hours; the fill uses it as is and is labelled LIVE.
- [Two mock universes] The watchlist panels use the web mock API; lookup and paper use the Python mock series, so a ticker's mock price can differ between them.
