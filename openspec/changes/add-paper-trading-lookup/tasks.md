## 1. Trim Plutus

- [x] 1.1 `git subtree add --prefix=plutus` from RLinV1/Plutus main, no squash
- [x] 1.2 Remove the agent, MCP server, RAG, portfolios, billing, evals, frontend, `scripts/eb-*.sh` and `plutus/.github/`
- [x] 1.3 Keep the numpy/pandas risk code; add `lookup.py`; drop dependencies nobody imports (anthropic, mcp, chromadb, sentence-transformers, torch, scipy, redis, sqlalchemy, psycopg, pgvector, PyJWT, stripe)
- [x] 1.4 Add `paper.py` (SQLite ledger, integer cents, whole shares, atomic writes, account cap) and `api/service.py`
- [x] 1.5 Fix every ruff finding with no ignore list; remove the `torch` line from `scripts/license-allow.txt` (`peewee` stays: yfinance still installs it)

## 2. Web

- [x] 2.1 Add `web/paper-api.mjs` (validation, rate limits, live Alpaca quote, forward) and wire it in `web/server.mjs`
- [x] 2.2 Replace ASK and the Assistant panel with `LOOK`/`DES`, `BUY`, `SELL`, `PT`, `PT RESET` and panels 7 and 8
- [x] 2.3 Parser and route tests; HELP list

## 3. Deploy and CI

- [x] 3.1 `plutus` compose service with the `plutuspaper` volume; no Anthropic key
- [x] 3.2 `deploy/up.sh` keeps lookup and paper on mock data
- [x] 3.3 CI `plutus` job: Python 3.13, ruff on the whole folder, pytest, license gate; no AWS step

## 4. Verify and document

- [x] 4.1 Plutus pytest and `ruff check .` on Python 3.13, `npm test`, `npm run lint`, `npm run build`, `docker compose --profile apps config -q`
- [x] 4.2 Build the plutus image; one real buy then sell through the web route in mock mode
- [x] 4.3 README, web README, DESIGN, deploy-gcp, security review, mock screenshots
