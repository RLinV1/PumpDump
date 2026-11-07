## Why

Pumpwatch says when a ticker looks pumped, but a reader's next steps are "what is this stock?" and "what if I had traded it?". The owner's Research project already has the maths for the first and a ledger idea for the second. The pump watch stays the product, so only two small Research features are kept: one-ticker lookup and simulated paper trading. Everything else Research carried (an AI agent, RAG, accounts, billing, portfolios, alerts, the React app, AWS deploys) is removed; git history keeps it.

## What Changes

- Import Research into `research/` with its history (`git subtree add`, no squash), then trim it to a private service: `api/service.py`, `portfolio_risk/lookup.py`, `portfolio_risk/paper.py` and the pure numpy/pandas risk code.
- Add `LOOK <TICKER>` (alias `DES`) and a numbered Stock lookup panel (7): snapshot, price performance, SMAs, RSI, 52-week range, beta and volatility.
- Add `BUY <TICKER> <QTY>`, `SELL <TICKER> <QTY>`, `PT` and `PT RESET` (confirmed by `PT RESET CONFIRM`) and a numbered Paper trading panel (8) marked PAPER: cash, positions, P&L, order history. Simulated only: no broker, no real orders.
- Anonymous accounts: the browser makes a random token, keeps it in localStorage and sends it in `X-Paper-Token`; the service stores only its hash in SQLite on a named compose volume.
- Add the public routes `GET /api/v1/lookup/:ticker`, `GET /api/v1/paper/account`, `POST /api/v1/paper/orders` and `POST /api/v1/paper/reset` to the web server with input limits and per-client and global rate limits.
- Fill prices are decided server-side. Mock mode: the service's mock close, the same figure the lookup shows. Live mode (your own machine only): the web server's own Alpaca quote; the browser never sends a price. No price means the order is refused.
- Public data policy: `deploy/up.sh` keeps the lookup and paper service on mock data on the VM. Every figure is labelled MOCK or LIVE.
- Remove the earlier assistant (ASK command, panel 7 Assistant, `web/assistant-api.mjs`, `ANTHROPIC_API_KEY` handling) and every AWS deploy file. The CI `research` job lints the whole folder with Python 3.13 and has no AWS step.
- Out of scope: any broker or real order, shorting, fees, limit orders, sign-in, real-time streaming prices.

## Capabilities

### New Capabilities
- `paper-lookup`: One-ticker lookup and anonymous simulated paper trading from the `/live` terminal.

## Impact

- New: `research/api/service.py`, `research/src/portfolio_risk/lookup.py`, `research/src/portfolio_risk/paper.py`, `web/paper-api.mjs`, `web/components/trade-panels.tsx`, tests on both sides.
- Removed from `research/`: agent, MCP server, RAG, portfolios, billing, evals, frontend, `scripts/eb-*.sh`, `.github/`. Dependencies drop from about 20 to 6; the service image falls from about 3.7 GB to about 0.8 GB.
- Changed: `docker-compose.yml` (research service gets a `researchpaper` volume, loses the Anthropic key), `deploy/up.sh`, `.github/workflows/ci.yml`, `scripts/license-allow.txt` (torch line removed; peewee stays because yfinance pulls it in).
- Risk: public write routes. Mitigated by validation, rate limits, an account cap with idle expiry, atomic SQLite transactions and server-decided prices.
