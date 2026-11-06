# Design

## Context

Plutus is a Python project: `src/portfolio_risk` holds about 20 tools (market data via yfinance, RAG over seed documents with Chroma and MiniLM, portfolio, paper trading, alerts), a FastMCP server, a Claude agent and a rule-based mock agent that needs no key, an eval harness, and a FastAPI app with Clerk auth, Stripe billing and a React frontend. Pumpwatch is Java services plus a Next.js terminal with a custom `web/server.mjs`, which already answers some `/api` routes itself and proxies the rest to the private API.

## Goals / Non-Goals

**Goals:**
- One product: the terminal asks, the assistant answers from Pumpwatch evidence, both directions real.
- Keep Plutus history; do not touch the Plutus repository.
- Obey the public data policy and protect the owner's Claude credits.

**Non-Goals:**
- Serving the Plutus React app, accounts, billing, portfolios, paper trading, alerts.
- Rewriting Plutus in Java or Node.

## Decisions

**Subtree import, no squash.** `git subtree add --prefix=plutus` keeps all 47 Plutus commits. Its `.github/workflows` (a CI file and an Elastic Beanstalk deploy) sit at `plutus/.github/workflows`, which GitHub ignores, so nothing from it runs here. Its `scripts/eb-*.sh` are unused.

**A second, tiny FastAPI app instead of `api.server`.** The existing Plutus API mixes portfolios, billing, admin and websockets and trusts a Clerk token for identity. Exposing it would publish per-user data paths to an anonymous internet. `api/assistant_service.py` has `GET /healthz` and `POST /assistant/ask` only, runs with `PLUTUS_PUBLIC=1` (portfolio tools hidden from Claude and refused by the mock agent), and holds no database.

**Routing through the web server, not Caddy.** `web/server.mjs` already owns validation and per-client addresses (`server-headers.mjs` rewrites `x-forwarded-for` from the real peer). Putting `/api/v1/assistant/ask` there keeps one place for limits and means Caddy is unchanged: `/api/v1/flags/stream` still goes straight to the API and Next keeps `compress: false`. The route is handled before the mock branch because it labels its own data mode.

**Limits in two places.** The web route: JSON only, body at most 2 KB, question at most 300 characters with no control characters, 5 questions per minute per client, 30 per minute overall, 45 second upstream timeout. The service repeats the length limit and caps 30 agent runs per minute, so a bug or a second caller cannot drain credits. Rate state is in memory and resets on restart; that is enough for one VM.

**`get_pump_risk` reads the web server, not the Java API.** The tool calls `/api/v1/watchlist` and `/api/v1/flags?limit=100` on `PUMPWATCH_API_URL` (`http://web:3000`). In mock mode the web server answers those itself, in live mode it proxies to the Java API, so the assistant always agrees with the panels and inherits their `mode` field. Verdict thresholds (35 and 65) mirror `web/lib/verdict.ts`. Top contributors and the catalyst result exist only on flags, so a ticker without a flag returns them empty. A ticker with a flag but no watchlist row returns `tracked: false` with the flag's score.

**Data policy.** `deploy/up.sh` strips `ANTHROPIC_API_KEY`, `USE_MOCK_*` and `PLUTUS_*` from the copied `.env` and appends `PLUTUS_USE_MOCK_DATA=1` and `PLUTUS_USE_MOCK_LLM=1`. Compose passes only `ANTHROPIC_API_KEY` into the container, never the whole `.env`. On the owner's machine, set `ANTHROPIC_API_KEY` for real Claude and `PLUTUS_USE_MOCK_DATA=0` for live yfinance data.

**Plutus fixes forced by the code.** `config.MODEL` was `claude-sonnet-4-6`; it is now `claude-sonnet-5-5` (one line). `mcp>=1.2` resolved to mcp 2, which removed `mcp.server.fastmcp`, so the pin is `<2`. The MCP stdio client used the SDK's default environment, which drops `USE_MOCK_DATA` and `PUMPWATCH_API_URL`; it now passes `os.environ`.

**CI.** A `plutus` job installs CPU-only torch (the default Linux wheel pulls gigabytes of CUDA libraries, whose licences the gate would also have to judge), runs the Plutus tests and runs the license gate. Ruff runs only on files added here: the imported code has about 130 older findings that this change does not fix.

**Images.** `Dockerfile.service` bakes the Chroma index and the MiniLM model into the image, so the container needs no network to answer. The image is large because of torch.

## Risks / Trade-offs

- [Large image, slow first build] torch, chromadb and sentence-transformers dominate. Mitigation: dependency layer is cached; a later change could drop to a keyword retriever.
- [Prompt injection through news text in real Claude mode] Headlines come from a third party. Mitigation: no write tools exist in the public service, the public VM never runs real Claude, answers are plain text rendered without HTML.
- [Rate limits reset on restart] Acceptable for one VM; a restart loop is the only way to dodge them, and the global spend cap in the service still applies per process.
- [Plutus frontend not served] Portfolio, paper trading, alerts, billing and sign-in are unreachable from the terminal. Listed in the README for the owner to decide.
