## 1. Import and service

- [x] 1.1 `git subtree add --prefix=plutus` from RLinV1/Plutus main, no squash
- [x] 1.2 Add `plutus/api/assistant_service.py` (`/healthz`, `/assistant/ask`, limits, sources, notice)
- [x] 1.3 Add `plutus/Dockerfile.service` and the `plutus` compose service (apps profile, no published port, healthcheck)
- [x] 1.4 Model id to `claude-sonnet-5-5`, pin `mcp<2`, pass the environment to the MCP subprocess

## 2. Integration

- [x] 2.1 Add `get_pump_risk` to `tools.py`, the MCP server, the prompt and the mock agent routing
- [x] 2.2 Add Plutus tests with a fake Pumpwatch API (tool, agent routing, service limits, public mode)
- [x] 2.3 Add `web/assistant-api.mjs` (validation, rate limits, forward) and wire it in `web/server.mjs`
- [x] 2.4 Add `ASK <question>` to `web/lib/commands.ts` and the Assistant panel (7) to `/live`
- [x] 2.5 Add web tests: parser and the assistant route

## 3. Policy, CI and docs

- [x] 3.1 `deploy/up.sh` strips `ANTHROPIC_API_KEY` and pins the assistant to mock data and the mock agent
- [x] 3.2 Extend `scripts/license-gate.sh` to Plutus's Python dependencies, transitive included; add the CI job
- [x] 3.3 README section, `web/README.md` line, data-policy line in `docs/deploy-gcp.md`, one mock-mode screenshot

## 4. Verify

- [x] 4.1 Plutus tests, `npm test`, `npm run lint`, `npm run build`, `docker compose --profile apps config -q`
- [x] 4.2 Build the plutus image; one real request through the web route with the mock agent and `get_pump_risk`
