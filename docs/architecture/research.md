# Stock lookup and the flag assistant

The pump watch is the product. The private Python service in `research/` provides stock lookup and a read-only flag assistant around the pump panels. The assistant is a chat at the bottom right of the `/live` terminal.

- **Stock lookup.** `LOOK GME` (alias `DES GME`) fills panel 7 with the name, sector, price, daily move, market cap and P/E, price performance, SMAs, RSI, 52-week range, beta and volatility, from the pure numpy/pandas code in `research/src/portfolio_risk/risk/`.
- **One origin.** The browser only calls `/api/v1/lookup` and `/api/v1/assistant` on the web server, which validates, rate limits (per IPv4 address or IPv6 /64) and forwards to the private `research` service (apps profile, no published port). The service runs at most 3 assistant questions at once and answers 429 beyond that. Caddy is unchanged and the flag stream still bypasses Node.
- **Public data policy.** `deploy/up.sh` keeps the VM on mock data, so every public figure is labelled MOCK. Real data stays on your machine: set `DATA_MODE=live` with Alpaca keys, and `RESEARCH_USE_MOCK_DATA=0` for yfinance lookups.

Run it locally with the `apps` profile (`docker compose --profile apps up -d --build`), or without Docker: `cd research`, `pip install -e ".[dev]"` on Python 3.13, `USE_MOCK_DATA=1 uvicorn api.service:app --port 8090`, then start the web server with `RESEARCH_ORIGIN=http://127.0.0.1:8090`. CI lints all of `research/` with ruff and runs its tests on Python 3.13.

## Flag assistant (Gemini, MCP and RAG)

Each flag in the Flags panel has an "Ask about this flag" action. It opens the chat with
that ticker's score and evidence as context. You can also type `ASK Why is GME flagged?`,
or open the chat with `ASK` or `AI` and ask a general question about a ticker's risk.
The assistant explains why a ticker is or is not flagged and what the evidence means. It
frames everything as risk detection and never gives buy, sell or hold advice.
Answers identify the answering agent (Gemini or the rule-based mock), data mode,
tools used and retrieved sources. The assistant can read stock snapshots, price
performance, technical indicators, news, pump signals and sentiment. Its MCP tools are
read-only: it cannot place orders.

Docker Compose starts the private Research service and connects its tools to the web
host. Without a key it uses the mock agent. For local Gemini use, add your own
`GEMINI_API_KEY` to the root `.env`; `USE_MOCK_LLM=auto` selects Gemini when the key
is present. `GEMINI_MODEL` defaults to `gemini-3.6-flash` and can be overridden.
Set `USE_MOCK_LLM=1` to force mock answers. Restart the service after configuration
changes. Gemini failures fall back to the mock agent with an explanatory note.
Public VM deployments remove Gemini settings and force the mock agent.

The Chroma library embeds the bundled Markdown seed documents with local ONNX
all-MiniLM-L6-v2. Docker builds both this library and the pinned Financial
DistilRoBERTa sentiment model ahead of time; the first build downloads their public
weights. Social posts use FinTwitBERT plus CardiffNLP possible irony; optional news
headline tone uses Financial DistilRoBERTa. Sentiment stays separate from the rules risk score.

For a non-Docker setup on Python 3.13, install `research/` with `pip install -e ".[dev]"`,
then run these commands from that directory:

```bash
python -m portfolio_risk.rag.ingest
python -m evals.run_evals --agent mock
USE_MOCK_DATA=1 USE_MOCK_LLM=1 PUMPWATCH_API_URL=http://127.0.0.1:3000 uvicorn api.service:app --port 8090
```

Start the web host with `RESEARCH_ORIGIN=http://127.0.0.1:8090`. The evaluation gate
checks tool selection, numeric accuracy, groundedness and retrieval against checked-in
thresholds. CI builds the seed library and runs this gate with the mock agent; it
does not need Gemini credentials.

