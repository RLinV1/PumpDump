# Research service

This private Python service supplies three features to Pumpwatch's `/live` terminal:

1. **Stock lookup** (`src/portfolio_risk/lookup.py`): one ticker's snapshot, price performance, SMAs, RSI, 52-week range, beta and volatility, from the pure numpy/pandas code in `risk/`.
2. **Paper trading** (`src/portfolio_risk/paper.py`): simulated buy and sell with cash, positions, P&L and order history. Whole shares, integer cents, no shorting, atomic SQLite updates, anonymous accounts identified by a random token (only its hash is stored). **Simulated only: no broker, no real orders, not investment advice.**
3. **Research assistant**: a bounded Gemini agent with read-only MCP tools, a local Chroma knowledge library, a labelled mock fallback and evaluation gates.

`api/service.py` is a private FastAPI service. Only `web/server.mjs` talks to it; it publishes no port. See `docs/` in the repo root and `openspec/changes/add-paper-trading-lookup/`.

There is no broker integration or real-money trading. The assistant cannot place orders.

## Run

```bash
cd research
pip install -e ".[dev]"            # Python 3.13
USE_MOCK_DATA=1 uvicorn api.service:app --port 8090
python -m pytest
ruff check .
python -m portfolio_risk.rag.ingest
python -m evals.run_evals --agent mock
```

| Variable | Default | Meaning |
|---|---|---|
| `USE_MOCK_DATA` | `0` (`1` in the image) | `1` = deterministic synthetic prices, no network. `0` = real yfinance lookups, for your own machine only. |
| `PAPER_DB` | `data/paper.db` | SQLite file holding the paper accounts (a named volume in Docker). |
| `RESEARCH_DATA_DIR` | `research/data` | Price cache and database directory. |
| `USE_MOCK_LLM` | `auto` | Use Gemini when a key is present; `1` forces the mock agent. |
| `GEMINI_API_KEY` | empty | Local server-side Gemini key. Never sent to the browser. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Gemini model identifier. |
| `PUMPWATCH_API_URL` | unset | Web host used by the pump-risk and social-sentiment tools. |

Fill prices are decided by the service: mock mode uses the mock close the lookup shows; live mode needs a quote from the web server's Alpaca read and refuses the order without one.

## Upgrading an existing checkout

The service directory, Compose service and configuration now use `research` and `RESEARCH_*`. Update local environment files and deployment overrides accordingly. Compose uses the `researchpaper` volume; it does not automatically discover a database stored under an earlier volume name. Before starting the renamed service, stop the previous service, back up its SQLite database, and copy the complete data directory into an empty `researchpaper` volume. Verify the database checksum and account access before removing any original volume. Keep the same Compose project name and browser account token.

For an existing optional AWS deployment, review the Terraform rename as a resource migration before applying it; this change does not apply infrastructure or move cloud data.
