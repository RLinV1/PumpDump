# Research service

This private Python service supplies two features to Pumpwatch's `/live` terminal:

1. **Stock lookup** (`src/portfolio_risk/lookup.py`): one ticker's snapshot, price performance, SMAs, RSI, 52-week range, beta and volatility, from the pure numpy/pandas code in `risk/`.
2. **Flag assistant**: a bounded Gemini agent with read-only MCP tools, a local Chroma knowledge library, a labelled mock fallback and evaluation gates.

`api/service.py` is a private FastAPI service. Only `web/server.mjs` talks to it; it publishes no port. See `docs/` in the repo root and `openspec/changes/focus-research-on-flags/`.

There is no broker integration or real-money trading. The assistant cannot place orders and never gives buy or sell advice: it explains flags and risk.

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
| `RESEARCH_DATA_DIR` | `research/data` | Price cache and database directory. |
| `USE_MOCK_LLM` | `auto` | Use Gemini when a key is present; `1` forces the mock agent. |
| `GEMINI_API_KEY` | empty | Local server-side Gemini key. Never sent to the browser. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Gemini model identifier. |
| `PUMPWATCH_API_URL` | unset | Web host used by the pump-risk and social-sentiment tools. |

Fill prices are decided by the service: mock mode uses the mock close the lookup shows; live mode needs a quote from the web server's Alpaca read and refuses the order without one.

## Upgrading an existing checkout

The service directory, Compose service and configuration use `research` and `RESEARCH_*`.
