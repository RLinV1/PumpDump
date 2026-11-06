# Proposal

## Why

Pumpwatch says when a ticker looks pumped, but a reader's next question is "why, and is that normal for this stock?". The owner's own project, Plutus, is an AI stock research assistant: an MCP tool server, RAG over plain-English profiles, a Claude agent with a zero-key mock agent, and an eval harness. Merging them gives one product where the assistant answers from Pumpwatch's real evidence and the terminal gets a way to ask.

## What Changes

- Import Plutus into `plutus/` with its full git history (`git subtree add`, no squash).
- Add a `plutus` compose service under the `apps` profile: private (no published port), healthchecked, running only a small `api/assistant_service.py` rather than the whole Plutus API.
- Add a Plutus tool `get_pump_risk` that reads Pumpwatch's own read API (score, verdict, top contributors, recent flags, catalyst). It is wired into the MCP server, the agent prompt, the mock agent routing and Plutus tests with a fake upstream.
- Add `POST /api/v1/assistant/ask` to the web server: input limits and a rate limit, then a forward to the private service. Caddy needs no change because it already sends everything except the flag stream to web.
- Add `ASK <question>` and a numbered Assistant panel (7) to the `/live` terminal with loading, error and empty states, tools used and cited sources.
- Hold the assistant to the public data policy: `deploy/up.sh` runs it on mock data and the mock agent and strips `ANTHROPIC_API_KEY`.
- Add a CI job for Plutus tests and extend the license gate to Plutus's Python dependencies, transitive ones included.
- Out of scope: serving the Plutus React frontend, accounts, billing, portfolios, paper trading, alerts, any broker integration or real orders.

## Capabilities

### New Capabilities
- `research-assistant`: Ask a question in plain English from the terminal and get an answer with the tools used and the sources cited, grounded in Pumpwatch's risk data, with limits that protect the owner's Claude credits.

### Modified Capabilities
<!-- None. -->

## Impact

- New: `plutus/` (imported), `plutus/Dockerfile.service`, `plutus/api/assistant_service.py`, `plutus/tests/test_pump_risk.py`, `web/assistant-api.mjs`, `web/components/assistant-panel.tsx`.
- Changed: `docker-compose.yml`, `deploy/up.sh`, `web/server.mjs`, `web/lib/commands.ts`, `web/lib/api.ts`, `web/components/live-view.tsx`, `scripts/license-gate.sh`, `.github/workflows/ci.yml`, README.
- Plutus changes: model id `claude-sonnet-4-6` to `claude-sonnet-5-5`; `mcp` pinned below 2 (mcp 2 removes the `FastMCP` import the server uses); the stdio MCP subprocess now inherits the environment, which the SDK default dropped.
- Image size: the assistant image carries CPU torch, chromadb and a MiniLM model for RAG, so it is large and slower to build than the Java images.
- Plutus's own `.github/workflows` and Elastic Beanstalk scripts stay inside `plutus/`, where GitHub does not run workflows.
