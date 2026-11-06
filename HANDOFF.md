# Handoff to Codex

Written 2026-11-06. Delete this file in the PR that finishes the work.

## Where things stand

- Branch: `feat/gemini-assistant`, pushed, with `origin/main` merged in (through PR #77).
- `main` CI was green, and no PRs were open. `main` has no assistant yet, because #75 removed it.
- Docker had no containers running.

Results on this branch, before this file was added:

| Check | Result |
| --- | --- |
| `npm test` (web) | 106 of 107 pass, see task 1 |
| `npm run lint` (web) | pass |
| `npx tsc --noEmit` (web) | `app/layout.tsx(25,50)`: `LayoutProps` not found. Probably needs Next's generated types; confirm with `npm run build` |
| Plutus `pytest` | 84 pass |
| `npm run build`, evals, Docker build | not run |
| Real Gemini call | not run, no key available |

Built so far: Gemini agent with a rule-based mock fallback, MCP server, Chroma RAG store with seed documents, eval harness, `POST /assistant/ask`, `web/assistant-api.mjs`, the ASK panel, and sentiment beside the pump verdict.

## Target

The owner's final feature list for the product:

1. Stock search.
2. Paper trading.
3. Pump-and-dump watch using the financial sentiment model. This is the main feature.
4. AI assistant on Gemini, using the MCP server.
5. Eval harness with a RAG store.

Everything must run with Docker Compose and work locally.

## Tasks, in order

1. Fix `web/tests/commands.test.mjs:34`. The input `"9"` now opens panel 9 (ASK), which is intended. Replace it with an unused number.
2. Wire Gemini through config. `GEMINI_API_KEY`, `GEMINI_MODEL` and `USE_MOCK_LLM` are missing from `docker-compose.yml` (`plutus` service) and `.env.example`, so Compose always runs the mock agent.
3. **Security:** strip `GEMINI_` in `deploy/up.sh` line 15. That line copies `.env` to the public VM, and it currently keeps the key. Check `deploy/aws-up.sh` for the same gap.
4. Add the OpenSpec change for the assistant. None exists on this branch.
5. Run `python -m evals.run_evals --agent mock` and add it to the `plutus` job in `.github/workflows/ci.yml`.
6. Run `docker compose --profile apps up -d --build`. Check search, paper trading, ASK and the sentiment model download in `web/Dockerfile`.
7. Add a README section and a mock ASK screenshot. Open a PR and merge it after CI passes.
8. Prepare Vercel in a separate PR. Move the `web/server.mjs` routes into Next route handlers, serve mock data, and use `API_ORIGIN` for backend features. The Vercel CLI is not installed.

## Open questions for the owner

- "Financial distilbert" probably means the Financial DistilRoBERTa model already in `web/bluesky-sentiment.mjs`. Confirm this.
- The owner must add `GEMINI_API_KEY` to `.env`. Then confirm that the default model `gemini-3.6-flash` in `plutus/src/portfolio_risk/config.py` works.

## Cleanup after merge

- Remove this worktree (`agent-a962f8d59c33ae67e`).
- Remove `agent-a1a18fe32c6d0b978`. It is locked, so do not force it while a process holds the lock.
- The upstream repo `RLinV1/Plutus` still has an Elastic Beanstalk `deploy.yml`. Leave it unless the owner asks.

## Measured numbers for the resume

All numbers are local (Docker Desktop, 16 cores), not cloud. Re-run `load/` on the final build before quoting them.

- Read API: 438.8 req/s at 100 VUs, p95 397 ms, 0.00% errors.
- Live stream: 1,000 of 1,000 clients received flags, p95 0.9 to 1.7 s. 7,999 of 8,000 at p95 4.9 s. Hard stop near 8,190 connections.
- Kafka: 399,000 msg/s (97 MB/s) at p95 3 ms, peak 470,000 msg/s. Consume 1.02M msg/s.
- Pipeline: 164,508 ticks in about 2 minutes, against 3,507 before the pane change (about 47x). Scores were 0 in that run, probably because the test tickers are not on the watchlist. This is unconfirmed.
