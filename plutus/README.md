# Plutus (trimmed for Pumpwatch)

This folder is the owner's Plutus project, imported with its git history and trimmed to two small features that Pumpwatch's `/live` terminal uses:

1. **Stock lookup** (`src/portfolio_risk/lookup.py`): one ticker's snapshot, price performance, SMAs, RSI, 52-week range, beta and volatility, from the pure numpy/pandas code in `risk/`.
2. **Paper trading** (`src/portfolio_risk/paper.py`): simulated buy and sell with cash, positions, P&L and order history. Whole shares, integer cents, no shorting, atomic SQLite updates, anonymous accounts identified by a random token (only its hash is stored). **Simulated only: no broker, no real orders, not investment advice.**

`api/service.py` is a private FastAPI service. Only `web/server.mjs` talks to it; it publishes no port. See `docs/` in the repo root and `openspec/changes/add-paper-trading-lookup/`.

Everything else Plutus had (AI agent, MCP server, RAG, portfolios, billing, alerts, React frontend, AWS deploy files) is removed; the git history keeps it.

## Run

```bash
cd plutus
pip install -e ".[dev]"            # Python 3.13
USE_MOCK_DATA=1 uvicorn api.service:app --port 8090
python -m pytest
ruff check .
```

| Variable | Default | Meaning |
|---|---|---|
| `USE_MOCK_DATA` | `0` (`1` in the image) | `1` = deterministic synthetic prices, no network. `0` = real yfinance lookups, for your own machine only. |
| `PAPER_DB` | `data/paper.db` | SQLite file holding the paper accounts (a named volume in Docker). |
| `PLUTUS_DATA_DIR` | `plutus/data` | Price cache and database directory. |

Fill prices are decided by the service: mock mode uses the mock close the lookup shows; live mode needs a quote from the web server's Alpaca read and refuses the order without one.
